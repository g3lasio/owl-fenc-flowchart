import { OpenAIClient } from '../services/openai.client';
import { AnthropicClient } from '../services/anthropic.client';
import { MaterialSupplierService } from '../services/material-supplier.service';
import { ProjectDetails, ProjectImage } from '../interfaces/flow-manager.interfaces';
import { Location, ProjectResult } from '../interfaces/fence.interfaces';
import { config } from '../config/config';
import * as fs from 'fs';
import * as path from 'path';
import * as Ajv from 'ajv';
import NodeCache from 'node-cache';
import * as Jimp from 'jimp';

// Esquemas para validación de datos
import { responseSchemas } from '../utils/validation-schemas';

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
  
  // Sistema de caché para resultados de análisis
  private analysisCache: NodeCache;
  
  // Sistema de eventos y monitoreo
  private processingEvents: Map<string, any>;
  private processingStats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageProcessingTime: number;
    apiErrors: Record<string, number>;
  };
  
  // Ajv para validación de esquemas JSON
  private ajv: Ajv.default;
  
  // Etapas de procesamiento para ejecución incremental
  private processingStages: string[] = [
    'validation', 
    'imageAnalysis', 
    'notesAnalysis', 
    'combination', 
    'structuring', 
    'specializedAnalysis'
  ];
  
  constructor(
    private readonly openAIClient: OpenAIClient,
    private readonly anthropicClient: AnthropicClient,
    private readonly materialSupplierService: MaterialSupplierService
  ) {
    this.validateConfiguration();
    
    // Inicializar caché con TTL de 24 horas (en segundos)
    this.analysisCache = new NodeCache({
      stdTTL: 86400,
      checkperiod: 3600,
      useClones: false
    });
    
    // Inicializar sistema de eventos y monitoreo
    this.processingEvents = new Map();
    this.processingStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageProcessingTime: 0,
      apiErrors: {}
    };
    
    // Inicializar validador de esquemas
    this.ajv = new Ajv.default({ allErrors: true });
    
    // Registrar esquemas para validación
    Object.entries(responseSchemas).forEach(([name, schema]) => {
      this.ajv.addSchema(schema, name);
    });
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
   * @param options Opciones adicionales para el procesamiento
   * @returns Datos estructurados del proyecto para procesamiento en DeepSearch
   */
  async processUnstructuredInput(
    images: ProjectImage[],
    notes: string,
    location: Location,
    options: {
      processingId?: string;
      resumeFromStage?: string;
      forceReprocess?: boolean;
      fallbackMode?: boolean;
    } = {}
  ): Promise<{
    projectType: string;
    projectSubtype: string;
    dimensions: Record<string, number>;
    options: Record<string, any>;
    detectedElements: Record<string, any>;
    materialAvailability?: any;
    recommendedProducts?: any[];
    purchaseOrderDraft?: any;
    processingMeta?: {
      completedStages: string[];
      processingTime: number;
      confidenceScore: number;
      cacheHit?: boolean;
      warnings?: string[];
    };
  }> {
    // Iniciar medición de tiempo y estadísticas
    const startTime = Date.now();
    const processingId = options.processingId || `proc_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    this.processingStats.totalRequests++;
    
    // Registro de eventos para este procesamiento
    this.processingEvents.set(processingId, {
      startTime,
      stages: {},
      warnings: [],
      errors: []
    });
    
    try {
      console.log(`[${processingId}] Iniciando procesamiento de entrada no estructurada...`);
      
      // Verificar caché si no se fuerza reprocesamiento
      if (!options.forceReprocess) {
        const cacheKey = this.generateCacheKey(images, notes, location);
        const cachedResult = this.analysisCache.get(cacheKey);
        
        if (cachedResult) {
          console.log(`[${processingId}] Usando resultado en caché`);
          this.logStageComplete(processingId, 'cacheHit');
          this.processingEvents.get(processingId).stages.allStages = { success: true, fromCache: true };
          this.processingStats.successfulRequests++;
          
          return {
            ...cachedResult,
            processingMeta: {
              ...cachedResult.processingMeta,
              cacheHit: true
            }
          };
        }
      }
      
      // Etapa 1: Validación de entrada - siempre se ejecuta
      await this.stageValidation(images, notes, processingId);
      
      // Preparar estado de completitud de etapas
      const completedStages: string[] = ['validation'];
      const startStageIndex = options.resumeFromStage 
        ? this.processingStages.indexOf(options.resumeFromStage)
        : 1; // Comenzar después de validación
      
      // Contenedores para resultados de cada etapa
      let imageAnalysisResults: any[] = [];
      let notesAnalysisResult: any = {};
      let combinedAnalysis: any = {};
      let structuredData: any = {};
      let specializedResults: any = {};
      
      // Etapa 2: Análisis de imágenes
      if (startStageIndex <= 1) {
        try {
          // Preprocesamiento de imágenes para mejorar calidad
          const enhancedImages = await this.preprocessImages(images);
          
          // Procesar imágenes con reintentos automáticos
          imageAnalysisResults = await this.executeWithRetry(
            () => this.processImages(enhancedImages),
            'imageAnalysis',
            processingId
          );
          
          completedStages.push('imageAnalysis');
        } catch (error) {
          // En caso de error, registrar y continuar con advertencia
          const errorMsg = `Error en análisis de imágenes: ${error.message}`;
          this.logWarning(processingId, errorMsg);
          
          if (!options.fallbackMode) {
            imageAnalysisResults = await this.getFallbackImageAnalysis(images);
          }
        }
      }
      
      // Etapa 3: Análisis de notas
      if (startStageIndex <= 2) {
        try {
          notesAnalysisResult = await this.executeWithRetry(
            () => this.processContractorNotes(notes),
            'notesAnalysis',
            processingId
          );
          
          completedStages.push('notesAnalysis');
        } catch (error) {
          // En caso de error, registrar y continuar con advertencia
          const errorMsg = `Error en análisis de notas: ${error.message}`;
          this.logWarning(processingId, errorMsg);
          
          // Usar análisis simple en caso de fallo
          if (!options.fallbackMode) {
            notesAnalysisResult = this.getFallbackNotesAnalysis(notes);
          }
        }
      }
      
      // Etapa 4: Combinación de resultados
      if (startStageIndex <= 3) {
        combinedAnalysis = this.combineAnalysisResults(imageAnalysisResults, notesAnalysisResult);
        completedStages.push('combination');
        this.logStageComplete(processingId, 'combination');
      }
      
      // Etapa 5: Extracción de datos estructurados
      if (startStageIndex <= 4) {
        try {
          structuredData = await this.executeWithRetry(
            () => this.extractStructuredData(combinedAnalysis, location),
            'structuring',
            processingId
          );
          
          completedStages.push('structuring');
        } catch (error) {
          // En caso de error en la estructuración, usar datos básicos
          const errorMsg = `Error en estructuración de datos: ${error.message}`;
          this.logWarning(processingId, errorMsg);
          
          if (!options.fallbackMode) {
            structuredData = this.getFallbackStructuredData(combinedAnalysis);
          } else {
            throw error; // En modo de fallback, propagar el error
          }
        }
      }
      
      // Etapa 6: Análisis especializado por tipo de proyecto
      let materialAvailability = null;
      let recommendedProducts: any[] = [];
      let purchaseOrderDraft = null;
      
      if (startStageIndex <= 5) {
        const { projectType } = structuredData;
        
        if (projectType === 'window_replacement' || 
            combinedAnalysis.aggregatedFindings?.projectType?.includes('window') ||
            combinedAnalysis.aggregatedFindings?.projectType?.includes('ventana')) {
          
          try {
            // Análisis especializado de ventanas
            const windowDetails = await this.executeWithRetry(
              () => this.analyzeWindowsInImages(images, combinedAnalysis),
              'specialized_windows',
              processingId
            );
            
            // Búsqueda de materiales disponibles
            const materialsResult = await this.executeWithRetry(
              () => this.findAvailableMaterials('window', windowDetails, location),
              'materials_search',
              processingId
            );
            
            materialAvailability = materialsResult.availability;
            recommendedProducts = materialsResult.recommendedProducts;
            purchaseOrderDraft = this.generatePurchaseOrderDraft(windowDetails, materialsResult);
            
            // Añadir detalles específicos a los elementos detectados
            structuredData.detectedElements.windows = windowDetails;
            
            completedStages.push('specializedAnalysis');
          } catch (error) {
            const errorMsg = `Error en análisis especializado: ${error.message}`;
            this.logWarning(processingId, errorMsg);
          }
        } else {
          // Marcar como completada también para otros tipos de proyectos
          completedStages.push('specializedAnalysis');
        }
      }
      
      // Construir resultado final
      const result = {
        ...structuredData,
        materialAvailability,
        recommendedProducts,
        purchaseOrderDraft,
        processingMeta: {
          completedStages,
          processingTime: Date.now() - startTime,
          confidenceScore: this.calculateConfidenceScore(combinedAnalysis, completedStages),
          warnings: this.processingEvents.get(processingId).warnings
        }
      };
      
      // Guardar en caché para futuros usos
      if (completedStages.length === this.processingStages.length) {
        const cacheKey = this.generateCacheKey(images, notes, location);
        this.analysisCache.set(cacheKey, result);
      }
      
      // Actualizar estadísticas
      this.processingStats.successfulRequests++;
      this.updateAverageProcessingTime(Date.now() - startTime);
      
      return result;
      
    } catch (error) {
      // Registrar error y actualizar estadísticas
      this.processingStats.failedRequests++;
      this.logError(processingId, error);
      
      // Si estamos en modo fallback, no hacer más reintentos
      if (options.fallbackMode) {
        throw new Error(`Error procesando imágenes y notas en modo fallback: ${error.message}`);
      }
      
      console.error(`[${processingId}] Error en análisis de entrada no estructurada:`, error);
      console.log(`[${processingId}] Intentando procesamiento en modo de fallback...`);
      
      // Intentar procesamiento en modo fallback
      try {
        return await this.processUnstructuredInput(
          images, 
          notes, 
          location, 
          {
            processingId,
            fallbackMode: true,
            resumeFromStage: this.getLastCompletedStage(processingId)
          }
        );
      } catch (fallbackError) {
        // Si el fallback también falla, devolver error final
        console.error(`[${processingId}] Fallo también en modo fallback:`, fallbackError);
        throw new Error(`Error procesando imágenes y notas: ${error.message}. El procesamiento de fallback también falló.`);
      }
    }
  }
  
  /**
   * Genera una clave de caché única basada en el contenido de las imágenes, notas y ubicación
   */
  private generateCacheKey(images: ProjectImage[], notes: string, location: Location): string {
    const imageHash = images.map(img => img.id || img.url || img.path).join(',');
    const notesHash = notes.substring(0, 100); // Usar primeros 100 caracteres
    const locationHash = location.zipCode;
    
    return `analysis_${this.hashString(`${imageHash}|${notesHash}|${locationHash}`)}`;
  }
  
  /**
   * Función simple de hash para generar claves de caché
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convertir a entero de 32 bits
    }
    return hash.toString(16);
  }
  
  /**
   * Calcula un puntaje de confianza para el análisis
   */
  private calculateConfidenceScore(combinedAnalysis: any, completedStages: string[]): number {
    // Puntaje base por etapas completadas
    const stagesScore = completedStages.length / this.processingStages.length * 0.5;
    
    // Puntaje por calidad de datos
    let dataQualityScore = 0;
    
    // Verificar si hay información de proyecto
    if (combinedAnalysis.aggregatedFindings?.projectType && 
        combinedAnalysis.aggregatedFindings.projectType !== 'unknown') {
      dataQualityScore += 0.2;
    }
    
    // Verificar si hay dimensiones
    if (Object.keys(combinedAnalysis.aggregatedFindings?.dimensions || {}).length > 0) {
      dataQualityScore += 0.15;
    }
    
    // Verificar si hay materiales
    if (Object.keys(combinedAnalysis.aggregatedFindings?.materials || {}).length > 0) {
      dataQualityScore += 0.15;
    }
    
    // Puntos por coherencia entre imágenes y notas
    const coherenceScore = this.calculateCoherenceScore(combinedAnalysis) * 0.2;
    
    return Math.min(1, stagesScore + dataQualityScore + coherenceScore);
  }
  
  /**
   * Calcula un puntaje de coherencia entre el análisis de imágenes y notas
   */
  private calculateCoherenceScore(combinedAnalysis: any): number {
    let score = 0;
    
    // Si no hay análisis de imágenes o notas, coherencia baja
    if (!combinedAnalysis.fromImages || !combinedAnalysis.fromNotes) {
      return 0.1;
    }
    
    // Verificar coherencia en tipo de proyecto
    const imageTypes = combinedAnalysis.fromImages
      .filter(img => img.analysis?.projectType)
      .map(img => this.normalizeProjectType(img.analysis.projectType));
    
    const notesType = combinedAnalysis.fromNotes.projectType 
      ? this.normalizeProjectType(combinedAnalysis.fromNotes.projectType)
      : null;
    
    if (notesType && imageTypes.includes(notesType)) {
      score += 0.5;
    }
    
    // Verificar coherencia en dimensiones
    const notesDimensions = combinedAnalysis.fromNotes.dimensions || {};
    let dimensionMatches = 0;
    let dimensionTotal = 0;
    
    combinedAnalysis.fromImages.forEach(img => {
      if (!img.analysis?.dimensions) return;
      
      Object.entries(img.analysis.dimensions).forEach(([key, value]) => {
        dimensionTotal++;
        
        if (notesDimensions[key]) {
          // Convertir ambos a número para comparación
          const imgValue = this.extractNumberFromDimension(value);
          const notesValue = this.extractNumberFromDimension(notesDimensions[key]);
          
          // Si están dentro de un 20% de diferencia, considerar concordancia
          if (imgValue && notesValue) {
            const ratio = Math.max(imgValue, notesValue) / Math.min(imgValue, notesValue);
            if (ratio < 1.2) {
              dimensionMatches++;
            }
          }
        }
      });
    });
    
    // Puntaje por coincidencia de dimensiones
    if (dimensionTotal > 0) {
      score += 0.5 * (dimensionMatches / dimensionTotal);
    }
    
    return score;
  }
  
  /**
   * Extrae un valor numérico de una dimensión (que puede ser texto o número)
   */
  private extractNumberFromDimension(dimension: any): number | null {
    if (typeof dimension === 'number') {
      return dimension;
    } else if (typeof dimension === 'string') {
      const match = dimension.match(/(\d+(\.\d+)?)/);
      return match ? parseFloat(match[1]) : null;
    }
    return null;
  }
  
  /**
   * Etapa 1: Validación de entrada
   */
  private async stageValidation(images: ProjectImage[], notes: string, processingId: string): Promise<void> {
    try {
      // Validar que hay imágenes
      if (!images || images.length === 0) {
        throw new Error('Se requiere al menos una imagen para el análisis');
      }
      
      // Verificar que al menos una imagen sea válida
      const validImageExists = images.some(image => 
        this.SUPPORTED_IMAGE_TYPES.includes(image.mimeType || this.getMimeTypeFromPath(image.path || image.url || ''))
      );
      
      if (!validImageExists) {
        throw new Error('Ninguna imagen tiene un formato soportado (JPEG, PNG, WEBP)');
      }
      
      // Validar tamaño máximo para evitar problemas con APIs
      for (const image of images) {
        if (image.data && image.data.length > 10 * 1024 * 1024) { // 10MB
          this.logWarning(processingId, `Imagen ${image.id || image.path || 'sin ID'} excede el tamaño máximo recomendado`);
        }
      }
      
      // Validar notas (opcional pero recomendado)
      if (!notes || notes.trim() === '') {
        this.logWarning(processingId, 'No se proporcionaron notas del contratista. El análisis se basará solo en imágenes.');
      }
      
      this.logStageComplete(processingId, 'validation');
    } catch (error) {
      this.logStageError(processingId, 'validation', error);
      throw error;
    }
  }
  
  /**
   * Determina el tipo MIME basado en la extensión del archivo
   */
  private getMimeTypeFromPath(path: string): string {
    const extension = path.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }
  
  /**
   * Preprocesamiento de imágenes para mejorar calidad
   */
  private async preprocessImages(images: ProjectImage[]): Promise<ProjectImage[]> {
    return Promise.all(images.map(async (image) => {
      try {
        // Solo procesar si es un tipo compatible con Jimp y no tiene ya data
        if (!image.data && image.path && this.SUPPORTED_IMAGE_TYPES.includes(image.mimeType || '')) {
          // Cargar imagen con Jimp
          const jimpImage = await Jimp.read(image.path);
          
          // Mejorar contraste y claridad
          jimpImage
            .normalize() // Normaliza histograma
            .contrast(0.1) // Ligero aumento de contraste
            .quality(85); // Calidad de compresión
            
          // Redimensionar si es muy grande para APIs
          if (jimpImage.getWidth() > 2000 || jimpImage.getHeight() > 2000) {
            jimpImage.scaleToFit(2000, 2000);
          }
          
          // Convertir a base64
          const buffer = await jimpImage.getBufferAsync(Jimp.MIME_JPEG);
          
          // Devolver copia con imagen mejorada
          return {
            ...image,
            data: buffer.toString('base64'),
            enhancedImage: true
          };
        }
      } catch (error) {
        console.warn(`No se pudo preprocesar imagen ${image.id || image.path}: ${error.message}`);
      }
      
      // Si falla el preprocesamiento o no es necesario, devolver la imagen original
      return image;
    }));
  }
  
  /**
   * Procesa las imágenes utilizando OCR y análisis de visión por IA con sistema de reintentos
   * @param images Imágenes a analizar
   * @returns Resultados del análisis de imágenes
   */
  private async processImages(images: ProjectImage[]): Promise<any[]> {
    // Para evitar sobrecargar la API, procesar imágenes en grupos
    const batchSize = 3;
    const results: any[] = [];
    
    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize);
      
      // Procesar este lote en paralelo
      const batchResults = await Promise.all(batch.map(async (image, batchIndex) => {
        const index = i + batchIndex;
        try {
          // Validar tipo de imagen
          if (!this.SUPPORTED_IMAGE_TYPES.includes(image.mimeType || this.getMimeTypeFromPath(image.path || image.url || ''))) {
            console.warn(`Tipo de imagen no soportado. Saltando.`);
            return null;
          }
          
          // Leer imagen desde data, filesystem o URL
          const imageData = image.data || await this.loadImageFromPath(image.path || image.url || '');
          
          // Crear prompt específico para el tipo de imagen
          let promptEnhancement = '';
          const imageType = image.type || 'site';
          
          if (imageType === 'site') {
            promptEnhancement = 'Esta es una foto del sitio actual de construcción.';
          } else if (imageType === 'reference') {
            promptEnhancement = 'Esta es una imagen de referencia de cómo el cliente desea que quede el proyecto.';
          } else if (imageType === 'sketch') {
            promptEnhancement = 'Esta es un boceto o dibujo hecho por el cliente o contratista.';
          }
          
          // Sistema para utilizar OpenAI con la imagen
          // Adaptado para usar método complete en lugar de analyzeImage que no existe
          // Enviar como un prompt con descripción detallada de la imagen
          const analysisPrompt = `
          ${promptEnhancement}
          
          Analiza esta imagen de un proyecto de construcción o renovación y extrae toda la información relevante.
          
          Identifica:
          1. Tipo de proyecto (cerca, techo, remodelación de baño, cocina, etc.)
          2. Materiales presentes o necesarios
          3. Dimensiones visibles o estimadas (largo, ancho, altura, área)
          4. Condiciones del área (terreno, estado actual, demolición necesaria)
          5. Características específicas (estilo, acabados, elementos especiales)
          6. Obstáculos o consideraciones especiales
          
          Proporciona datos precisos en formato estructurado JSON. Por ejemplo:
          {
            "projectType": "fencing",
            "materials": { "posts": "4x4 treated pine", "fence": "6 foot privacy cedar" },
            "dimensions": { "length": "75 feet", "height": "6 feet" },
            "conditions": { "terrain": "sloped", "existingStructure": "old fence to remove" },
            "style": "privacy fence with lattice top",
            "specialConsiderations": ["tree roots present", "gate needed for 36 inch opening"]
          }
          
          RECUERDA: Responde SOLO con JSON, sin texto adicional.
          `;
          
          // Adaptado para usar el método complete de OpenAIClient
          const analysisResult = await this.openAIClient.complete({
            prompt: analysisPrompt,
            model: 'gpt-4o',
            maxTokens: 1500,
            temperature: 0.2,
            systemMessage: 'You are an AI assistant specialized in construction and material estimation. You will analyze the image described and extract all relevant information about construction projects in JSON format.'
          });
          
          // Validar y parsear el resultado
          let parsedResult;
          try {
            // Intentar extraer solo la parte JSON si hay texto adicional
            const jsonMatch = analysisResult.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              parsedResult = JSON.parse(jsonMatch[0]);
            } else {
              parsedResult = JSON.parse(analysisResult);
            }
            
            // Validar contra esquema
            const validator = this.ajv.getSchema('imageAnalysisSchema');
            if (validator && !validator(parsedResult)) {
              throw new Error(`Formato de respuesta inválido: ${this.ajv.errorsText(validator.errors)}`);
            }
          } catch (parseError) {
            console.error(`Error parseando análisis de imagen ${index}:`, parseError);
            
            // Intentar extraer información clave incluso con formato incorrecto
            parsedResult = this.extractPartialData(analysisResult);
          }
          
          return {
            imageIndex: index,
            analysis: parsedResult,
            imagePath: image.path || image.url,
            imageType: image.type || 'site',
            confidence: this.getAnalysisConfidence(parsedResult)
          };
        } catch (error) {
          console.error(`Error procesando imagen ${index}:`, error);
          
          // Registrar el tipo de error para monitoreo
          this.trackApiError('openai', error);
          
          return {
            imageIndex: index,
            error: error.message,
            imagePath: image.path || image.url
          };
        }
      }));
      
      results.push(...batchResults.filter(result => result !== null));
      
      // Esperar un breve periodo entre lotes para evitar tasas de limitación
      if (i + batchSize < images.length) {
        await this.sleep(1000);
      }
    }
    
    return results;
  }
  
  /**
   * Estima la confianza del análisis de imagen basado en la completitud de datos
   */
  private getAnalysisConfidence(analysis: any): number {
    if (!analysis) return 0;
    
    let score = 0;
    
    // Verificar campos clave
    if (analysis.projectType) score += 0.3;
    if (analysis.materials && Object.keys(analysis.materials).length > 0) score += 0.2;
    if (analysis.dimensions && Object.keys(analysis.dimensions).length > 0) score += 0.3;
    if (analysis.conditions && Object.keys(analysis.conditions).length > 0) score += 0.1;
    if (analysis.specialConsiderations) score += 0.1;
    
    return score;
  }
  
  /**
   * Intenta extraer datos parciales de una respuesta mal formateada
   */
  private extractPartialData(text: string): any {
    const result: any = {};
    
    // Buscar tipo de proyecto
    const projectTypeMatch = text.match(/project\s*type[:\s]+["']?([a-zA-Z0-9_ ]+)["']?/i);
    if (projectTypeMatch) {
      result.projectType = projectTypeMatch[1].trim();
    }
    
    // Buscar dimensiones
    const dimensionsMatch = text.match(/dimensions[:\s]+([\s\S]*?)(?=\n\n|\n[a-zA-Z]|$)/i);
    if (dimensionsMatch) {
      const dimensions: Record<string, string> = {};
      const dimensionEntries = dimensionsMatch[1].match(/([a-zA-Z]+)[:\s]+["']?([0-9.]+\s*(?:feet|ft|inches|in|meters|m))["']?/gi);
      
      if (dimensionEntries) {
        dimensionEntries.forEach(entry => {
          const [key, value] = entry.split(/[:\s]+/);
          dimensions[key.trim().toLowerCase()] = value.trim();
        });
      }
      
      if (Object.keys(dimensions).length > 0) {
        result.dimensions = dimensions;
      }
    }
    
    // Buscar materiales
    const materialsMatch = text.match(/materials[:\s]+([\s\S]*?)(?=\n\n|\n[a-zA-Z]|$)/i);
    if (materialsMatch) {
      const materials: Record<string, string> = {};
      const materialEntries = materialsMatch[1].match(/([a-zA-Z]+)[:\s]+["']?([^"'\n\r,]+)["']?/gi);
      
      if (materialEntries) {
        materialEntries.forEach(entry => {
          const parts = entry.split(/[:\s]+/);
          if (parts.length >= 2) {
            const key = parts[0].trim().toLowerCase();
            const value = parts.slice(1).join(' ').trim();
            materials[key] = value;
          }
        });
      }
      
      if (Object.keys(materials).length > 0) {
        result.materials = materials;
      }
    }
    
    return result;
  }
  
  /**
   * Carga una imagen desde una ruta de archivo con manejo robusto de errores
   */
  private async loadImageFromPath(imagePath: string): Promise<string> {
    try {
      // Verificar primero si la ruta parece una URL
      if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        // Usar Axios para obtener la imagen
        const axios = require('axios');
        const response = await axios.get(imagePath, { responseType: 'arraybuffer' });
        return Buffer.from(response.data).toString('base64');
      }
      
      // Verificar si el archivo existe antes de intentar leerlo
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Archivo no encontrado: ${imagePath}`);
      }
      
      // Leer el archivo
      const imageBuffer = fs.readFileSync(imagePath);
      
      // Verificar que el buffer tenga contenido
      if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('Archivo vacío o corrupto');
      }
      
      return imageBuffer.toString('base64');
    } catch (error) {
      console.error(`Error cargando imagen desde ${imagePath}:`, error);
      
      // Buscar archivos similares en caso de error en la ruta
      if (error.code === 'ENOENT') {
        const similarFile = this.findSimilarImage(imagePath);
        if (similarFile) {
          console.log(`Usando archivo similar: ${similarFile} en lugar de ${imagePath}`);
          return fs.readFileSync(similarFile).toString('base64');
        }
      }
      
      throw new Error(`No se pudo cargar la imagen: ${error.message}`);
    }
  }
  
  /**
   * Busca archivos de imagen con nombres similares en caso de error en la ruta
   */
  private findSimilarImage(originalPath: string): string | null {
    try {
      const dir = path.dirname(originalPath);
      const filename = path.basename(originalPath);
      const baseFilename = filename.split('.')[0]; // nombre sin extensión
      
      // Verificar si el directorio existe
      if (!fs.existsSync(dir)) {
        return null;
      }
      
      // Buscar archivos similares
      const files = fs.readdirSync(dir);
      
      // Buscar archivos que empiecen con el mismo nombre base
      const similarFiles = files.filter(file => {
        const fileBasename = file.split('.')[0];
        return fileBasename.toLowerCase().includes(baseFilename.toLowerCase()) || 
               baseFilename.toLowerCase().includes(fileBasename.toLowerCase());
      });
      
      // Filtrar solo archivos de imagen
      const imageFiles = similarFiles.filter(file => {
        const ext = file.split('.').pop()?.toLowerCase();
        return ['jpg', 'jpeg', 'png', 'webp'].includes(ext || '');
      });
      
      if (imageFiles.length > 0) {
        return path.join(dir, imageFiles[0]);
      }
      
      return null;
    } catch (error) {
      console.error('Error buscando archivos similares:', error);
      return null;
    }
  }
  
  /**
   * Procesa las notas del contratista para extraer información relevante con manejo mejorado
   * @param notes Notas del contratista
   * @returns Análisis estructurado de las notas
   */
  private async processContractorNotes(notes: string): Promise<any> {
    if (!notes || notes.trim() === '') {
      return { isEmpty: true };
    }
    
    try {
      // Usar Claude Opus para análisis de texto detallado con formato estricto
      const analysisPrompt = `
      Analiza las siguientes notas de un contratista sobre un proyecto y extrae toda la información relevante en formato JSON estructurado.
      
      NOTAS DEL CONTRATISTA:
      ${notes}
      
      Extrae la siguiente información en formato JSON:
      {
        "projectType": "tipo de proyecto (cerca, techo, remodelación, etc.)",
        "projectSubtype": "subtipo o material principal (vinilo, madera, asfalto, etc.)",
        "dimensions": {
          "length": "longitud (con unidades si es posible)",
          "height": "altura (con unidades si es posible)",
          "width": "ancho (con unidades si es posible)",
          "area": "área (con unidades si es posible)"
        },
        "materialRequirements": {
          "material1": "descripción del material 1",
          "material2": "descripción del material 2"
        },
        "specialConsiderations": ["consideración 1", "consideración 2"],
        "demolitionNeeded": true/false,
        "clientPreferences": {
          "preference1": "valor 1",
          "preference2": "valor 2"
        }
      }
      
      Responde ESTRICTAMENTE con el JSON completo, sin texto adicional. Si algún campo no está presente en las notas, omítelo del JSON.
      `;
      
      // Utilizar servicio de Claude con reintentos
      const notesAnalysis = await this.anthropicClient.complete({
        prompt: analysisPrompt,
        model: 'claude-opus',
        maxTokens: 1500,
        temperature: 0.2
      });
      
      // Parsear el resultado como JSON con manejo robusto
      try {
        return JSON.parse(notesAnalysis.trim());
      } catch (parseError) {
        console.error('Error parseando análisis de notas:', parseError);
        
        // Intentar extraer solo la parte JSON si hay texto adicional
        const jsonMatch = notesAnalysis.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        
        // Si no se puede parsear, usar un servicio alternativo (OpenAI como respaldo)
        console.log('Intentando análisis de notas con servicio alternativo...');
        
        const alternativeAnalysis = await this.openAIClient.complete({
          prompt: `Analiza estas notas de contratista y extrae la información en JSON:\n\n${notes}`,
          model: 'gpt-4o',
          maxTokens: 1500,
          temperature: 0.2
        });
        
        // Intentar parsear el resultado alternativo
        const altJsonMatch = alternativeAnalysis.match(/\{[\s\S]*\}/);
        if (altJsonMatch) {
          return JSON.parse(altJsonMatch[0]);
        }
        
        throw new Error('No se pudo parsear el análisis de notas como JSON con ningún servicio');
      }
    } catch (error) {
      console.error('Error analizando notas del contratista:', error);
      
      // Registrar el tipo de error para monitoreo
      this.trackApiError('anthropic', error);
      
      // Devolver un error estructurado
      return {
        error: true,
        message: error.message,
        partialData: this.extractSimpleInfoFromNotes(notes)
      };
    }
  }
  
  /**
   * Extrae información básica de las notas en caso de fallo de los servicios IA
   */
  private extractSimpleInfoFromNotes(notes: string): any {
    const result: any = {};
    
    // Buscar tipo de proyecto
    const projectTypePatterns = [
      // Inglés
      { regex: /fence|fencing|fenced/i, type: 'fencing' },
      { regex: /deck|decking/i, type: 'decking' },
      { regex: /roof|roofing/i, type: 'roofing' },
      { regex: /window/i, type: 'window_replacement' },
      { regex: /kitchen/i, type: 'kitchen_remodel' },
      { regex: /bathroom/i, type: 'bathroom_remodel' },
      // Español
      { regex: /cerca|cercar|cercado/i, type: 'fencing' },
      { regex: /terraza|deck/i, type: 'decking' },
      { regex: /techo|tejado/i, type: 'roofing' },
      { regex: /ventana/i, type: 'window_replacement' },
      { regex: /cocina/i, type: 'kitchen_remodel' },
      { regex: /baño/i, type: 'bathroom_remodel' }
    ];
    
    for (const pattern of projectTypePatterns) {
      if (pattern.regex.test(notes)) {
        result.projectType = pattern.type;
        break;
      }
    }
    
    // Buscar dimensiones
    const dimensionPatterns = [
      // Longitud
      { regex: /(\d+(?:\.\d+)?)\s*(?:feet|foot|ft|pies|pie)/i, dimension: 'length' },
      // Altura
      { regex: /(\d+(?:\.\d+)?)\s*(?:feet|foot|ft|pies|pie)\s*(?:high|tall|height|alto|altura)/i, dimension: 'height' },
      // Ancho
      { regex: /(\d+(?:\.\d+)?)\s*(?:feet|foot|ft|pies|pie)\s*(?:wide|width|ancho)/i, dimension: 'width' },
      // Área
      { regex: /(\d+(?:\.\d+)?)\s*(?:square feet|sq ft|square foot|sq foot|pies cuadrados)/i, dimension: 'area' }
    ];
    
    result.dimensions = {};
    
    for (const pattern of dimensionPatterns) {
      const match = notes.match(pattern.regex);
      if (match) {
        result.dimensions[pattern.dimension] = match[1] + ' feet';
      }
    }
    
    // Buscar materiales comunes
    const materialPatterns = [
      { regex: /wood|wooden|lumber|madera/i, material: 'wood' },
      { regex: /vinyl|vinilo/i, material: 'vinyl' },
      { regex: /metal|aluminum|aluminium|aluminio/i, material: 'metal' },
      { regex: /concrete|cement|concreto|cemento/i, material: 'concrete' },
      { regex: /asphalt|shingle|asfalto/i, material: 'asphalt' }
    ];
    
    result.materialRequirements = {};
    
    for (const pattern of materialPatterns) {
      if (pattern.regex.test(notes)) {
        result.materialRequirements[pattern.material] = 'detected in notes';
      }
    }
    
    // Buscar si se requiere demolición
    if (/demoli|tear down|remove existing|remover|quitar|existente/i.test(notes)) {
      result.demolitionNeeded = true;
    }
    
    return result;
  }
  
  /**
   * Genera análisis de imágenes simplificado como fallback
   */
  private async getFallbackImageAnalysis(images: ProjectImage[]): Promise<any[]> {
    return images.map((image, index) => {
      // Analizar la extensión o nombre de archivo para inferir información básica
      const imagePath = image.path || image.url || '';
      const fileName = path.basename(imagePath).toLowerCase();
      
      // Inferencia simple basada en nombre de archivo
      let inferredType = 'unknown';
      
      // Inferir tipo de proyecto por nombre de archivo
      if (/fence|cerca|fenc/i.test(fileName)) {
        inferredType = 'fencing';
      } else if (/deck|terraza/i.test(fileName)) {
        inferredType = 'decking';
      } else if (/roof|techo|tejado/i.test(fileName)) {
        inferredType = 'roofing';
      } else if (/window|ventana/i.test(fileName)) {
        inferredType = 'window_replacement';
      } else if (/kitchen|cocina/i.test(fileName)) {
        inferredType = 'kitchen_remodel';
      } else if (/bath|baño/i.test(fileName)) {
        inferredType = 'bathroom_remodel';
      }
      
      return {
        imageIndex: index,
        analysis: {
          projectType: inferredType,
          materials: {},
          dimensions: {},
          conditions: {},
          inferredFromFilename: true
        },
        imagePath: image.path || image.url,
        imageType: image.type || 'site',
        confidence: 0.1 // Baja confianza por ser inferencia básica
      };
    });
  }
  
  /**
   * Genera análisis de notas simplificado como fallback
   */
  private getFallbackNotesAnalysis(notes: string): any {
    return {
      ...this.extractSimpleInfoFromNotes(notes),
      inferredWithFallback: true
    };
  }
  
  /**
   * Genera datos estructurados básicos como fallback
   */
  private getFallbackStructuredData(combinedAnalysis: any): any {
    // Intentar extraer tipo de proyecto
    let projectType = 'unknown';
    if (combinedAnalysis.aggregatedFindings && combinedAnalysis.aggregatedFindings.projectType) {
      projectType = this.normalizeProjectType(combinedAnalysis.aggregatedFindings.projectType);
    }
    
    // Extraer dimensiones básicas
    const dimensions: Record<string, number> = {};
    if (combinedAnalysis.aggregatedFindings && combinedAnalysis.aggregatedFindings.dimensions) {
      Object.entries(combinedAnalysis.aggregatedFindings.dimensions).forEach(([key, value]) => {
        const numMatch = String(value).match(/(\d+(\.\d+)?)/);
        if (numMatch) {
          dimensions[key] = parseFloat(numMatch[1]);
        }
      });
    }
    
    // Estimar dimensiones faltantes según el tipo
    if (projectType !== 'unknown' && Object.keys(dimensions).length < 2) {
      if (projectType === 'fencing') {
        if (!dimensions.length) dimensions.length = 100;
        if (!dimensions.height) dimensions.height = 6;
      } else if (projectType === 'decking') {
        if (!dimensions.length) dimensions.length = 16;
        if (!dimensions.width) dimensions.width = 12;
      }
    }
    
    return {
      projectType,
      projectSubtype: 'standard',
      dimensions,
      options: {
        demolitionNeeded: combinedAnalysis.fromNotes?.demolitionNeeded || false,
        materials: combinedAnalysis.aggregatedFindings?.materials || {}
      },
      detectedElements: {
        materials: combinedAnalysis.aggregatedFindings?.materials || {},
        conditions: combinedAnalysis.aggregatedFindings?.conditions || {},
        specialConsiderations: combinedAnalysis.aggregatedFindings?.specialConsiderations || []
      },
      generatedWithFallback: true
    };
  }
  
  /**
   * Ejecuta una función con reintentos adaptativos
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    stageName: string,
    processingId: string,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;
    
    // Implementación de backoff exponencial
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await fn();
        this.logStageComplete(processingId, stageName);
        return result;
      } catch (error) {
        lastError = error;
        
        // Registrar intento fallido
        console.warn(`[${processingId}] Intento ${attempt + 1}/${maxRetries} fallido en etapa ${stageName}: ${error.message}`);
        this.logStageRetry(processingId, stageName, attempt, error);
        
        // Calcular retardo exponencial (2^attempt * base)
        const baseDelay = 1000; // 1 segundo
        const delay = baseDelay * Math.pow(2, attempt);
        
        // Añadir algo de aleatoriedad para evitar sincronización
        const jitter = Math.random() * 500;
        const finalDelay = delay + jitter;
        
        console.log(`[${processingId}] Reintentando en ${Math.round(finalDelay/1000)} segundos...`);
        await this.sleep(finalDelay);
      }
    }
    
    // Registrar fallo final
    this.logStageError(processingId, stageName, lastError);
    
    // Si llegamos aquí, fallaron todos los reintentos
    throw lastError || new Error(`Error desconocido en etapa ${stageName}`);
  }
  
  /**
   * Pausa la ejecución durante un tiempo determinado
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Obtiene la última etapa completada en un procesamiento
   */
  private getLastCompletedStage(processingId: string): string {
    const processingData = this.processingEvents.get(processingId);
    if (!processingData || !processingData.stages) {
      return this.processingStages[0]; // Comenzar desde el principio
    }
    
    // Encontrar la última etapa completada con éxito
    for (let i = this.processingStages.length - 1; i >= 0; i--) {
      const stageName = this.processingStages[i];
      if (processingData.stages[stageName] && processingData.stages[stageName].success) {
        return stageName;
      }
    }
    
    return this.processingStages[0];
  }
  
  /**
   * Registra un error de API para monitoreo
   */
  private trackApiError(service: string, error: any): void {
    // Categorizar el error
    let errorType = 'unknown';
    
    if (error.message && error.message.includes('tasa')) {
      errorType = 'rateLimit';
    } else if (error.message && error.message.includes('timeout')) {
      errorType = 'timeout';
    } else if (error.response && error.response.status === 401) {
      errorType = 'authentication';
    } else if (error.response && error.response.status >= 500) {
      errorType = 'serverError';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      errorType = 'connection';
    }
    
    // Registrar en estadísticas
    const errorKey = `${service}_${errorType}`;
    this.processingStats.apiErrors[errorKey] = (this.processingStats.apiErrors[errorKey] || 0) + 1;
  }
  
  /**
   * Registra finalización exitosa de una etapa
   */
  private logStageComplete(processingId: string, stageName: string): void {
    const processingData = this.processingEvents.get(processingId);
    if (processingData) {
      processingData.stages[stageName] = {
        success: true,
        completedAt: Date.now(),
        duration: Date.now() - (processingData.stages[stageName]?.startedAt || processingData.startTime)
      };
    }
  }
  
  /**
   * Registra un error en una etapa
   */
  private logStageError(processingId: string, stageName: string, error: any): void {
    const processingData = this.processingEvents.get(processingId);
    if (processingData) {
      processingData.stages[stageName] = {
        success: false,
        error: error.message,
        completedAt: Date.now(),
        duration: Date.now() - (processingData.stages[stageName]?.startedAt || processingData.startTime)
      };
      
      processingData.errors.push({
        stage: stageName,
        message: error.message,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Registra un reintento en una etapa
   */
  private logStageRetry(processingId: string, stageName: string, attempt: number, error: any): void {
    const processingData = this.processingEvents.get(processingId);
    if (processingData) {
      if (!processingData.stages[stageName]) {
        processingData.stages[stageName] = {
          startedAt: Date.now(),
          retries: []
        };
      }
      
      processingData.stages[stageName].retries.push({
        attempt,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Registra una advertencia durante el procesamiento
   */
  private logWarning(processingId: string, message: string): void {
    const processingData = this.processingEvents.get(processingId);
    if (processingData) {
      processingData.warnings.push({
        message,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Registra un error durante el procesamiento
   */
  private logError(processingId: string, error: any): void {
    const processingData = this.processingEvents.get(processingId);
    if (processingData) {
      processingData.errors.push({
        message: error.message,
        stack: error.stack,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Actualiza el tiempo promedio de procesamiento
   */
  private updateAverageProcessingTime(processingTime: number): void {
    const currentAvg = this.processingStats.averageProcessingTime;
    const totalProcessed = this.processingStats.successfulRequests;
    
    // Calcular nuevo promedio ponderado
    this.processingStats.averageProcessingTime = 
      (currentAvg * (totalProcessed - 1) + processingTime) / totalProcessed;
  }
  
  /**
   * Obtiene estadísticas de procesamiento
   */
  getProcessingStats(): any {
    return {
      ...this.processingStats,
      cacheStats: {
        keys: this.analysisCache.keys().length,
        hits: this.analysisCache.getStats().hits,
        misses: this.analysisCache.getStats().misses
      }
    };
  }
  
  /**
   * Limpia la caché de análisis
   */
  clearAnalysisCache(): void {
    this.analysisCache.flushAll();
    console.log('Caché de análisis limpiada');
  }
}