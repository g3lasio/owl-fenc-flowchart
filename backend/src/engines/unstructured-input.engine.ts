import { OpenAIClient } from '../services/openai.client';
import { AnthropicClient } from '../services/anthropic.client';
import { MaterialSupplierService } from '../services/material-supplier.service';
import { ProjectDetails, ProjectImage } from '../interfaces/flow-manager.interfaces';
import { Location, ProjectResult } from '../interfaces/fence.interfaces';
import { config } from '../config/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Motor para procesar entradas no estructuradas como fotografías y notas
 * Utiliza OCR y análisis de visión por computadora para detectar elementos relevantes
 * y convertirlos en datos estructurados para el motor DeepSearch
 */
export class UnstructuredInputEngine {
  private readonly SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  private readonly SUPPORTED_PROJECT_TYPES = [
    'fencing', 'decking', 'roofing', 'concrete', 'patio', 'pergola', 'gazebo', 'retaining_wall', 
    'bathroom_remodel', 'kitchen_remodel', 'complete_remodel', 'property_renovation', 'window_replacement',
    'door_installation', 'siding_installation', 'flooring_installation'
  ];
  
  constructor(
    private readonly openAIClient: OpenAIClient,
    private readonly anthropicClient: AnthropicClient,
    private readonly materialSupplierService: MaterialSupplierService
  ) {
    this.validateConfiguration();
  }
  
  /**
   * Valida que la configuración necesaria exista
   */
  private validateConfiguration(): void {
    if (!config.openai.apiKey) {
      console.warn('⚠️ OpenAI API key no configurada. Funcionalidad de análisis de imágenes limitada.');
    }
    
    if (!config.anthropic.apiKey) {
      console.warn('⚠️ Anthropic API key no configurada. Funcionalidad de análisis de notas limitada.');
    }
  }
  
  /**
   * Procesa imágenes y notas para extraer información estructurada del proyecto
   * @param images Lista de imágenes del proyecto
   * @param notes Notas del contratista sobre el proyecto
   * @param location Ubicación del proyecto
   * @returns Datos estructurados del proyecto para procesamiento en DeepSearch
   */
  async processUnstructuredInput(
    images: ProjectImage[],
    notes: string,
    location: Location
  ): Promise<{
    projectType: string;
    projectSubtype: string;
    dimensions: Record<string, number>;
    options: Record<string, any>;
    detectedElements: Record<string, any>;
    materialAvailability?: any;
    recommendedProducts?: any[];
    purchaseOrderDraft?: any;
  }> {
    try {
      console.log('Procesando entrada no estructurada...');
      
      // Validar entrada
      if (!images || images.length === 0) {
        throw new Error('Se requiere al menos una imagen para el análisis');
      }
      
      // 1. Procesar imágenes con OCR y visión por computadora 
      const imageAnalysisResults = await this.processImages(images);
      
      // 2. Procesar notas del contratista
      const notesAnalysisResult = await this.processContractorNotes(notes);
      
      // 3. Combinar resultados y determinar el tipo de proyecto
      const combinedAnalysis = this.combineAnalysisResults(imageAnalysisResults, notesAnalysisResult);
      
      // 4. Extraer dimensiones y características
      const {
        projectType,
        projectSubtype,
        dimensions,
        options,
        detectedElements
      } = await this.extractStructuredData(combinedAnalysis, location);
      
      // 5. NUEVO: Si el proyecto es de ventanas u otros tipos específicos, realizar análisis especializado
      let materialAvailability = null;
      let recommendedProducts = [];
      let purchaseOrderDraft = null;
      
      if (projectType === 'window_replacement' || 
          combinedAnalysis.aggregatedFindings.projectType?.includes('window') ||
          combinedAnalysis.aggregatedFindings.projectType?.includes('ventana')) {
        
        // Analizar detalladamente las ventanas en las imágenes
        const windowDetails = await this.analyzeWindowsInImages(images, combinedAnalysis);
        
        // Buscar materiales específicos disponibles en tiempo real
        const materialsResult = await this.findAvailableMaterials(
          'window', 
          windowDetails, 
          location
        );
        
        materialAvailability = materialsResult.availability;
        recommendedProducts = materialsResult.recommendedProducts;
        purchaseOrderDraft = this.generatePurchaseOrderDraft(windowDetails, materialsResult);
        
        // Añadir detalles específicos de las ventanas a los elementos detectados
        detectedElements.windows = windowDetails;
      }
      
      return {
        projectType,
        projectSubtype,
        dimensions,
        options,
        detectedElements,
        materialAvailability,
        recommendedProducts,
        purchaseOrderDraft
      };
      
    } catch (error) {
      console.error('Error en análisis de entrada no estructurada:', error);
      throw new Error(`Error procesando imágenes y notas: ${error.message}`);
    }
  }
  
  /**
   * Procesa las imágenes utilizando OCR y análisis de visión por IA
   * @param images Imágenes a analizar
   * @returns Resultados del análisis de imágenes
   */
  private async processImages(images: ProjectImage[]): Promise<any[]> {
    // Procesar múltiples imágenes en paralelo
    const analysisPromises = images.map(async (image, index) => {
      try {
        // Validar tipo de imagen
        if (!this.SUPPORTED_IMAGE_TYPES.includes(image.mimeType)) {
          console.warn(`Tipo de imagen no soportado: ${image.mimeType}. Saltando.`);
          return null;
        }
        
        // Leer imagen desde filesystem o URL
        const imageData = image.data || await this.loadImageFromPath(image.path);
        
        // Utilizar la API de visión de OpenAI para analizar la imagen
        const analysisResult = await this.openAIClient.analyzeImage({
          image: imageData,
          prompt: `
          Analiza esta imagen de un proyecto de construcción o renovación y extrae toda la información relevante.
          
          Identifica:
          1. Tipo de proyecto (cerca, techo, remodelación de baño, cocina, etc.)
          2. Materiales presentes o necesarios
          3. Dimensiones visibles o estimadas (largo, ancho, altura, área)
          4. Condiciones del área (terreno, estado actual, demolición necesaria)
          5. Características específicas (estilo, acabados, elementos especiales)
          6. Obstáculos o consideraciones especiales
          
          Proporciona datos precisos en formato estructurado, incluyendo medidas con unidades adecuadas.
          `
        });
        
        return {
          imageIndex: index,
          analysis: analysisResult,
          imagePath: image.path
        };
      } catch (error) {
        console.error(`Error procesando imagen ${index}:`, error);
        return {
          imageIndex: index,
          error: error.message,
          imagePath: image.path
        };
      }
    });
    
    const results = await Promise.all(analysisPromises);
    return results.filter(result => result !== null);
  }
  
  /**
   * Carga una imagen desde una ruta de archivo
   */
  private async loadImageFromPath(imagePath: string): Promise<string> {
    try {
      const imageBuffer = fs.readFileSync(imagePath);
      return imageBuffer.toString('base64');
    } catch (error) {
      console.error(`Error cargando imagen desde ${imagePath}:`, error);
      throw new Error(`No se pudo cargar la imagen: ${error.message}`);
    }
  }
  
  /**
   * Procesa las notas del contratista para extraer información relevante
   * @param notes Notas del contratista
   * @returns Análisis estructurado de las notas
   */
  private async processContractorNotes(notes: string): Promise<any> {
    if (!notes || notes.trim() === '') {
      return { isEmpty: true };
    }
    
    try {
      // Usar Claude Opus para análisis de texto detallado
      const analysisPrompt = `
      Analiza las siguientes notas de un contratista sobre un proyecto y extrae toda la información relevante en formato estructurado.
      
      NOTAS DEL CONTRATISTA:
      ${notes}
      
      Extrae la siguiente información en formato JSON:
      1. "projectType": tipo de proyecto (cerca, techo, remodelación, etc.)
      2. "projectSubtype": subtipo o material principal (vinilo, madera, asfalto, etc.)
      3. "dimensions": cualquier medida mencionada (longitud, altura, área, etc.)
      4. "materialRequirements": materiales necesarios o preferidos
      5. "specialConsiderations": consideraciones especiales, obstáculos o requerimientos
      6. "demolitionNeeded": si se requiere demolición (true/false)
      7. "clientPreferences": preferencias del cliente mencionadas
      
      Responde SOLO con el JSON, sin texto adicional.
      `;
      
      const notesAnalysis = await this.anthropicClient.complete({
        prompt: analysisPrompt,
        model: 'claude-opus',
        maxTokens: 1500,
        temperature: 0.2
      });
      
      // Parsear el resultado como JSON
      try {
        return JSON.parse(notesAnalysis.trim());
      } catch (parseError) {
        console.error('Error parseando análisis de notas:', parseError);
        // Intentar extraer solo la parte JSON si hay texto adicional
        const jsonMatch = notesAnalysis.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        throw new Error('No se pudo parsear el análisis de notas como JSON');
      }
    } catch (error) {
      console.error('Error analizando notas del contratista:', error);
      return {
        error: true,
        message: error.message
      };
    }
  }
  
  /**
   * Combina los resultados del análisis de imágenes y notas
   */
  private combineAnalysisResults(imageAnalysis: any[], notesAnalysis: any): any {
    const combined = {
      fromImages: imageAnalysis,
      fromNotes: notesAnalysis,
      aggregatedFindings: {}
    };
    
    // Identificar el tipo de proyecto más probable
    const projectTypes = new Map();
    
    // Añadir tipos de proyecto detectados en las imágenes
    imageAnalysis.forEach(img => {
      if (img.analysis && img.analysis.projectType) {
        const type = img.analysis.projectType.toLowerCase();
        projectTypes.set(type, (projectTypes.get(type) || 0) + 2); // Doble peso para imágenes
      }
    });
    
    // Añadir tipo de proyecto de las notas
    if (notesAnalysis.projectType) {
      const type = notesAnalysis.projectType.toLowerCase();
      projectTypes.set(type, (projectTypes.get(type) || 0) + 3); // Triple peso para notas
    }
    
    // Determinar el tipo con mayor confianza
    let highestConfidence = 0;
    let mostLikelyType = null;
    
    projectTypes.forEach((confidence, type) => {
      if (confidence > highestConfidence) {
        highestConfidence = confidence;
        mostLikelyType = type;
      }
    });
    
    combined.aggregatedFindings.projectType = mostLikelyType || 'unknown';
    
    // Agregar otros datos relevantes
    combined.aggregatedFindings.dimensions = {};
    combined.aggregatedFindings.materials = {};
    combined.aggregatedFindings.conditions = {};
    combined.aggregatedFindings.specialConsiderations = [];
    
    // Extraer dimensiones y otros datos
    // Primero de las notas (mayor prioridad)
    if (notesAnalysis.dimensions) {
      combined.aggregatedFindings.dimensions = { ...notesAnalysis.dimensions };
    }
    
    if (notesAnalysis.materialRequirements) {
      combined.aggregatedFindings.materials = { ...notesAnalysis.materialRequirements };
    }
    
    if (notesAnalysis.specialConsiderations) {
      combined.aggregatedFindings.specialConsiderations = 
        Array.isArray(notesAnalysis.specialConsiderations) 
          ? notesAnalysis.specialConsiderations 
          : [notesAnalysis.specialConsiderations];
    }
    
    // Complementar con datos de las imágenes
    imageAnalysis.forEach(img => {
      if (!img.analysis) return;
      
      // Añadir dimensiones detectadas en imágenes si no están en notas
      if (img.analysis.dimensions) {
        Object.entries(img.analysis.dimensions).forEach(([key, value]) => {
          if (!combined.aggregatedFindings.dimensions[key]) {
            combined.aggregatedFindings.dimensions[key] = value;
          }
        });
      }
      
      // Agregar materiales detectados
      if (img.analysis.materials) {
        Object.entries(img.analysis.materials).forEach(([key, value]) => {
          if (!combined.aggregatedFindings.materials[key]) {
            combined.aggregatedFindings.materials[key] = value;
          }
        });
      }
      
      // Agregar condiciones detectadas
      if (img.analysis.conditions) {
        Object.entries(img.analysis.conditions).forEach(([key, value]) => {
          combined.aggregatedFindings.conditions[key] = value;
        });
      }
    });
    
    return combined;
  }
  
  /**
   * Extrae datos estructurados para el motor DeepSearch
   */
  private async extractStructuredData(
    combinedAnalysis: any,
    location: Location
  ): Promise<{
    projectType: string;
    projectSubtype: string;
    dimensions: Record<string, number>;
    options: Record<string, any>;
    detectedElements: Record<string, any>;
  }> {
    // Mapeo de tipos de proyecto detectados a tipos soportados por el motor
    const detectedProjectType = combinedAnalysis.aggregatedFindings.projectType || 'unknown';
    
    // Normalizar tipo de proyecto
    let normalizedProjectType = this.normalizeProjectType(detectedProjectType);
    
    // Si no podemos determinar el tipo, consultar a la IA para obtener la mejor coincidencia
    if (normalizedProjectType === 'unknown' && Object.keys(combinedAnalysis.aggregatedFindings).length > 0) {
      normalizedProjectType = await this.inferProjectTypeFromAnalysis(combinedAnalysis);
    }
    
    // Determinar subtipo o material principal
    let projectSubtype = combinedAnalysis.fromNotes.projectSubtype || 'standard';
    
    // Extraer dimensiones relevantes y convertirlas a números
    const dimensions: Record<string, number> = {};
    const rawDimensions = combinedAnalysis.aggregatedFindings.dimensions || {};
    
    // Convertir dimensiones a formato numérico
    Object.entries(rawDimensions).forEach(([key, value]) => {
      if (typeof value === 'string') {
        // Extraer valor numérico de strings como "10 feet" o "10ft"
        const numMatch = value.toString().match(/(\d+(\.\d+)?)/);
        if (numMatch) {
          dimensions[key] = parseFloat(numMatch[1]);
        }
      } else if (typeof value === 'number') {
        dimensions[key] = value;
      }
    });
    
    // Si no hay dimensiones suficientes, intentar estimarlas basado en el tipo de proyecto
    if (Object.keys(dimensions).length < 2 && normalizedProjectType !== 'unknown') {
      await this.estimateMissingDimensions(normalizedProjectType, dimensions, combinedAnalysis);
    }
    
    // Extraer opciones y configuraciones
    const options: Record<string, any> = {
      demolitionNeeded: combinedAnalysis.fromNotes.demolitionNeeded || false
    };
    
    // Añadir materiales detectados como opciones
    if (combinedAnalysis.aggregatedFindings.materials) {
      options.materials = combinedAnalysis.aggregatedFindings.materials;
    }
    
    // Añadir preferencias del cliente
    if (combinedAnalysis.fromNotes.clientPreferences) {
      options.clientPreferences = combinedAnalysis.fromNotes.clientPreferences;
    }
    
    // Guardar elementos detectados para referencia
    const detectedElements = {
      materials: combinedAnalysis.aggregatedFindings.materials || {},
      conditions: combinedAnalysis.aggregatedFindings.conditions || {},
      specialConsiderations: combinedAnalysis.aggregatedFindings.specialConsiderations || []
    };
    
    return {
      projectType: normalizedProjectType,
      projectSubtype,
      dimensions,
      options,
      detectedElements
    };
  }
  
  /**
   * Analiza específicamente ventanas en las imágenes proporcionadas
   * Detecta tamaño, tipo, estilo y condición de cada ventana
   */
  private async analyzeWindowsInImages(images: ProjectImage[], combinedAnalysis: any): Promise<any[]> {
    try {
      // Filtrar las imágenes que probablemente contengan ventanas
      const windowImages = images.filter((_, index) => {
        const imageAnalysis = combinedAnalysis.fromImages.find(img => img.imageIndex === index);
        return imageAnalysis && 
              (imageAnalysis.analysis?.containsWindow || 
               imageAnalysis.analysis?.materials?.window ||
               imageAnalysis.analysis?.projectType?.includes('window'));
      });
      
      if (windowImages.length === 0) {
        windowImages.push(images[0]); // Usar al menos una imagen si no se detectaron ventanas explícitamente
      }
      
      // Analizar cada imagen en detalle para detectar ventanas
      const windowsPromises = windowImages.map(async (image, index) => {
        try {
          // Leer imagen desde filesystem o URL
          const imageData = image.data || await this.loadImageFromPath(image.path);
          
          // Realizar análisis específico de ventanas con GPT-4o
          const analysisResult = await this.openAIClient.analyzeImage({
            image: imageData,
            prompt: `
            Analiza esta imagen que muestra ventanas en un edificio o casa. 
            Necesito que extraigas todos los detalles técnicos posibles de las ventanas, incluyendo:
            
            1. Dimensiones exactas o estimadas (ancho x alto en pulgadas o centímetros)
            2. Tipo de ventana (corredera, abatible, guillotina, fija, bahía, etc.)
            3. Material del marco (vinilo, aluminio, madera, fibra de vidrio, etc.)
            4. Tipo de vidrio (simple, doble, triple panel, low-E, etc.)
            5. Estilo arquitectónico (moderno, colonial, tradicional, etc.)
            6. Estado (nueva, usada, dañada, etc.)
            7. Características especiales (divisiones, persianas integradas, etc.)
            8. Ubicación en la casa (frente, lateral, trasera, habitación específica)
            
            Si ves múltiples ventanas, identifica cada una y proporciona los detalles anteriores para cada ventana visible.
            
            Responde en formato JSON con todos los detalles estructurados.
            `
          });
          
          // Extraer las ventanas detectadas
          let detectedWindows = [];
          try {
            // Intentar extraer el JSON de la respuesta
            const jsonMatch = analysisResult.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsedResult = JSON.parse(jsonMatch[0]);
              if (parsedResult.windows) {
                detectedWindows = parsedResult.windows;
              } else {
                detectedWindows = [parsedResult]; // Si no hay array de ventanas, asumir que toda la respuesta es una ventana
              }
            }
          } catch (parseError) {
            console.error('Error parseando análisis de ventanas:', parseError);
            // Crear estructura básica si hay error de parseo
            detectedWindows = [{
              dimensions: { width: 0, height: 0 },
              type: 'unknown',
              material: 'unknown',
              description: analysisResult
            }];
          }
          
          return detectedWindows.map(window => ({
            ...window,
            imageIndex: index,
            imagePath: image.path
          }));
        } catch (error) {
          console.error(`Error analizando ventanas en imagen ${index}:`, error);
          return [];
        }
      });
      
      // Combinar todas las ventanas detectadas
      const windowsArrays = await Promise.all(windowsPromises);
      return windowsArrays.flat();
      
    } catch (error) {
      console.error('Error en análisis de ventanas:', error);
      return [];
    }
  }
  
  /**
   * Busca materiales disponibles en tiempo real a través del servicio de proveedores
   */
  private async findAvailableMaterials(
    productCategory: string, 
    productDetails: any[], 
    location: Location
  ): Promise<{
    availability: any,
    recommendedProducts: any[]
  }> {
    try {
      // Agrupar artículos similares para optimizar búsqueda de inventario
      const groupedItems = this.groupSimilarItems(productCategory, productDetails);
      
      // Buscar disponibilidad en tiempo real con proveedores locales
      const inventoryResults = await this.materialSupplierService.checkInventoryAvailability(
        productCategory,
        groupedItems,
        location
      );
      
      // Recomendar productos específicos que mejor se adapten a los requerimientos
      const recommendations = await this.materialSupplierService.getRecommendedProducts(
        productCategory,
        productDetails,
        location
      );
      
      return {
        availability: inventoryResults,
        recommendedProducts: recommendations
      };
    } catch (error) {
      console.error('Error buscando materiales disponibles:', error);
      return {
        availability: { status: 'error', message: error.message },
        recommendedProducts: []
      };
    }
  }
  
  /**
   * Agrupa elementos similares para optimizar la búsqueda de inventario
   */
  private groupSimilarItems(category: string, itemDetails: any[]): any[] {
    const groupedItems = new Map();
    
    if (category === 'window') {
      // Agrupar ventanas por tipo y dimensiones similares
      itemDetails.forEach(window => {
        const width = window.dimensions?.width || 0;
        const height = window.dimensions?.height || 0;
        const type = window.type || 'unknown';
        const material = window.material || 'unknown';
        
        // Crear clave de agrupación - redondear dimensiones al pie más cercano para agrupar tamaños similares
        const roundedWidth = Math.round(width / 12) * 12;
        const roundedHeight = Math.round(height / 12) * 12;
        const key = `${type}-${material}-${roundedWidth}x${roundedHeight}`;
        
        if (!groupedItems.has(key)) {
          groupedItems.set(key, {
            type,
            material,
            dimensions: {
              width: roundedWidth,
              height: roundedHeight
            },
            count: 1,
            originalItems: [window]
          });
        } else {
          const group = groupedItems.get(key);
          group.count += 1;
          group.originalItems.push(window);
          groupedItems.set(key, group);
        }
      });
    } else {
      // Lógica genérica para otros tipos de productos
      itemDetails.forEach(item => {
        const key = JSON.stringify(item);
        if (!groupedItems.has(key)) {
          groupedItems.set(key, { ...item, count: 1, originalItems: [item] });
        } else {
          const group = groupedItems.get(key);
          group.count += 1;
          group.originalItems.push(item);
          groupedItems.set(key, group);
        }
      });
    }
    
    return Array.from(groupedItems.values());
  }
  
  /**
   * Genera un borrador de orden de compra basado en el análisis y los productos recomendados
   */
  private generatePurchaseOrderDraft(itemDetails: any[], materialsResult: any): any {
    const { recommendedProducts } = materialsResult;
    
    if (!recommendedProducts || recommendedProducts.length === 0) {
      return null;
    }
    
    try {
      // Crear líneas de orden para cada producto recomendado
      const orderLines = recommendedProducts.map(product => ({
        productId: product.id,
        sku: product.sku,
        description: product.name,
        quantity: product.recommendedQuantity || 1,
        unitPrice: product.price,
        totalPrice: (product.recommendedQuantity || 1) * product.price,
        supplier: product.supplier,
        estimatedDelivery: product.estimatedDelivery,
        notes: product.notes
      }));
      
      // Calcular totales
      const subtotal = orderLines.reduce((sum, line) => sum + line.totalPrice, 0);
      const estimatedTax = subtotal * 0.08; // Estimado de impuestos (8%)
      const total = subtotal + estimatedTax;
      
      // Crear el borrador de orden de compra
      return {
        orderType: 'draft',
        createdAt: new Date(),
        orderLines,
        summary: {
          totalItems: orderLines.length,
          subtotal,
          estimatedTax,
          total
        },
        suppliers: [...new Set(orderLines.map(line => line.supplier))],
        estimatedReadyDate: this.calculateEstimatedReadyDate(orderLines),
        notes: 'Borrador generado automáticamente basado en el análisis de imágenes y notas del proyecto.'
      };
    } catch (error) {
      console.error('Error generando borrador de orden de compra:', error);
      return null;
    }
  }
  
  /**
   * Calcula la fecha estimada de disponibilidad basada en las líneas de la orden
   */
  private calculateEstimatedReadyDate(orderLines: any[]): Date {
    // Encontrar la fecha de entrega más lejana
    let latestDeliveryDate = new Date();
    
    orderLines.forEach(line => {
      if (line.estimatedDelivery) {
        const deliveryDate = new Date(line.estimatedDelivery);
        if (deliveryDate > latestDeliveryDate) {
          latestDeliveryDate = deliveryDate;
        }
      }
    });
    
    // Si no hay cambio en la fecha, agregar 3 días hábiles por defecto
    if (latestDeliveryDate.getTime() === new Date().getTime()) {
      latestDeliveryDate.setDate(latestDeliveryDate.getDate() + 3);
    }
    
    return latestDeliveryDate;
  }
  
  /**
   * Normaliza el tipo de proyecto detectado a uno compatible con el sistema
   */
  private normalizeProjectType(detectedType: string): string {
    const typeMapping: Record<string, string> = {
      'fence': 'fencing',
      'fencing': 'fencing',
      'cerca': 'fencing',
      
      'deck': 'decking',
      'decking': 'decking',
      'terraza': 'decking',
      
      'roof': 'roofing',
      'roofing': 'roofing',
      'techo': 'roofing',
      
      'patio': 'patio',
      'concrete': 'concrete',
      'concreto': 'concrete',
      
      'pergola': 'pergola',
      'gazebo': 'gazebo',
      
      'retaining wall': 'retaining_wall',
      'retaining_wall': 'retaining_wall',
      'muro de contención': 'retaining_wall',
      
      'bathroom': 'bathroom_remodel',
      'bathroom remodel': 'bathroom_remodel',
      'bathroom renovation': 'bathroom_remodel',
      'remodelación de baño': 'bathroom_remodel',
      
      'kitchen': 'kitchen_remodel',
      'kitchen remodel': 'kitchen_remodel',
      'kitchen renovation': 'kitchen_remodel',
      'remodelación de cocina': 'kitchen_remodel',
      
      'renovation': 'property_renovation',
      'remodel': 'property_renovation',
      'fix and flip': 'property_renovation',
      'home renovation': 'property_renovation',
      'remodelación': 'property_renovation',
      
      'window': 'window_replacement',
      'window replacement': 'window_replacement',
      'windows': 'window_replacement',
      'replacement windows': 'window_replacement',
      'ventanas': 'window_replacement',
      'cambio de ventanas': 'window_replacement',
      'reemplazo de ventanas': 'window_replacement',
      
      'door': 'door_installation',
      'door replacement': 'door_installation',
      'doors': 'door_installation',
      'puertas': 'door_installation',
      
      'siding': 'siding_installation',
      'house siding': 'siding_installation',
      'vinyl siding': 'siding_installation',
      
      'flooring': 'flooring_installation',
      'floor': 'flooring_installation',
      'pisos': 'flooring_installation'
    };
    
    const normalizedType = detectedType.toLowerCase().trim();
    
    // Buscar coincidencia exacta
    if (typeMapping[normalizedType]) {
      return typeMapping[normalizedType];
    }
    
    // Buscar coincidencia parcial
    for (const [key, value] of Object.entries(typeMapping)) {
      if (normalizedType.includes(key)) {
        return value;
      }
    }
    
    // Verificar si ya es un tipo válido
    if (this.SUPPORTED_PROJECT_TYPES.includes(normalizedType)) {
      return normalizedType;
    }
    
    return 'unknown';
  }
  
  /**
   * Infiere el tipo de proyecto a partir del análisis combinado
   */
  private async inferProjectTypeFromAnalysis(combinedAnalysis: any): Promise<string> {
    try {
      const prompt = `
      Basado en la siguiente información recopilada de imágenes y notas de un contratista,
      determina el tipo más probable de proyecto de construcción o renovación.
      
      INFORMACIÓN DISPONIBLE:
      ${JSON.stringify(combinedAnalysis.aggregatedFindings, null, 2)}
      
      TIPOS DE PROYECTO SOPORTADOS:
      ${this.SUPPORTED_PROJECT_TYPES.join(', ')}
      
      Responde SOLAMENTE con uno de los tipos soportados que mejor coincida con la información.
      `;
      
      const inference = await this.openAIClient.complete({
        prompt,
        model: 'gpt-4o',
        maxTokens: 50,
        temperature: 0.2
      });
      
      const inferredType = inference.trim().toLowerCase();
      return this.SUPPORTED_PROJECT_TYPES.includes(inferredType) ? inferredType : 'unknown';
    } catch (error) {
      console.error('Error inferring project type:', error);
      return 'unknown';
    }
  }
  
  /**
   * Estima dimensiones faltantes basadas en el tipo de proyecto
   */
  private async estimateMissingDimensions(
    projectType: string,
    dimensions: Record<string, number>,
    analysis: any
  ): Promise<void> {
    // Implementar lógica específica por tipo de proyecto
    switch (projectType) {
      case 'fencing':
        if (!dimensions.length && !dimensions.height) {
          // Estimar dimensiones de cerca basado en información disponible
          dimensions.length = 100; // valor por defecto en pies
          dimensions.height = 6; // valor por defecto en pies
        } else if (!dimensions.length) {
          dimensions.length = 100; // valor por defecto en pies
        } else if (!dimensions.height) {
          dimensions.height = 6; // valor por defecto en pies
        }
        break;
        
      case 'decking':
        if (!dimensions.length && !dimensions.width) {
          dimensions.length = 16; // valor por defecto en pies
          dimensions.width = 12; // valor por defecto en pies
        }
        break;
        
      case 'roofing':
        if (!dimensions.area) {
          dimensions.area = 2000; // valor por defecto en pies cuadrados
        }
        break;
        
      case 'bathroom_remodel':
      case 'kitchen_remodel':
        if (!dimensions.area) {
          // Diferentes tamaños por defecto para baño y cocina
          dimensions.area = projectType === 'bathroom_remodel' ? 50 : 200; // pies cuadrados
        }
        break;
        
      case 'property_renovation':
        if (!dimensions.area) {
          dimensions.area = 1500; // valor por defecto en pies cuadrados
        }
        break;
    }
  }
}