import { OpenAIClient } from '../services/openai.client';
import { AnthropicClient } from '../services/anthropic.client';
import { MistralAIClient } from '../services/mistral.client';
import { Location } from '../interfaces/fence.interfaces';
import { config } from '../config/config';
import * as fs from 'fs';
import * as path from 'path';
import { createWorker } from 'tesseract.js';
import * as pdfParse from 'pdf-parse';
import * as tf from '@tensorflow/tfjs-node';
import NodeCache from 'node-cache';

/**
 * Motor especializado para análisis de planos arquitectónicos y ADUs
 * Utiliza OCR avanzado y procesamiento de imágenes para extraer elementos
 * estructurales, dimensiones y especificaciones de planos
 */
export class ArchitecturalPlanEngine {
  // Tipos de archivos soportados
  private readonly SUPPORTED_FILE_TYPES = [
    'application/pdf', 
    'image/jpeg', 
    'image/png', 
    'image/tiff'
  ];
  
  // Categorías de elementos arquitectónicos a identificar
  private readonly ARCHITECTURAL_ELEMENTS = [
    'wall', 'window', 'door', 'fence', 'staircase', 'roof', 
    'column', 'beam', 'foundation', 'ceiling', 'floor'
  ];
  
  // Sistema de caché para resultados de análisis
  private analysisCache: NodeCache;
  
  // Indicadores de escala comunes en planos (pies, metros)
  private readonly SCALE_INDICATORS = [
    /scale:?\s*1"\s*=\s*(\d+)['"]?/i,
    /escala:?\s*1:\s*(\d+)/i,
    /(\d+)\s*(?:ft|feet|pies)\s*(?:per|por)\s*(?:inch|pulgada)/i
  ];
  
  // Modelo OCR preentrenado
  private ocrWorker: any = null;
  private modelLoaded: boolean = false;
  
  constructor(
    private readonly openAIClient: OpenAIClient,
    private readonly anthropicClient: AnthropicClient,
    private readonly mistralClient?: MistralAIClient
  ) {
    // Inicializar caché con TTL de 24 horas (en segundos)
    this.analysisCache = new NodeCache({
      stdTTL: 86400,
      checkperiod: 3600,
      useClones: false
    });
    
    // Inicializar OCR en segundo plano
    this.initOCR();
  }
  
  /**
   * Inicializa el motor OCR Tesseract
   */
  private async initOCR(): Promise<void> {
    try {
      console.log('Inicializando motor OCR para planos arquitectónicos...');
      this.ocrWorker = await createWorker({
        logger: progress => {
          if (progress.status === 'recognizing text' && progress.progress === 1) {
            console.log('OCR completado');
          }
        }
      });
      
      // Cargar idiomas (inglés y español)
      await this.ocrWorker.loadLanguage('eng+spa');
      await this.ocrWorker.initialize('eng+spa');
      
      // Configurar para mejor reconocimiento de números y símbolos técnicos
      await this.ocrWorker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz\'"-:;.,/\\()?!+=<>[]{}@#$%^&*_ ',
        tessedit_pageseg_mode: '6' // Asume un bloque uniforme de texto
      });
      
      this.modelLoaded = true;
      console.log('Motor OCR para planos arquitectónicos inicializado correctamente');
    } catch (error) {
      console.error('Error inicializando motor OCR:', error);
    }
  }
  
  /**
   * Procesa un plano arquitectónico para extraer información relevante
   * @param filePath Ruta al archivo del plano (PDF, JPEG, PNG, TIFF)
   * @param location Ubicación del proyecto
   * @param options Opciones adicionales de procesamiento
   * @returns Análisis detallado del plano arquitectónico
   */
  async analyzePlan(
    filePath: string,
    location: Location,
    options: {
      projectType?: string;
      processingId?: string;
      forceReprocess?: boolean;
    } = {}
  ): Promise<{
    dimensions: Record<string, number>;
    elements: Array<{
      type: string;
      quantity: number;
      dimensions?: Record<string, number>;
      specifications?: Record<string, string>;
      position?: { x: number, y: number };
    }>;
    rooms?: Array<{
      name: string;
      area: number;
      dimensions: { width: number, length: number };
    }>;
    scale: number;
    totalArea: number;
    materials: Record<string, string>;
    estimatedCosts: {
      materials: Record<string, number>;
      labor: Record<string, number>;
      total: number;
    };
    metadata: {
      processingTime: number;
      confidenceScore: number;
      detectedFeatures: string[];
      warnings?: string[];
    };
  }> {
    const startTime = Date.now();
    const processingId = options.processingId || `arch_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    try {
      console.log(`[${processingId}] Iniciando análisis de plano arquitectónico: ${filePath}`);
      
      // Verificar caché si no se fuerza reprocesamiento
      if (!options.forceReprocess) {
        const cacheKey = this.generateCacheKey(filePath, location);
        const cachedResult = this.analysisCache.get(cacheKey);
        
        if (cachedResult) {
          console.log(`[${processingId}] Usando resultado en caché para plano arquitectónico`);
          return {
            ...cachedResult,
            metadata: {
              ...cachedResult.metadata,
              cacheHit: true
            }
          };
        }
      }
      
      // Validar tipo de archivo
      const fileExt = path.extname(filePath).toLowerCase();
      const mimeType = this.getMimeTypeFromExt(fileExt);
      
      if (!this.SUPPORTED_FILE_TYPES.includes(mimeType)) {
        throw new Error(`Tipo de archivo no soportado: ${fileExt}. Formatos soportados: PDF, JPEG, PNG, TIFF`);
      }
      
      // Esperar a que el OCR esté inicializado
      if (!this.modelLoaded) {
        console.log(`[${processingId}] Esperando inicialización del OCR...`);
        await this.waitForOCR();
      }
      
      // Procesar según el tipo de archivo
      let extractedText = '';
      let imageBuffer: Buffer | null = null;
      
      if (mimeType === 'application/pdf') {
        // Procesar PDF
        const pdfData = await this.processPDF(filePath);
        extractedText = pdfData.text;
        imageBuffer = pdfData.firstPageImage;
      } else {
        // Procesar imagen
        imageBuffer = fs.readFileSync(filePath);
        extractedText = await this.performOCR(imageBuffer);
      }
      
      // Extraer elementos arquitectónicos mediante OCR
      const extractedElements = this.extractArchitecturalElements(extractedText);
      
      // Detectar escala del plano
      const scale = this.detectScale(extractedText);
      
      // Realizar análisis profundo mediante AI
      const aiAnalysis = await this.performAIAnalysis(
        imageBuffer, 
        extractedText, 
        options.projectType || 'general'
      );
      
      // Combinar resultados y construir respuesta estructurada
      const structuredResult = this.buildStructuredResult(
        extractedElements,
        scale,
        aiAnalysis,
        location
      );
      
      // Calcular costos estimados
      const estimatedCosts = await this.calculateEstimatedCosts(
        structuredResult,
        location,
        options.projectType
      );
      
      // Resultado completo
      const result = {
        ...structuredResult,
        estimatedCosts,
        metadata: {
          processingTime: Date.now() - startTime,
          confidenceScore: this.calculateConfidenceScore(structuredResult, extractedText),
          detectedFeatures: Object.keys(structuredResult.elements.reduce((acc, element) => {
            acc[element.type] = true;
            return acc;
          }, {} as Record<string, boolean>))
        }
      };
      
      // Guardar en caché
      const cacheKey = this.generateCacheKey(filePath, location);
      this.analysisCache.set(cacheKey, result);
      
      return result;
      
    } catch (error: any) {
      console.error(`[${processingId}] Error en análisis de plano arquitectónico:`, error);
      
      // Intentar procesamiento simplificado en caso de fallo
      try {
        console.log(`[${processingId}] Intentando procesamiento simplificado...`);
        const simplifiedResult = await this.performSimplifiedAnalysis(filePath, location, options.projectType);
        
        return {
          ...simplifiedResult,
          metadata: {
            processingTime: Date.now() - startTime,
            confidenceScore: 0.3, // Baja confianza por ser análisis simplificado
            detectedFeatures: ['simplified_analysis'],
            warnings: [`Análisis completo falló: ${error.message}. Se utilizó análisis simplificado.`]
          }
        };
      } catch (fallbackError) {
        console.error(`[${processingId}] Fallo también en análisis simplificado:`, fallbackError);
        throw new Error(`Error procesando plano arquitectónico: ${error.message}. El procesamiento simplificado también falló.`);
      }
    }
  }
  
  /**
   * Espera a que el motor OCR esté inicializado
   */
  private async waitForOCR(timeout: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (!this.modelLoaded) {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (Date.now() - startTime > timeout) {
        // Si supera el tiempo, inicializar nuevamente
        try {
          await this.initOCR();
          break;
        } catch (error) {
          throw new Error('Tiempo de espera agotado para inicialización de OCR');
        }
      }
    }
  }
  
  /**
   * Procesa un archivo PDF para extraer texto e imagen
   */
  private async processPDF(filePath: string): Promise<{ text: string, firstPageImage: Buffer | null }> {
    // Leer archivo PDF
    const dataBuffer = fs.readFileSync(filePath);
    
    // Extraer texto del PDF
    const pdfData = await pdfParse(dataBuffer);
    
    // Intento de extraer la primera página como imagen (simplificado)
    // En una implementación real, se usaría pdf.js o otra biblioteca para extraer imágenes
    let firstPageImage: Buffer | null = null;
    
    return {
      text: pdfData.text,
      firstPageImage
    };
  }
  
  /**
   * Realiza OCR en una imagen utilizando el motor configurado (Tesseract o Mistral)
   * Con fallback automático en caso de fallo
   */
  private async performOCR(imageBuffer: Buffer): Promise<string> {
    // Intentar primero con Mistral AI si está disponible (mejor precisión)
    if (this.mistralClient) {
      try {
        console.log('Utilizando Mistral AI para OCR...');
        const mistralOcrResult = await this.mistralClient.performOCR({
          imageBuffer,
          detailed: true
        });
        
        // Validar que el resultado sea útil (texto suficiente)
        if (mistralOcrResult && mistralOcrResult.length > 50) {
          console.log('OCR con Mistral AI completado exitosamente');
          return mistralOcrResult;
        } else {
          console.log('Resultado de Mistral AI insuficiente, utilizando Tesseract como fallback...');
        }
      } catch (mistralError) {
        console.warn('Error en OCR con Mistral AI, utilizando Tesseract como fallback:', mistralError);
      }
    }
    
    // Fallback a Tesseract
    try {
      console.log('Utilizando Tesseract para OCR...');
      // Verificar que el worker esté inicializado
      if (!this.modelLoaded) {
        await this.waitForOCR();
      }
      
      const result = await this.ocrWorker.recognize(imageBuffer);
      console.log('OCR con Tesseract completado');
      return result.data.text;
    } catch (error) {
      console.error('Error en OCR con Tesseract:', error);
      throw new Error(`Error procesando OCR: ${error}`);
    }
  }
  
  /**
   * Realiza un análisis de plano con tecnología especializada de Mistral AI
   * Extrae elementos arquitectónicos y dimensiones con mayor precisión
   */
  private async performMistralAnalysis(
    imageBuffer: Buffer,
    projectType: string
  ): Promise<any> {
    if (!this.mistralClient) {
      throw new Error('Cliente de Mistral AI no configurado');
    }
    
    try {
      console.log(`Iniciando análisis avanzado de plano con Mistral AI para proyecto de ${projectType}...`);
      
      // Utilizar Mistral Vision para analizar la imagen del plano
      const mistralAnalysis = await this.mistralClient.analyzeBlueprintImage({
        imageBuffer,
        projectType,
        outputFormat: 'json'
      });
      
      console.log('Análisis con Mistral AI completado exitosamente');
      return mistralAnalysis;
    } catch (error) {
      console.error('Error en análisis con Mistral AI:', error);
      throw error;
    }
  }
  
  /**
   * Realiza un análisis profundo de la imagen y texto utilizando IA
   */
  private async performAIAnalysis(
    imageBuffer: Buffer | null,
    extractedText: string,
    projectType: string
  ): Promise<any> {
    try {
      // Si tenemos una imagen, crear un análisis enriquecido con visión AI
      if (imageBuffer) {
        
        // Intentar primero con Mistral AI si está disponible
        if (this.mistralClient) {
          try {
            console.log('Utilizando Mistral AI para análisis avanzado del plano...');
            const mistralAnalysis = await this.performMistralAnalysis(imageBuffer, projectType);
            
            // Verificar calidad del resultado
            if (
              mistralAnalysis && 
              typeof mistralAnalysis === 'object' && 
              (mistralAnalysis.dimensions || mistralAnalysis.elements)
            ) {
              console.log('Análisis de planos con Mistral AI completado exitosamente');
              return mistralAnalysis;
            } else {
              console.log('Resultado de Mistral AI insuficiente, usando OpenAI como fallback...');
            }
          } catch (mistralError) {
            console.warn('Error en análisis con Mistral AI, usando OpenAI como fallback:', mistralError);
          }
        }
        
        // Fallback a OpenAI
        console.log('Utilizando OpenAI para análisis del plano...');
        
        // Convertir buffer a base64 para API
        const base64Image = imageBuffer.toString('base64');
        
        // Prompt específico para análisis de planos arquitectónicos
        const analysisPrompt = `
        Analiza este plano arquitectónico para un proyecto de ${projectType}:
        
        El texto extraído del plano es:
        ${extractedText.substring(0, 1500)}
        
        Identifica y extrae la siguiente información en formato JSON:
        1. Dimensiones generales del plano
        2. Áreas de las habitaciones o espacios
        3. Elementos estructurales (paredes, columnas, vigas)
        4. Elementos arquitectónicos (puertas, ventanas, escaleras)
        5. Elementos exteriores como cercas o estructuras de jardín
        6. Especificaciones de materiales si están presentes
        
        La respuesta debe estar en formato JSON estructurado.
        `;
        
        // Análisis con Vision API de OpenAI
        const analysisResult = await this.openAIClient.complete({
          prompt: analysisPrompt,
          model: 'gpt-4o',
          maxTokens: 2000,
          temperature: 0.2,
          systemMessage: 'Eres un arquitecto y estimador de costos experto. Analiza planos arquitectónicos con precisión, extrayendo toda la información relevante que pueda ser útil para generar un estimado de construcción detallado.'
        });
        
        // Parsear el resultado como JSON
        try {
          const jsonMatch = analysisResult.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No se encontró JSON en la respuesta');
          }
        } catch (parseError) {
          console.error('Error parseando resultado de análisis IA:', parseError);
          
          // Intentar análisis simplificado
          return this.performSimplifiedAIAnalysis(extractedText, projectType);
        }
      } else {
        // Si no tenemos imagen, realizar análisis basado solo en texto
        return this.performSimplifiedAIAnalysis(extractedText, projectType);
      }
    } catch (error) {
      console.error('Error en análisis IA de plano:', error);
      throw error;
    }
  }
  
  /**
   * Realizar análisis simplificado basado solo en texto
   */
  private async performSimplifiedAIAnalysis(
    extractedText: string,
    projectType: string
  ): Promise<any> {
    // Análisis con Claude (como backup)
    const analysisPrompt = `
    Analiza este texto extraído de un plano arquitectónico para un proyecto de ${projectType}:
    
    TEXTO DEL PLANO:
    ${extractedText.substring(0, 2000)}
    
    Extrae la mayor cantidad posible de información estructurada sobre:
    - Dimensiones generales
    - Áreas
    - Elementos arquitectónicos
    - Materiales especificados
    
    Responde en FORMATO JSON.
    `;
    
    try {
      const analysisResult = await this.anthropicClient.complete({
        prompt: analysisPrompt,
        model: 'claude-3-opus-20240229',
        maxTokens: 1500,
        temperature: 0.2
      });
      
      // Intentar parsear JSON
      const jsonMatch = analysisResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      } else {
        // Si no se puede parsear, crear estructura básica
        return {
          dimensions: this.extractBasicDimensions(extractedText),
          elements: this.extractBasicElements(extractedText),
          materials: {}
        };
      }
    } catch (error) {
      console.error('Error en análisis simplificado:', error);
      
      // Devolver estructura mínima en caso de error
      return {
        dimensions: this.extractBasicDimensions(extractedText),
        elements: this.extractBasicElements(extractedText),
        materials: {}
      };
    }
  }
  
  /**
   * Extrae dimensiones básicas del texto mediante expresiones regulares
   */
  private extractBasicDimensions(text: string): Record<string, number> {
    const dimensions: Record<string, number> = {};
    
    // Patrones comunes para dimensiones en planos
    const patterns = [
      // Dimensiones generales
      { regex: /overall[\s:]+(\d+(?:\.\d+)?)['"]\s*[x×]\s*(\d+(?:\.\d+)?)['"]/i, keys: ['width', 'length'] },
      { regex: /dimensions[\s:]+(\d+(?:\.\d+)?)['"]\s*[x×]\s*(\d+(?:\.\d+)?)['"]/i, keys: ['width', 'length'] },
      
      // Largos/anchos específicos
      { regex: /length[\s:]+(\d+(?:\.\d+)?)['"]/i, keys: ['length'] },
      { regex: /width[\s:]+(\d+(?:\.\d+)?)['"]/i, keys: ['width'] },
      { regex: /height[\s:]+(\d+(?:\.\d+)?)['"]/i, keys: ['height'] },
      
      // En español
      { regex: /largo[\s:]+(\d+(?:\.\d+)?)['"]/i, keys: ['length'] },
      { regex: /ancho[\s:]+(\d+(?:\.\d+)?)['"]/i, keys: ['width'] },
      { regex: /altura[\s:]+(\d+(?:\.\d+)?)['"]/i, keys: ['height'] }
    ];
    
    // Buscar coincidencias
    patterns.forEach(pattern => {
      const match = text.match(pattern.regex);
      if (match) {
        pattern.keys.forEach((key, index) => {
          if (match[index + 1]) {
            dimensions[key] = parseFloat(match[index + 1]);
          }
        });
      }
    });
    
    // Extraer área si está presente
    const areaMatch = text.match(/area[\s:]+(\d+(?:\.\d+)?)\s*(?:sq\.?\s*ft\.?|ft\.?\s*sq\.?|m²)/i);
    if (areaMatch && areaMatch[1]) {
      dimensions.area = parseFloat(areaMatch[1]);
    }
    
    return dimensions;
  }
  
  /**
   * Extrae elementos básicos del texto mediante expresiones regulares
   */
  private extractBasicElements(text: string): Array<any> {
    const elements: Array<any> = [];
    
    // Patrones para elementos comunes
    const elementPatterns = [
      { regex: /(\d+)\s*window/i, type: 'window' },
      { regex: /(\d+)\s*door/i, type: 'door' },
      { regex: /(\d+)\s*wall/i, type: 'wall' },
      { regex: /(\d+)\s*column/i, type: 'column' },
      { regex: /(\d+)\s*fence/i, type: 'fence' },
      
      // En español
      { regex: /(\d+)\s*ventana/i, type: 'window' },
      { regex: /(\d+)\s*puerta/i, type: 'door' },
      { regex: /(\d+)\s*muro|pared/i, type: 'wall' },
      { regex: /(\d+)\s*columna/i, type: 'column' },
      { regex: /(\d+)\s*cerca|valla/i, type: 'fence' }
    ];
    
    // Buscar coincidencias
    elementPatterns.forEach(pattern => {
      const match = text.match(pattern.regex);
      if (match && match[1]) {
        elements.push({
          type: pattern.type,
          quantity: parseInt(match[1], 10)
        });
      }
    });
    
    return elements;
  }
  
  /**
   * Extrae elementos arquitectónicos del texto mediante expresiones regulares
   */
  private extractArchitecturalElements(text: string): Array<{
    type: string;
    quantity: number;
    dimensions?: Record<string, number>;
  }> {
    const elements: Array<any> = [];
    
    // Buscar menciones de elementos arquitectónicos en el texto
    this.ARCHITECTURAL_ELEMENTS.forEach(elementType => {
      // Patrones comunes para encontrar elementos con cantidades
      const patterns = [
        // Inglés
        new RegExp(`(\\d+)\\s*${elementType}s?`, 'gi'),
        new RegExp(`${elementType}s?\\s*[:\\-]\\s*(\\d+)`, 'gi'),
        // Español
        new RegExp(`(\\d+)\\s*${elementType}s?`, 'gi'),
        new RegExp(`${elementType}s?\\s*[:\\-]\\s*(\\d+)`, 'gi')
      ];
      
      // Buscar todas las coincidencias
      patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          if (match[1]) {
            const quantity = parseInt(match[1], 10);
            if (!isNaN(quantity) && quantity > 0) {
              elements.push({
                type: elementType,
                quantity
              });
            }
          }
        }
      });
    });
    
    // También buscar dimensiones asociadas a elementos
    const dimensionPatterns = [
      // Puertas con dimensiones (ej: "door 36" x 80"")
      { regex: /(door|puerta)\s+(\d+(?:\.\d+)?)['"]\s*[x×]\s*(\d+(?:\.\d+)?)['"]/gi, type: 'door' },
      // Ventanas con dimensiones
      { regex: /(window|ventana)\s+(\d+(?:\.\d+)?)['"]\s*[x×]\s*(\d+(?:\.\d+)?)['"]/gi, type: 'window' }
    ];
    
    dimensionPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        if (match[2] && match[3]) {
          const width = parseFloat(match[2]);
          const height = parseFloat(match[3]);
          if (!isNaN(width) && !isNaN(height)) {
            elements.push({
              type: pattern.type,
              quantity: 1,
              dimensions: {
                width,
                height
              }
            });
          }
        }
      }
    });
    
    return elements;
  }
  
  /**
   * Detecta la escala del plano a partir del texto extraído
   */
  private detectScale(text: string): number {
    // Escala predeterminada: 1" = 4' (escala 48)
    let scale = 48;
    
    // Buscar indicadores de escala en el texto
    for (const pattern of this.SCALE_INDICATORS) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const scaleValue = parseInt(match[1], 10);
        if (!isNaN(scaleValue) && scaleValue > 0) {
          // Si encontramos escala, actualizar
          scale = scaleValue;
          break;
        }
      }
    }
    
    return scale;
  }
  
  /**
   * Construye un resultado estructurado combinando OCR, análisis IA y reglas
   */
  private buildStructuredResult(
    extractedElements: Array<any>,
    scale: number,
    aiAnalysis: any,
    location: Location
  ): any {
    // Combinar elementos detectados con análisis IA
    const elements = [
      ...extractedElements,
      ...(aiAnalysis.elements || [])
    ];
    
    // Deduplicar elementos por tipo
    const elementMap: Record<string, any> = {};
    elements.forEach(element => {
      const key = element.type;
      if (!elementMap[key]) {
        elementMap[key] = { ...element, quantity: element.quantity || 1 };
      } else {
        elementMap[key].quantity += element.quantity || 1;
        
        // Fusionar dimensiones si están presentes en ambos
        if (element.dimensions && elementMap[key].dimensions) {
          Object.keys(element.dimensions).forEach(dimKey => {
            if (!elementMap[key].dimensions[dimKey]) {
              elementMap[key].dimensions[dimKey] = element.dimensions[dimKey];
            }
          });
        }
      }
    });
    
    // Calcular área total
    let totalArea = 0;
    if (aiAnalysis.dimensions && aiAnalysis.dimensions.area) {
      totalArea = aiAnalysis.dimensions.area;
    } else if (aiAnalysis.dimensions && aiAnalysis.dimensions.length && aiAnalysis.dimensions.width) {
      totalArea = aiAnalysis.dimensions.length * aiAnalysis.dimensions.width;
    }
    
    // Construir resultado final
    return {
      dimensions: aiAnalysis.dimensions || this.extractBasicDimensions(''),
      elements: Object.values(elementMap),
      rooms: aiAnalysis.rooms || [],
      scale,
      totalArea,
      materials: aiAnalysis.materials || {}
    };
  }
  
  /**
   * Genera estimados de costos basados en el análisis estructural
   */
  private async calculateEstimatedCosts(
    structuredResult: any,
    location: Location,
    projectType?: string
  ): Promise<any> {
    // Costos base por región (simplificado)
    const regionalMultiplier = this.getRegionalMultiplier(location);
    
    // Costos base por tipo de elemento (simplificado)
    const baseCosts = {
      window: { material: 250, labor: 150 },
      door: { material: 200, labor: 100 },
      wall: { material: 15, labor: 20 }, // por pie cuadrado
      fence: { material: 12, labor: 8 }, // por pie lineal
      column: { material: 150, labor: 200 },
      beam: { material: 25, labor: 35 }, // por pie
      foundation: { material: 50, labor: 40 }, // por pie cuadrado
      roof: { material: 6, labor: 4 } // por pie cuadrado
    };
    
    // Calcular costos de materiales y mano de obra
    const materialCosts: Record<string, number> = {};
    const laborCosts: Record<string, number> = {};
    let totalMaterialCost = 0;
    let totalLaborCost = 0;
    
    // Procesar cada elemento
    structuredResult.elements.forEach((element: any) => {
      if (!baseCosts[element.type]) return;
      
      // Calcular costo según cantidad y dimensiones
      let materialCost = baseCosts[element.type].material * (element.quantity || 1);
      let laborCost = baseCosts[element.type].labor * (element.quantity || 1);
      
      // Ajustes por dimensiones (simplificado)
      if (element.dimensions) {
        if (element.type === 'wall' && element.dimensions.length && element.dimensions.height) {
          const area = element.dimensions.length * element.dimensions.height;
          materialCost = baseCosts.wall.material * area;
          laborCost = baseCosts.wall.labor * area;
        } else if (element.type === 'fence' && element.dimensions.length) {
          materialCost = baseCosts.fence.material * element.dimensions.length;
          laborCost = baseCosts.fence.labor * element.dimensions.length;
        }
      }
      
      // Aplicar multiplicador regional
      materialCost *= regionalMultiplier;
      laborCost *= regionalMultiplier;
      
      // Almacenar resultados
      materialCosts[element.type] = materialCost;
      laborCosts[element.type] = laborCost;
      
      totalMaterialCost += materialCost;
      totalLaborCost += laborCost;
    });
    
    // Calcular costo total
    const totalCost = totalMaterialCost + totalLaborCost;
    
    return {
      materials: materialCosts,
      labor: laborCosts,
      total: totalCost
    };
  }
  
  /**
   * Realiza un análisis simplificado cuando el análisis completo falla
   */
  private async performSimplifiedAnalysis(
    filePath: string,
    location: Location,
    projectType?: string
  ): Promise<any> {
    try {
      // Intentar extraer texto básico
      let extractedText = '';
      
      if (path.extname(filePath).toLowerCase() === '.pdf') {
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        extractedText = pdfData.text;
      } else if (this.modelLoaded) {
        const imageBuffer = fs.readFileSync(filePath);
        extractedText = await this.performOCR(imageBuffer);
      }
      
      // Extraer dimensiones y elementos básicos
      const dimensions = this.extractBasicDimensions(extractedText);
      const elements = this.extractBasicElements(extractedText);
      
      // Calcular área total
      let totalArea = 0;
      if (dimensions.area) {
        totalArea = dimensions.area;
      } else if (dimensions.length && dimensions.width) {
        totalArea = dimensions.length * dimensions.width;
      }
      
      // Estimar basado en el tipo de proyecto y área
      const estimatedCosts = this.generateSimplifiedCostEstimate(
        totalArea,
        elements,
        location,
        projectType
      );
      
      return {
        dimensions,
        elements,
        rooms: [],
        scale: 48, // Valor predeterminado: 1" = 4'
        totalArea,
        materials: {},
        estimatedCosts
      };
    } catch (error) {
      console.error('Error en análisis simplificado:', error);
      throw error;
    }
  }
  
  /**
   * Genera un estimado de costo simplificado basado en área y tipo de proyecto
   */
  private generateSimplifiedCostEstimate(
    totalArea: number,
    elements: Array<any>,
    location: Location,
    projectType?: string
  ): any {
    // Si no hay área, estimar basado en cantidad de elementos
    if (!totalArea || totalArea <= 0) {
      totalArea = 1000; // Valor predeterminado
    }
    
    // Costos base por pie cuadrado según tipo de proyecto
    const baseCostPerSqFt: Record<string, { material: number, labor: number }> = {
      'fence': { material: 12, labor: 8 },
      'deck': { material: 15, labor: 10 },
      'room_addition': { material: 85, labor: 65 },
      'home': { material: 95, labor: 75 },
      'adu': { material: 110, labor: 90 },
      'remodel': { material: 45, labor: 55 },
      'general': { material: 50, labor: 50 }
    };
    
    // Seleccionar tipo de proyecto o usar general como predeterminado
    const projectCosts = baseCostPerSqFt[projectType || 'general'] || baseCostPerSqFt.general;
    
    // Aplicar multiplicador regional
    const regionalMultiplier = this.getRegionalMultiplier(location);
    const adjustedMaterialCost = projectCosts.material * regionalMultiplier;
    const adjustedLaborCost = projectCosts.labor * regionalMultiplier;
    
    // Calcular costos totales
    const totalMaterialCost = totalArea * adjustedMaterialCost;
    const totalLaborCost = totalArea * adjustedLaborCost;
    
    return {
      materials: { base: totalMaterialCost },
      labor: { base: totalLaborCost },
      total: totalMaterialCost + totalLaborCost
    };
  }
  
  /**
   * Determina el multiplicador de costo regional basado en la ubicación
   */
  private getRegionalMultiplier(location: Location): number {
    // Multiplicadores simplificados por estado (en implementación real, sería más detallado)
    const stateMultipliers: Record<string, number> = {
      'CA': 1.4,
      'NY': 1.3,
      'TX': 0.9,
      'FL': 1.0,
      'WA': 1.2,
      'IL': 1.1,
      'CO': 1.1,
      'OR': 1.1,
      'MA': 1.25,
      'NJ': 1.2
    };
    
    // Extraer estado del código postal o usar ubicación completa
    const state = location.state || this.getStateFromZipCode(location.zipCode);
    
    // Devolver multiplicador o valor predeterminado
    return stateMultipliers[state] || 1.0;
  }
  
  /**
   * Obtiene el estado a partir del código postal (simplificado)
   */
  private getStateFromZipCode(zipCode: string): string {
    // Simplificado - En un sistema real se usaría una base de datos completa
    const firstDigit = parseInt(zipCode.charAt(0), 10);
    
    // Mapeo muy básico de primer dígito a estado
    const stateMap: Record<number, string> = {
      0: 'MA',
      1: 'NY',
      2: 'VA',
      3: 'FL',
      4: 'OH',
      5: 'IL',
      6: 'TX',
      7: 'TX',
      8: 'CO',
      9: 'CA'
    };
    
    return stateMap[firstDigit] || 'TX'; // TX como predeterminado
  }
  
  /**
   * Calcula un puntaje de confianza para el análisis
   */
  private calculateConfidenceScore(structuredResult: any, extractedText: string): number {
    let score = 0.3; // Puntaje base
    
    // Bonificar por dimensiones detectadas
    if (Object.keys(structuredResult.dimensions).length > 0) {
      score += 0.2;
    }
    
    // Bonificar por elementos detectados
    if (structuredResult.elements.length > 0) {
      score += 0.1;
      // Adicional por variedad de elementos
      const uniqueElementTypes = new Set(structuredResult.elements.map((e: any) => e.type)).size;
      score += Math.min(0.2, uniqueElementTypes * 0.05);
    }
    
    // Bonificar por habitaciones detectadas
    if (structuredResult.rooms && structuredResult.rooms.length > 0) {
      score += 0.1;
    }
    
    // Penalizar si el texto extraído es muy corto (posible OCR deficiente)
    if (extractedText.length < 100) {
      score -= 0.2;
    }
    
    // Limitar el rango de 0 a 1
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * Genera una clave de caché única para un plano y ubicación
   */
  private generateCacheKey(filePath: string, location: Location): string {
    const fileStats = fs.statSync(filePath);
    const fileModified = fileStats.mtimeMs.toString();
    const locationStr = location.zipCode;
    
    return `arch_plan_${this.hashString(filePath + fileModified + locationStr)}`;
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
   * Obtiene el tipo MIME basado en la extensión
   */
  private getMimeTypeFromExt(ext: string): string {
    switch (ext) {
      case '.pdf':
        return 'application/pdf';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.tif':
      case '.tiff':
        return 'image/tiff';
      default:
        return 'application/octet-stream';
    }
  }
  
  /**
   * Limpia recursos del motor OCR al finalizar
   */
  async terminate(): Promise<void> {
    if (this.ocrWorker) {
      await this.ocrWorker.terminate();
    }
  }
}