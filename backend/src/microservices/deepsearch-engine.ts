import { MicroserviceBase, MessageBroker } from '../architecture/microservices-architecture';
import { OpenAIClient } from '../services/openai.client';
import { MistralClient } from '../services/mistral.client';
import { PersistentCacheService } from '../services/persistent-cache.service';
import { VectorDBService } from '../services/vectordb.service';
import { DatabaseService } from '../services/database.service';
import { config } from '../config/config';
import fs from 'fs';
import path from 'path';

/**
 * Motor de búsqueda avanzada con capacidades de IA para recuperación
 * de información e inferencia semántica sobre el repositorio de proyectos,
 * especificaciones y estimados de la empresa.
 * 
 * Funcionalidades principales:
 * 1. Búsqueda semántica de proyectos similares
 * 2. Análisis de especificaciones de materiales
 * 3. Extracción automática de parámetros de proyectos
 * 4. Indexación y clasificación de documentos
 * 5. Comparación de especificaciones para recomendaciones
 */
export class DeepSearchEngine extends MicroserviceBase {
  private openAIClient: OpenAIClient;
  private mistralClient: MistralClient;
  private persistentCache: PersistentCacheService;
  private vectorDB: VectorDBService;
  private databaseService: DatabaseService;
  
  // Almacenamiento en memoria para búsquedas recientes
  private recentSearchesCache: Map<string, { timestamp: number, results: any }> = new Map();
  private CACHE_TTL = 30 * 60 * 1000; // 30 minutos en milisegundos
  
  // Estadísticas de uso
  private searchStats = {
    totalSearches: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageResponseTime: 0,
    activeQueriesCount: 0
  };
  
  constructor(
    private readonly messageBroker: MessageBroker,
    private readonly cachePath: string = config.cache.cachePath,
    private readonly vectorDBPath: string = config.vectorDB.vectorDBPath
  ) {
    super('DeepSearchEngine', '1.0.0');
    
    // Inicializar clientes de IA
    this.openAIClient = new OpenAIClient(config.openai.apiKey);
    this.mistralClient = new MistralClient(config.mistral.apiKey);
    
    // Inicializar servicios de infraestructura
    this.persistentCache = new PersistentCacheService(this.cachePath);
    this.vectorDB = new VectorDBService(this.vectorDBPath);
    this.databaseService = DatabaseService.getInstance();
    
    // Asegurar que los directorios necesarios existan
    this.ensureDirectoriesExist();
    
    // Suscribirse a eventos
    this.configureBrokerSubscriptions();
    
    // Iniciar servicio de limpieza de caché periódica
    this.startCacheCleanupTask();
    
    this.logInfo('Motor de DeepSearch inicializado correctamente');
  }
  
  /**
   * Asegura que todos los directorios necesarios existan
   */
  private ensureDirectoriesExist(): void {
    const dirs = [this.cachePath, this.vectorDBPath];
    
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        this.logInfo(`Directorio creado: ${dir}`);
      }
    }
  }
  
  /**
   * Configura las suscripciones a eventos del message broker
   */
  private configureBrokerSubscriptions(): void {
    this.messageBroker.subscribe('deepsearch.find-similar-projects', this.handleFindSimilarProjects.bind(this));
    this.messageBroker.subscribe('deepsearch.analyze-specifications', this.handleAnalyzeSpecifications.bind(this));
    this.messageBroker.subscribe('deepsearch.extract-parameters', this.handleExtractParameters.bind(this));
    this.messageBroker.subscribe('deepsearch.index-document', this.handleIndexDocument.bind(this));
    this.messageBroker.subscribe('deepsearch.search-knowledge-base', this.handleSearchKnowledgeBase.bind(this));
    this.messageBroker.subscribe('deepsearch.get-material-recommendations', this.handleGetMaterialRecommendations.bind(this));
    this.messageBroker.subscribe('deepsearch.search-by-image', this.handleSearchByImage.bind(this));
    this.messageBroker.subscribe('deepsearch.health-check', this.handleHealthCheck.bind(this));
  }
  
  /**
   * Busca proyectos similares basados en criterios específicos
   */
  private async handleFindSimilarProjects(message: any): Promise<void> {
    const { requestId, projectDescription, specifications, parameters } = message;
    const startTime = Date.now();
    
    try {
      this.searchStats.totalSearches++;
      this.searchStats.activeQueriesCount++;
      
      // Crear una clave única para esta consulta
      const cacheKey = this.generateCacheKey('similar-projects', { projectDescription, specifications, parameters });
      
      // Verificar caché en memoria
      const cachedResult = this.getFromRecentSearchesCache(cacheKey);
      if (cachedResult) {
        this.searchStats.cacheHits++;
        this.messageBroker.publish('deepsearch.similar-projects-result', {
          requestId,
          success: true,
          results: cachedResult,
          fromCache: true
        });
        
        this.searchStats.activeQueriesCount--;
        return;
      }
      
      this.searchStats.cacheMisses++;
      
      // Verificar caché persistente
      const persistentCacheResult = await this.persistentCache.get(cacheKey);
      if (persistentCacheResult) {
        this.addToRecentSearchesCache(cacheKey, persistentCacheResult);
        
        this.messageBroker.publish('deepsearch.similar-projects-result', {
          requestId,
          success: true,
          results: persistentCacheResult,
          fromCache: true
        });
        
        this.searchStats.activeQueriesCount--;
        return;
      }
      
      // Generar embedding del proyecto de consulta mediante OpenAI
      const projectEmbedding = await this.openAIClient.generateEmbedding(
        this.createProjectEmbeddingText(projectDescription, specifications, parameters)
      );
      
      // Buscar proyectos similares en la base de datos vectorial
      const similarProjects = await this.vectorDB.findSimilarVectors(
        'projects',
        projectEmbedding,
        10, // Número de resultados similares
        0.7  // Umbral de similitud mínima
      );
      
      // Mejorar los resultados con el modelo LLM
      const enhancedResults = await this.enhanceSearchResults(similarProjects, projectDescription, specifications);
      
      // Guardar en caché
      this.addToRecentSearchesCache(cacheKey, enhancedResults);
      await this.persistentCache.set(cacheKey, enhancedResults, 60 * 60 * 24); // Caché por 24 horas
      
      // Publicar resultados
      this.messageBroker.publish('deepsearch.similar-projects-result', {
        requestId,
        success: true,
        results: enhancedResults,
        fromCache: false
      });
      
      // Actualizar estadísticas
      const responseTime = Date.now() - startTime;
      this.updateResponseTimeStats(responseTime);
      
    } catch (error) {
      this.logError('Error al buscar proyectos similares', error);
      
      // Reportar error
      this.messageBroker.publish('error-handler.report-error', {
        serviceName: this.serviceName,
        operation: 'findSimilarProjects',
        error,
        context: { requestId, projectDescription }
      });
      
      // Publicar respuesta de error
      this.messageBroker.publish('deepsearch.similar-projects-result', {
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    } finally {
      this.searchStats.activeQueriesCount--;
    }
  }
  
  /**
   * Analiza especificaciones técnicas y proporciona información estructurada
   */
  private async handleAnalyzeSpecifications(message: any): Promise<void> {
    const { requestId, specifications, format } = message;
    
    try {
      // Generar análisis mediante Mistral
      const analysisPrompt = `
        Analiza las siguientes especificaciones técnicas de un proyecto de cercado:
        
        ${JSON.stringify(specifications, null, 2)}
        
        Extrae y estructura la siguiente información:
        1. Tipo de materiales principales
        2. Dimensiones
        3. Requisitos técnicos especiales
        4. Estimación de complejidad (baja, media, alta)
        5. Posibles desafíos de implementación
        
        Proporciona el resultado en formato JSON estructurado.
      `;
      
      const analysisResult = await this.mistralClient.generateCompletion(analysisPrompt);
      
      // Intentar parsear el resultado como JSON
      let structuredResult;
      try {
        // Extraer sólo la parte JSON si está encapsulada en texto
        const jsonMatch = analysisResult.match(/```json\n([\s\S]*?)\n```/) || 
                         analysisResult.match(/{[\s\S]*}/);
                         
        const jsonString = jsonMatch ? jsonMatch[1] || jsonMatch[0] : analysisResult;
        structuredResult = JSON.parse(jsonString);
      } catch (parseError) {
        // Si falla el parsing, usar el resultado textual
        structuredResult = { rawAnalysis: analysisResult };
      }
      
      // Publicar resultados
      this.messageBroker.publish('deepsearch.specifications-analysis-result', {
        requestId,
        success: true,
        analysis: structuredResult
      });
      
    } catch (error) {
      this.logError('Error al analizar especificaciones', error);
      
      // Reportar error
      this.messageBroker.publish('error-handler.report-error', {
        serviceName: this.serviceName,
        operation: 'analyzeSpecifications',
        error,
        context: { requestId }
      });
      
      // Publicar respuesta de error
      this.messageBroker.publish('deepsearch.specifications-analysis-result', {
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }
  
  /**
   * Extrae parámetros automáticamente de descripciones de proyectos
   */
  private async handleExtractParameters(message: any): Promise<void> {
    const { requestId, projectDescription, additionalContext } = message;
    
    try {
      // Combinar descripción del proyecto con contexto adicional
      const fullContext = `
        Descripción del proyecto: ${projectDescription}
        
        ${additionalContext ? `Contexto adicional: ${additionalContext}` : ''}
      `;
      
      // Extraer parámetros usando OpenAI
      const extractionPrompt = `
        Extrae todos los parámetros relevantes para un proyecto de cercado o deck a partir de la siguiente descripción.
        Parámetros a identificar:
        - Tipo de proyecto (cerca, deck, otro)
        - Dimensiones (longitud, altura, área)
        - Materiales principales
        - Características especiales
        - Restricciones o requisitos específicos
        - Ubicación o condiciones del terreno
        
        Texto: "${fullContext}"
        
        Devuelve únicamente un objeto JSON con los parámetros detectados. Si un parámetro no está mencionado, omítelo del resultado.
      `;
      
      const extractionResult = await this.openAIClient.generateCompletion(extractionPrompt);
      
      // Procesar resultado para extraer JSON
      let parameters;
      try {
        // Intentar extraer la parte JSON
        const jsonMatch = extractionResult.match(/```json\n([\s\S]*?)\n```/) || 
                         extractionResult.match(/{[\s\S]*}/);
                         
        const jsonString = jsonMatch ? jsonMatch[1] || jsonMatch[0] : extractionResult;
        parameters = JSON.parse(jsonString);
      } catch (parseError) {
        // Segundo intento: procesamiento manual como fallback
        this.logWarning('Error al parsear JSON de extracción, utilizando procesamiento manual', parseError);
        parameters = this.manuallyExtractParameters(extractionResult);
      }
      
      // Publicar resultados
      this.messageBroker.publish('deepsearch.parameter-extraction-result', {
        requestId,
        success: true,
        parameters
      });
      
    } catch (error) {
      this.logError('Error al extraer parámetros', error);
      
      // Reportar error
      this.messageBroker.publish('error-handler.report-error', {
        serviceName: this.serviceName,
        operation: 'extractParameters',
        error,
        context: { requestId, projectDescription }
      });
      
      // Publicar respuesta de error
      this.messageBroker.publish('deepsearch.parameter-extraction-result', {
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }
  
  /**
   * Indexa un documento en la base de datos vectorial
   */
  private async handleIndexDocument(message: any): Promise<void> {
    const { requestId, document, metadata, documentType } = message;
    
    try {
      // Validar documento
      if (!document || !documentType) {
        throw new Error('Se requiere documento y tipo de documento');
      }
      
      // Preparar texto para el embedding basado en el tipo
      let textForEmbedding;
      
      switch (documentType) {
        case 'project':
          textForEmbedding = this.createProjectEmbeddingText(
            document.description,
            document.specifications,
            document.parameters
          );
          break;
        case 'specification':
          textForEmbedding = JSON.stringify(document);
          break;
        case 'estimate':
          textForEmbedding = `
            Proyecto: ${document.projectName || 'Sin nombre'}
            Cliente: ${document.client?.name || 'Sin cliente'}
            Total: ${document.totalCost || 0}
            Materiales: ${JSON.stringify(document.materials || {})}
            Descripción: ${document.description || ''}
          `;
          break;
        default:
          textForEmbedding = typeof document === 'string' ? document : JSON.stringify(document);
      }
      
      // Generar embedding
      const embedding = await this.openAIClient.generateEmbedding(textForEmbedding);
      
      // Almacenar en la base de datos vectorial
      const docId = await this.vectorDB.storeVector(
        documentType + 's', // Colección (projects, specifications, estimates)
        embedding,
        {
          ...document,
          ...metadata,
          indexedAt: new Date().toISOString()
        }
      );
      
      // Registrar en base de datos principal si es necesario
      if (documentType === 'project' || documentType === 'estimate') {
        // Esto asume que existe un modelo en MongoDB para proyectos/estimados
        try {
          await this.databaseService.connect();
          // La implementación dependerá de los modelos específicos de tu aplicación
        } catch (dbError) {
          this.logWarning(`Error al guardar documento en base de datos principal: ${dbError}`);
        }
      }
      
      // Publicar resultados
      this.messageBroker.publish('deepsearch.index-document-result', {
        requestId,
        success: true,
        documentId: docId
      });
      
    } catch (error) {
      this.logError('Error al indexar documento', error);
      
      // Reportar error
      this.messageBroker.publish('error-handler.report-error', {
        serviceName: this.serviceName,
        operation: 'indexDocument',
        error,
        context: { requestId, documentType }
      });
      
      // Publicar respuesta de error
      this.messageBroker.publish('deepsearch.index-document-result', {
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }

  /**
   * Busca en la base de conocimientos usando lenguaje natural
   */
  private async handleSearchKnowledgeBase(message: any): Promise<void> {
    const { requestId, query, filters, maxResults = 10 } = message;
    
    try {
      // Generar embedding para la consulta
      const queryEmbedding = await this.openAIClient.generateEmbedding(query);
      
      // Determinar colecciones a buscar basado en filtros
      const collections = filters?.collections || ['projects', 'specifications', 'estimates'];
      
      // Resultados para cada colección
      const allResults = [];
      
      // Buscar en cada colección
      for (const collection of collections) {
        const collectionResults = await this.vectorDB.findSimilarVectors(
          collection,
          queryEmbedding,
          maxResults,
          0.65 // Umbral de similitud
        );
        
        // Agregar origen a cada resultado
        const resultsWithSource = collectionResults.map(result => ({
          ...result,
          source: collection
        }));
        
        allResults.push(...resultsWithSource);
      }
      
      // Ordenar por relevancia (similitud)
      allResults.sort((a, b) => b.similarity - a.similarity);
      
      // Limitar a maxResults
      const finalResults = allResults.slice(0, maxResults);
      
      // Publicar resultados
      this.messageBroker.publish('deepsearch.knowledge-base-search-result', {
        requestId,
        success: true,
        results: finalResults
      });
      
    } catch (error) {
      this.logError('Error al buscar en la base de conocimientos', error);
      
      // Reportar error
      this.messageBroker.publish('error-handler.report-error', {
        serviceName: this.serviceName,
        operation: 'searchKnowledgeBase',
        error,
        context: { requestId, query }
      });
      
      // Publicar respuesta de error
      this.messageBroker.publish('deepsearch.knowledge-base-search-result', {
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }
  
  /**
   * Obtiene recomendaciones de materiales basadas en especificaciones
   */
  private async handleGetMaterialRecommendations(message: any): Promise<void> {
    const { requestId, specifications, preferences, budget } = message;
    
    try {
      // Construir prompt para recomendaciones
      const recommendationPrompt = `
        Analiza las siguientes especificaciones para un proyecto de cercado o deck:
        
        ${JSON.stringify(specifications, null, 2)}
        
        Preferencias adicionales: ${preferences || 'No especificadas'}
        Presupuesto: ${budget ? `$${budget}` : 'No especificado'}
        
        Recomienda los materiales óptimos para este proyecto, considerando:
        1. Durabilidad
        2. Costo
        3. Estética
        4. Mantenimiento
        5. Compatibilidad con las especificaciones
        
        Por cada material recomendado, proporciona:
        - Nombre del material
        - Ventajas principales
        - Consideraciones importantes
        - Rango de precios aproximado
        - Alternativas económicas si el presupuesto es limitado
        
        Formatea la respuesta como JSON con la siguiente estructura:
        {
          "recomendaciones": [
            {
              "material": "Nombre del material",
              "ventajas": ["ventaja 1", "ventaja 2"],
              "consideraciones": ["consideración 1", "consideración 2"],
              "rangoPrecio": "Rango de precio en USD",
              "alternativasEconomicas": ["alternativa 1", "alternativa 2"]
            }
          ],
          "comentariosAdicionales": "Cualquier comentario relevante sobre la selección"
        }
      `;
      
      // Generar recomendaciones con Mistral para costos optimizados
      const recommendationsResult = await this.mistralClient.generateCompletion(recommendationPrompt);
      
      // Procesar y publicar resultados
      try {
        // Extraer JSON
        const jsonMatch = recommendationsResult.match(/```json\n([\s\S]*?)\n```/) || 
                         recommendationsResult.match(/{[\s\S]*}/);
                         
        const jsonString = jsonMatch ? jsonMatch[1] || jsonMatch[0] : recommendationsResult;
        const recommendations = JSON.parse(jsonString);
        
        this.messageBroker.publish('deepsearch.material-recommendations-result', {
          requestId,
          success: true,
          recommendations
        });
      } catch (parseError) {
        // Enviar el resultado en texto plano si falla el parsing
        this.logWarning('Error al parsear JSON de recomendaciones', parseError);
        
        this.messageBroker.publish('deepsearch.material-recommendations-result', {
          requestId,
          success: true,
          recommendations: { rawRecommendations: recommendationsResult }
        });
      }
      
    } catch (error) {
      this.logError('Error al obtener recomendaciones de materiales', error);
      
      // Reportar error
      this.messageBroker.publish('error-handler.report-error', {
        serviceName: this.serviceName,
        operation: 'getMaterialRecommendations',
        error,
        context: { requestId }
      });
      
      // Publicar respuesta de error
      this.messageBroker.publish('deepsearch.material-recommendations-result', {
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }
  
  /**
   * Busca proyectos similares basados en una imagen
   */
  private async handleSearchByImage(message: any): Promise<void> {
    const { requestId, imageData, imageUrl } = message;
    
    try {
      let imageDescription;
      
      // Obtener descripción de la imagen
      if (imageData || imageUrl) {
        // Usar OpenAI Vision para analizar la imagen
        const source = imageData ? { base64: imageData } : { url: imageUrl };
        
        imageDescription = await this.openAIClient.describeImage(source, 
          "Describe detalladamente esta imagen de un proyecto de cercado o deck. " +
          "Incluye dimensiones aproximadas, materiales visibles, estilo, características " +
          "especiales y cualquier otro detalle relevante para un contratista."
        );
      } else {
        throw new Error('Se requiere una imagen (datos o URL)');
      }
      
      // Usar la descripción para buscar proyectos similares
      const searchMessage = {
        requestId,
        projectDescription: imageDescription,
        specifications: {},
        parameters: {}
      };
      
      // Delegar a la función de búsqueda de proyectos similares
      await this.handleFindSimilarProjects(searchMessage);
      
    } catch (error) {
      this.logError('Error al buscar por imagen', error);
      
      // Reportar error
      this.messageBroker.publish('error-handler.report-error', {
        serviceName: this.serviceName,
        operation: 'searchByImage',
        error,
        context: { requestId }
      });
      
      // Publicar respuesta de error
      this.messageBroker.publish('deepsearch.similar-projects-result', {
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  }
  
  /**
   * Responde a solicitudes de health check
   */
  private async handleHealthCheck(message: any): Promise<void> {
    const { requestId } = message;
    
    try {
      const health = {
        status: 'healthy',
        uptime: process.uptime(),
        version: this.serviceVersion,
        stats: {
          searches: this.searchStats.totalSearches,
          cacheHitRate: this.searchStats.totalSearches > 0 
            ? (this.searchStats.cacheHits / this.searchStats.totalSearches * 100).toFixed(2) + '%'
            : '0%',
          averageResponseTime: this.searchStats.averageResponseTime.toFixed(2) + 'ms',
          activeQueries: this.searchStats.activeQueriesCount
        }
      };
      
      this.messageBroker.publish('deepsearch.health-check-result', {
        requestId,
        health
      });
    } catch (error) {
      this.logError('Error al generar health check', error);
      
      this.messageBroker.publish('deepsearch.health-check-result', {
        requestId,
        health: {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Error desconocido'
        }
      });
    }
  }
  
  /**
   * Crea texto para embedding de proyecto
   */
  private createProjectEmbeddingText(description: string, specifications: any, parameters: any): string {
    return `
      Descripción: ${description || ''}
      Especificaciones: ${JSON.stringify(specifications || {})}
      Parámetros: ${JSON.stringify(parameters || {})}
    `;
  }
  
  /**
   * Obtiene un resultado de la caché de búsquedas recientes
   */
  private getFromRecentSearchesCache(key: string): any | null {
    const cachedItem = this.recentSearchesCache.get(key);
    
    if (cachedItem && Date.now() - cachedItem.timestamp < this.CACHE_TTL) {
      return cachedItem.results;
    }
    
    // Eliminar item expirado si existe
    if (cachedItem) {
      this.recentSearchesCache.delete(key);
    }
    
    return null;
  }
  
  /**
   * Agrega un resultado a la caché de búsquedas recientes
   */
  private addToRecentSearchesCache(key: string, results: any): void {
    this.recentSearchesCache.set(key, {
      timestamp: Date.now(),
      results
    });
    
    // Limitar tamaño de caché si es necesario
    if (this.recentSearchesCache.size > 100) {
      // Eliminar entrada más antigua
      const oldestKey = [...this.recentSearchesCache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      
      this.recentSearchesCache.delete(oldestKey);
    }
  }
  
  /**
   * Genera una clave de caché única para una búsqueda
   */
  private generateCacheKey(operation: string, params: any): string {
    return `${operation}:${JSON.stringify(params)}`;
  }
  
  /**
   * Mejora resultados de búsqueda con el modelo LLM
   */
  private async enhanceSearchResults(results: any[], query: string, specifications: any): Promise<any[]> {
    // Si no hay resultados, no hay nada que mejorar
    if (!results || results.length === 0) {
      return [];
    }
    
    try {
      // Preparar los resultados para el análisis
      const resultsForAnalysis = results.map(r => ({
        id: r.id,
        data: r.data,
        similarity: r.similarity
      }));
      
      // Prompt para mejorar y ordenar resultados
      const enhancementPrompt = `
        Analiza los siguientes resultados de búsqueda para un proyecto con esta descripción:
        "${query}"
        
        Especificaciones adicionales: ${JSON.stringify(specifications || {})}
        
        Resultados de búsqueda:
        ${JSON.stringify(resultsForAnalysis, null, 2)}
        
        Por favor:
        1. Reordena los resultados por relevancia real (no solo por similitud numérica)
        2. Añade un campo 'relevanceExplanation' a cada resultado explicando por qué es relevante
        3. Añade un campo 'matchScore' con un valor de 0-100 representando la utilidad real
        4. Elimina cualquier resultado que sea claramente irrelevante
        
        Devuelve solo el array JSON de resultados mejorados.
      `;
      
      // Usar Mistral para el análisis (más económico que OpenAI para esta tarea)
      const enhancementResult = await this.mistralClient.generateCompletion(enhancementPrompt);
      
      // Extraer y procesar el JSON resultante
      try {
        const jsonMatch = enhancementResult.match(/```json\n([\s\S]*?)\n```/) || 
                         enhancementResult.match(/\[([\s\S]*?)\]/);
                         
        const jsonString = jsonMatch ? jsonMatch[1] || jsonMatch[0] : enhancementResult;
        const enhancedResults = JSON.parse(jsonString);
        
        return enhancedResults;
      } catch (parseError) {
        this.logWarning('Error al parsear resultados mejorados, usando originales', parseError);
        return results;
      }
    } catch (error) {
      this.logWarning('Error al mejorar resultados, usando originales', error);
      return results;
    }
  }
  
  /**
   * Extrae parámetros de texto cuando el parsing JSON falla
   */
  private manuallyExtractParameters(text: string): any {
    const parameters: any = {};
    
    // Expresiones regulares para detectar parámetros comunes
    const regexPatterns = {
      typeOfProject: /tipo\s+de\s+proyecto[:\s]+([^,\n.]+)/i,
      length: /longitud[:\s]+(\d+(?:\.\d+)?)\s*(?:m|ft|feet|pies)/i,
      height: /altura[:\s]+(\d+(?:\.\d+)?)\s*(?:m|ft|feet|pies)/i,
      area: /área[:\s]+(\d+(?:\.\d+)?)\s*(?:m2|ft2|sq\s*ft)/i,
      materials: /materiales(?:\s+principales)?[:\s]+([^,\n.]+)/i,
      specialFeatures: /características\s+especiales[:\s]+([^,\n.]+)/i,
      requirements: /requisitos\s+específicos[:\s]+([^,\n.]+)/i,
      location: /ubicación[:\s]+([^,\n.]+)/i
    };
    
    // Extraer cada parámetro
    for (const [key, regex] of Object.entries(regexPatterns)) {
      const match = text.match(regex);
      if (match && match[1]) {
        parameters[key] = match[1].trim();
      }
    }
    
    return parameters;
  }
  
  /**
   * Actualiza estadísticas de tiempo de respuesta
   */
  private updateResponseTimeStats(responseTime: number): void {
    // Actualizar el tiempo promedio de respuesta con un factor de decaimiento
    const alpha = 0.05; // Factor de ponderación para nuevo valor (5%)
    this.searchStats.averageResponseTime = 
      (1 - alpha) * this.searchStats.averageResponseTime + alpha * responseTime;
  }
  
  /**
   * Inicia tarea periódica para limpieza de caché
   */
  private startCacheCleanupTask(): void {
    // Limpiar caché cada hora
    setInterval(() => {
      const now = Date.now();
      let expiredCount = 0;
      
      // Eliminar entradas expiradas
      for (const [key, value] of this.recentSearchesCache.entries()) {
        if (now - value.timestamp > this.CACHE_TTL) {
          this.recentSearchesCache.delete(key);
          expiredCount++;
        }
      }
      
      if (expiredCount > 0) {
        this.logInfo(`Limpieza de caché: ${expiredCount} entradas expiradas eliminadas`);
      }
    }, 60 * 60 * 1000); // Cada hora
  }
}
