import { DeepSearchEngine } from './deepsearch.engine';
import { IntelligentQueryEngine } from './intelligent-query.engine';
import { AdaptiveLearningEngine } from './adaptive-learning.engine';
import { UnstructuredInputEngine } from './unstructured-input.engine';
import { OpenAIClient } from '../services/openai.client';
import { AnthropicClient } from '../services/anthropic.client';
import { PriceApiService } from '../services/price-api.service';
import { PriceResearchService } from '../services/price-research.service';
import { ConstructionMethodService } from '../services/construction-method.service';
import { MaterialSupplierService } from '../services/material-supplier.service';
import { Client, ProjectDetails, EstimateResult, InputMode, ClientSource, ProjectImage } from '../interfaces/flow-manager.interfaces';
import { Location, ProjectResult } from '../interfaces/fence.interfaces';
import { ApiUsageService } from '../services/api-usage.service';
import { config } from '../config/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Motor Gestor de Flujo que coordina el proceso completo de generación de estimados
 * Este motor maneja tanto la interacción por chat (Mervin) como el modo manual,
 * recopilando información necesaria y generando documentos finales.
 * 
 * Incorpora inteligencia avanzada para hacer preguntas precisas y aprender del contratista.
 */
export class FlowManagerEngine {
  private deepSearchEngine: DeepSearchEngine;
  private intelligentQueryEngine: IntelligentQueryEngine;
  private adaptiveLearningEngine: AdaptiveLearningEngine;
  private unstructuredInputEngine: UnstructuredInputEngine;
  private mervinConversationContext: Map<string, any> = new Map();
  
  constructor(
    private readonly openAIClient: OpenAIClient,
    private readonly anthropicClient: AnthropicClient,
    private readonly priceApiService: PriceApiService,
    private readonly priceResearchService: PriceResearchService,
    private readonly constructionMethodService: ConstructionMethodService,
    private readonly apiUsageService: ApiUsageService,
    private readonly materialSupplierService: MaterialSupplierService,
    private readonly contractorId: string = 'default'
  ) {
    // Inicializar el motor DeepSearch
    this.deepSearchEngine = new DeepSearchEngine(
      this.openAIClient,
      this.anthropicClient,
      this.priceApiService,
      this.priceResearchService,
      this.constructionMethodService
    );
    
    // Inicializar el motor de consulta inteligente
    this.intelligentQueryEngine = new IntelligentQueryEngine(
      this.openAIClient,
      this.anthropicClient
    );
    
    // Inicializar el motor de aprendizaje adaptativo
    this.adaptiveLearningEngine = new AdaptiveLearningEngine(
      this.openAIClient,
      this.anthropicClient,
      this.contractorId
    );

    // Inicializar el motor de entrada no estructurada
    this.unstructuredInputEngine = new UnstructuredInputEngine(
      this.openAIClient,
      this.anthropicClient,
      this.materialSupplierService
    );
  }

  /**
   * Inicia el proceso de generación de estimado, ya sea en modo chat o manual
   * y carga la información del contratista
   */
  async startEstimateProcess(
    mode: InputMode,
    initialData?: any
  ): Promise<{ sessionId: string, nextStep: string, requiredInfo?: any }> {
    // Generar ID de sesión único
    const sessionId = this.generateSessionId();
    
    // Inicializar contexto según modo
    this.initializeContext(sessionId, mode, initialData);
    
    // MEJORA: Cargar información del contratista al inicio del proceso
    await this.loadContractorProfile(sessionId);
    
    // Inicializar sistemas de soporte
    this.progressTracker.initializeSession(sessionId);
    this.notificationSystem.initializeSession(sessionId);
    this.autoSaveSystem.initializeSession(sessionId, this.getSessionContext(sessionId));
    
    // Actualizar el estado de progreso
    this.progressTracker.updateProgress(sessionId, 'initialized');
    
    // Determinar siguiente paso basado en datos iniciales
    const nextStep = this.determineNextStep(sessionId);
    const requiredInfo = this.getRequiredInfoForStep(sessionId, nextStep);
    
    // Registrar inicio del proceso
    this.logActivityStart(sessionId, mode);
    
    // Añadir notificación de bienvenida
    this.notificationSystem.addInfoNotification(
      sessionId, 
      `Proceso de estimado iniciado en modo ${mode}. Bienvenido.`
    );
    
    return {
      sessionId,
      nextStep,
      requiredInfo
    };
  }

  /**
   * Procesa datos del cliente (existente o nuevo)
   */
  async processClientData(
    sessionId: string,
    clientData: Client,
    source: ClientSource
  ): Promise<{ nextStep: string, requiredInfo?: any }> {
    // Validar datos del cliente
    const validatedClient = this.validateClientData(clientData);
    
    // Actualizar contexto con info del cliente
    this.updateClientContext(sessionId, validatedClient, source);
    
    // Determinar el siguiente paso
    const nextStep = 'project_details';
    const requiredInfo = this.getRequiredInfoForStep(sessionId, nextStep);
    
    return {
      nextStep,
      requiredInfo
    };
  }

  /**
   * Procesa detalles del proyecto con validación inteligente mejorada
   * para garantizar una transición fluida hacia el cálculo del estimado
   */
  async processProjectDetails(
    sessionId: string,
    projectDetails: ProjectDetails,
    images?: ProjectImage[]
  ): Promise<{ nextStep: string, requiredInfo?: any, preliminaryEstimate?: any, intelligentQuestions?: string[] }> {
    // Validar detalles del proyecto
    const validatedDetails = this.validateProjectDetails(projectDetails);
    
    // Procesar imágenes si existen
    if (images && images.length > 0) {
      await this.processProjectImages(sessionId, images);
    }
    
    // Actualizar contexto con detalles del proyecto
    this.updateProjectContext(sessionId, validatedDetails);
    
    // MEJORA: Utilizar el motor de consulta inteligente para detectar discrepancias
    const discrepancyAnalysis = await this.intelligentQueryEngine.detectDiscrepancies(
      projectDetails.type,
      projectDetails
    );
    
    // Si hay discrepancias o preguntas inteligentes, devolverlas
    if (discrepancyAnalysis.hasDiscrepancies) {
      // Registrar las discrepancias en el contexto para seguimiento
      this.logDiscrepanciesInContext(sessionId, discrepancyAnalysis.issues);
      
      return {
        nextStep: 'resolve_discrepancies',
        requiredInfo: {
          issues: discrepancyAnalysis.issues,
          questions: discrepancyAnalysis.questions
        }
      };
    }
    
    // Verificar si se necesita más información
    const isInfoComplete = this.isProjectInfoComplete(sessionId);
    
    if (!isInfoComplete) {
      // MEJORA: Usar el motor de consulta inteligente para generar preguntas más específicas
      const context = this.getSessionContext(sessionId);
      const conversationHistory = context.chatHistory ? 
        context.chatHistory.map(msg => msg.message) : 
        undefined;
      
      const intelligentQuestions = await this.intelligentQueryEngine.generateAdditionalQuestions(
        projectDetails.type,
        projectDetails,
        conversationHistory
      );
      
      // Solicitar información adicional específica
      const missingInfo = this.identifyMissingProjectInfo(sessionId);
      return {
        nextStep: 'additional_project_info',
        requiredInfo: missingInfo,
        intelligentQuestions
      };
    }
    
    // MEJORA: Obtener recomendaciones adaptativas antes de generar el estimado
    const context = this.getSessionContext(sessionId);
    const clientId = context.client?.id;
    
    // Validación de mercado y precios antes de hacer el cálculo
    const marketValidation = await this.validateMarketConditions(
      projectDetails.type,
      projectDetails.location || this.extractLocationFromContext(context)
    );
    
    if (marketValidation.requiresAdjustment) {
      // Guardar ajustes recomendados en el contexto
      this.saveMarketAdjustmentsToContext(sessionId, marketValidation.adjustments);
    }
    
    const adaptiveRecommendations = await this.adaptiveLearningEngine.generateRecommendations(
      projectDetails.type,
      projectDetails,
      clientId
    );
    
    // Guardar recomendaciones en el contexto para usarlas en la generación del estimado
    this.saveAdaptiveRecommendationsToContext(sessionId, adaptiveRecommendations);
    
    // Si la información está completa, generar estimado preliminar
    const preliminaryEstimate = await this.generatePreliminaryEstimate(sessionId);
    
    return {
      nextStep: 'review_estimate',
      preliminaryEstimate,
      intelligentQuestions: adaptiveRecommendations.clientSpecificTips // Sugerencias específicas para el cliente
    };
  }

  /**
   * Procesa información adicional del proyecto cuando es necesario
   */
  async processAdditionalInfo(
    sessionId: string,
    additionalInfo: any
  ): Promise<{ nextStep: string, requiredInfo?: any, preliminaryEstimate?: any }> {
    // Actualizar contexto con información adicional
    this.updateAdditionalContext(sessionId, additionalInfo);
    
    // Verificar si ahora la información está completa
    const isInfoComplete = this.isProjectInfoComplete(sessionId);
    
    if (!isInfoComplete) {
      // Todavía se necesita más información
      const missingInfo = this.identifyMissingProjectInfo(sessionId);
      return {
        nextStep: 'additional_project_info',
        requiredInfo: missingInfo
      };
    }
    
    // Si la información está completa, generar estimado preliminar
    const preliminaryEstimate = await this.generatePreliminaryEstimate(sessionId);
    
    return {
      nextStep: 'review_estimate',
      preliminaryEstimate
    };
  }

  /**
   * Procesa una respuesta a preguntas inteligentes
   */
  async processIntelligentQuestionResponse(
    sessionId: string,
    responses: Record<string, any>
  ): Promise<{ nextStep: string, requiredInfo?: any, preliminaryEstimate?: any }> {
    // Actualizar el contexto con las respuestas
    this.updateAdditionalContext(sessionId, responses);
    
    // Verificar si ahora la información está completa
    const isInfoComplete = this.isProjectInfoComplete(sessionId);
    
    if (!isInfoComplete) {
      // Todavía necesitamos más información
      const context = this.getSessionContext(sessionId);
      const projectDetails = context.project || {};
      
      // Generar nuevas preguntas inteligentes
      const intelligentQuestions = await this.intelligentQueryEngine.generateAdditionalQuestions(
        projectDetails.type,
        projectDetails
      );
      
      const missingInfo = this.identifyMissingProjectInfo(sessionId);
      return {
        nextStep: 'additional_project_info',
        requiredInfo: missingInfo,
        intelligentQuestions
      };
    }
    
    // Si la información está completa, generar estimado preliminar
    const preliminaryEstimate = await this.generatePreliminaryEstimate(sessionId);
    
    return {
      nextStep: 'review_estimate',
      preliminaryEstimate
    };
  }

  /**
   * Procesa fotos y notas del contratista para generar un estimado
   * utilizando análisis de OCR e IA para extraer información relevante
   * @param sessionId ID de la sesión
   * @param images Imágenes/fotos del proyecto
   * @param notes Notas del contratista sobre el proyecto
   * @param location Ubicación del proyecto
   * @returns Estimado preliminar basado en análisis de fotos y notas
   */
  async processUnstructuredInput(
    sessionId: string,
    images: ProjectImage[],
    notes: string,
    location: Location
  ): Promise<{ 
    nextStep: string, 
    structuredData?: any, 
    preliminaryEstimate?: any, 
    detectedElements?: any 
  }> {
    try {
      console.log(`[FlowManager] Procesando entrada no estructurada: ${images.length} imágenes y notas`);
      
      // 1. Validar entrada
      if (images.length === 0) {
        throw new Error('Se requiere al menos una imagen para el análisis');
      }
      
      // 2. Utilizar el motor de entrada no estructurada para procesar los datos
      const structuredData = await this.unstructuredInputEngine.processUnstructuredInput(
        images,
        notes,
        location
      );
      
      // 3. Actualizar el contexto del proyecto con los datos extraídos
      const context = this.getSessionContext(sessionId);
      
      // Actualizar tipo y subtipo del proyecto si fueron detectados
      if (structuredData.projectType) {
        context.project = context.project || {};
        context.project.type = structuredData.projectType;
        
        if (structuredData.projectSubtype) {
          context.project.subtype = structuredData.projectSubtype;
        }
      }
      
      // Actualizar dimensiones detectadas
      if (Object.keys(structuredData.dimensions).length > 0) {
        context.project = context.project || {};
        context.project.dimensions = {
          ...context.project.dimensions || {},
          ...structuredData.dimensions
        };
      }
      
      // Actualizar opciones y materiales detectados
      if (Object.keys(structuredData.options).length > 0) {
        context.project = context.project || {};
        
        // Si se detectó material, asignarlo directamente
        if (structuredData.options.materials) {
          const materials = structuredData.options.materials;
          // Tomar el primer material como principal si hay varios
          if (typeof materials === 'object' && Object.keys(materials).length > 0) {
            context.project.material = Object.keys(materials)[0];
          } else if (typeof materials === 'string') {
            context.project.material = materials;
          }
        }
        
        // Actualizar otras opciones
        context.project.options = {
          ...context.project.options || {},
          ...structuredData.options
        };
        
        // Si se detectó demolición, actualizar directamente
        if (structuredData.options.demolitionNeeded !== undefined) {
          context.project.demolition = structuredData.options.demolitionNeeded;
        }
      }
      
      // Guardar contexto actualizado
      this.mervinConversationContext.set(sessionId, context);
      
      // 4. Verificar si hay suficiente información para generar un estimado
      const isInfoComplete = this.isProjectInfoComplete(sessionId);
      
      // 5. Si hay suficiente información, generar estimado preliminar
      let preliminaryEstimate = null;
      let nextStep = 'additional_project_info';
      
      if (isInfoComplete) {
        preliminaryEstimate = await this.generatePreliminaryEstimate(sessionId);
        nextStep = 'review_estimate';
      }
      
      return {
        nextStep,
        structuredData,
        preliminaryEstimate,
        detectedElements: structuredData.detectedElements
      };
      
    } catch (error) {
      console.error('Error procesando entrada no estructurada:', error);
      
      // Registrar el error y devolver un objeto de respuesta consistente
      return {
        nextStep: 'additional_project_info',
        structuredData: {
          projectType: 'unknown',
          dimensions: {},
          options: {},
          error: error.message
        }
      };
    }
  }

  /**
   * Finaliza el proceso de estimado y genera el documento final
   * con aprendizaje adaptativo
   */
  async finalizeEstimate(
    sessionId: string,
    adjustments?: any,
    wasAccepted: boolean = true,
    finalPrice?: number
  ): Promise<EstimateResult> {
    // Aplicar ajustes finales si existen
    if (adjustments) {
      this.applyEstimateAdjustments(sessionId, adjustments);
    }
    
    // Generar el estimado final con el motor DeepSearch
    const finalEstimate = await this.generateFinalEstimate(sessionId);
    
    // Generar PDF del estimado
    const pdfPath = await this.generateEstimatePDF(sessionId, finalEstimate);
    
    // MEJORA: Registrar el estimado en el motor de aprendizaje adaptativo
    const context = this.getSessionContext(sessionId);
    
    // Solo aprender si tenemos suficiente información
    if (context.client && context.project && finalEstimate) {
      await this.adaptiveLearningEngine.learnFromEstimate(
        finalEstimate,
        context.project,
        context.client,
        wasAccepted,
        finalPrice
      );
    }
    
    // Registrar finalización exitosa del proceso
    this.logActivityComplete(sessionId);
    
    return {
      estimateId: finalEstimate.estimateId,
      clientInfo: finalEstimate.clientInfo,
      projectSummary: finalEstimate.projectSummary,
      materialCost: finalEstimate.materialCost,
      laborCost: finalEstimate.laborCost,
      totalCost: finalEstimate.totalCost,
      pdfUrl: pdfPath,
      createdAt: new Date()
    };
  }

  /**
   * Maneja una pregunta en modo chat (Mervin) con inteligencia avanzada y conocimiento técnico específico
   */
  async processChatMessage(
    sessionId: string,
    message: string
  ): Promise<{ 
    response: string, 
    isActionRequired: boolean, 
    action?: string, 
    requiredInfo?: any,
    intelligentQuestions?: string[],
    technicalContext?: any
  }> {
    // Obtener el contexto actual de la conversación
    const context = this.getConversationContext(sessionId);
    
    // Analizar la intención del mensaje
    const { intent, entities } = await this.analyzeMessageIntent(message, context);
    
    // Actualizar el contexto con la nueva información extraída
    this.updateChatContext(sessionId, message, intent, entities);
    
    // Identificar si se mencionó un tipo específico de proyecto
    const projectType = this.extractProjectTypeFromMessage(message, entities) || 
                         context.project?.type || '';
    
    // MEJORA: Si se detecta un tipo de proyecto, generar preguntas técnicas específicas
    let intelligentQuestions: string[] | undefined;
    let technicalContext: any | undefined;
    
    if (projectType) {
      // Extraer los detalles del proyecto desde el contexto
      const projectDetails = this.extractProjectDetailsFromContext(sessionId);
      
      // Obtener el historial de conversación para contexto
      const conversationHistory = context.chatHistory ? 
        context.chatHistory.slice(-5).map(msg => msg.message) : 
        undefined;
      
      // Si es un nuevo tipo de proyecto detectado, registrarlo
      if (projectType !== context.project?.type) {
        this.updateProjectTypeInContext(sessionId, projectType);
      }
      
      // Generar preguntas técnicas avanzadas para este tipo de proyecto
      const technicalResponse = await this.intelligentQueryEngine.generateTechnicalQuestions(
        projectType,
        projectDetails
      );
      
      if (technicalResponse.questions.length > 0) {
        intelligentQuestions = technicalResponse.questions;
        technicalContext = technicalResponse.technicalContext;
      } else {
        // Si no hay preguntas técnicas específicas, generar preguntas generales
        intelligentQuestions = await this.intelligentQueryEngine.generateAdditionalQuestions(
          projectType,
          projectDetails,
          conversationHistory
        );
      }
    }
    
    // Procesar la intención y generar respuesta
    const response = await this.generateChatResponse(sessionId, intent, entities, technicalContext);
    
    // Determinar si se requiere una acción específica
    const actionRequired = this.determineIfActionRequired(intent, entities, context);
    
    if (actionRequired.isRequired) {
      return {
        response: response,
        isActionRequired: true,
        action: actionRequired.action,
        requiredInfo: actionRequired.requiredInfo,
        intelligentQuestions,
        technicalContext
      };
    }
    
    return {
      response,
      isActionRequired: false,
      intelligentQuestions,
      technicalContext
    };
  }

  /**
   * Extrae el tipo de proyecto de un mensaje o entidades identificadas
   */
  private extractProjectTypeFromMessage(message: string, entities: any): string | null {
    // Si las entidades ya tienen el tipo, usarlo
    if (entities.type) {
      return entities.type;
    }
    
    // Buscar palabras clave de tipos de proyecto en el mensaje
    const lowercaseMessage = message.toLowerCase();
    const projectTypeKeywords = {
      'roofing': ['techo', 'tejado', 'roof', 'tejas', 'shingles'],
      'fencing': ['cerca', 'fence', 'fencing', 'reja', 'verja'],
      'decking': ['terraza', 'deck', 'patio', 'platform'],
      'concrete': ['concreto', 'cemento', 'concrete', 'cement', 'slab', 'losa'],
      'painting': ['pintura', 'paint', 'painting', 'pintado']
    };
    
    for (const [type, keywords] of Object.entries(projectTypeKeywords)) {
      if (keywords.some(keyword => lowercaseMessage.includes(keyword))) {
        return type;
      }
    }
    
    return null;
  }

  /**
   * Actualiza el tipo de proyecto en el contexto cuando se identifica uno nuevo
   */
  private updateProjectTypeInContext(sessionId: string, projectType: string): void {
    const context = this.getSessionContext(sessionId);
    
    if (!context.project) {
      context.project = { 
        type: projectType,
        dimensions: {}
      };
    } else {
      context.project.type = projectType;
    }
    
    // Inicializar propiedades específicas según el tipo de proyecto
    if (projectType === 'roofing' && !context.project.roofPenetrations) {
      context.project.roofPenetrations = {
        chimneys: 0,
        skylights: 0,
        vents: 0
      };
    }
    
    this.mervinConversationContext.set(sessionId, context);
  }

  /**
   * Genera una respuesta de chat con conocimiento técnico incorporado
   */
  private async generateChatResponse(
    sessionId: string, 
    intent: string, 
    entities: any,
    technicalContext?: any
  ): Promise<string> {
    const context = this.getSessionContext(sessionId);
    
    // Preparar contexto técnico si existe
    let technicalInsight = '';
    if (technicalContext && Object.keys(technicalContext).length > 0) {
      technicalInsight = `
      Como experto en construcción, considera esta información técnica relevante:
      ${Object.entries(technicalContext)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n')}
      `;
    }
    
    // Crear un prompt basado en la intención y entidades
    const prompt = `
    Eres Mervin, un asistente especializado en generar estimados para contratistas.
    El contratista está interactuando contigo sobre un proyecto.
    
    Información del proyecto hasta ahora:
    ${JSON.stringify(context.project || {}, null, 2)}
    
    Intención detectada: ${intent}
    Entidades detectadas: ${JSON.stringify(entities, null, 2)}
    
    ${technicalInsight}
    
    Genera una respuesta profesional y experta que:
    1. Reconozca la información proporcionada
    2. Demuestre conocimiento técnico sobre el tipo de proyecto
    3. Solicite información adicional relevante si es necesario
    4. Sea concisa pero completa
    5. Use un tono conversacional pero profesional
    
    Si el proyecto es de techos (roofing), asegúrate de mostrar conocimiento sobre:
    - Importancia del número de capas existentes para determinar si se necesita remoción completa
    - La relación entre la inclinación del techo y los materiales adecuados
    - Factores que afectan la complejidad y costos como chimeneas, ventilaciones y claraboyas
    
    Si el proyecto es de cercas (fencing):
    - Aspectos de la instalación según el tipo de terreno
    - Consideraciones para las puertas y postes
    - Materiales adecuados según uso y condiciones climáticas
    
    Respuesta:
    `;
    
    try {
      const response = await this.anthropicClient.complete({
        prompt,
        model: 'claude-3-opus-20240229',
        maxTokens: 1000,
        temperature: 0.7
      });
      
      return response.trim();
    } catch (error) {
      console.error('Error generando respuesta de chat:', error);
      // Fallback por si falla la IA
      return this.generateFallbackResponse(intent, entities, context);
    }
  }

  /**
   * Obtiene los detalles del proyecto desde el contexto para mostrarlos en la interfaz de chat
   * @param sessionId ID de la sesión
   * @returns Detalles del proyecto extraídos del contexto actual
   */
  getProjectDetailsFromContext(sessionId: string): any {
    const context = this.getConversationContext(sessionId);
    
    if (!context) {
      return null;
    }
    
    // Extraer detalles básicos del proyecto
    const projectDetails = {
      type: context.project?.type,
      subtype: context.project?.subtype,
      material: context.project?.material,
      dimensions: context.project?.dimensions || {},
      style: context.project?.style,
      options: context.project?.options || {},
      client: context.client || {}
    };
    
    return projectDetails;
  }
  
  /**
   * Obtiene el estimado preliminar para mostrarlo en la interfaz de chat
   * @param sessionId ID de la sesión
   * @returns Estimado preliminar si está disponible
   */
  async getPreliminaryEstimate(sessionId: string): Promise<any> {
    try {
      // Si ya tenemos un estimado preliminar en el contexto, devolverlo
      const context = this.getConversationContext(sessionId);
      
      if (context && context.preliminaryEstimate) {
        return context.preliminaryEstimate;
      }
      
      // Si no tenemos un estimado en caché, intentar generarlo
      const isInfoComplete = this.isProjectInfoComplete(sessionId);
      
      if (isInfoComplete) {
        return await this.generatePreliminaryEstimate(sessionId);
      }
      
      return null;
    } catch (error) {
      console.error('Error al obtener estimado preliminar:', error);
      return null;
    }
  }
}