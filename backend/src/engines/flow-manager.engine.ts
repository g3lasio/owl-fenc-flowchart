import { DeepSearchEngine } from './deepsearch.engine';
import { IntelligentQueryEngine } from './intelligent-query.engine';
import { AdaptiveLearningEngine } from './adaptive-learning.engine';
import { OpenAIClient } from '../services/openai.client';
import { AnthropicClient } from '../services/anthropic.client';
import { PriceApiService } from '../services/price-api.service';
import { PriceResearchService } from '../services/price-research.service';
import { ConstructionMethodService } from '../services/construction-method.service';
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
  private mervinConversationContext: Map<string, any> = new Map();
  
  constructor(
    private readonly openAIClient: OpenAIClient,
    private readonly anthropicClient: AnthropicClient,
    private readonly priceApiService: PriceApiService,
    private readonly priceResearchService: PriceResearchService,
    private readonly constructionMethodService: ConstructionMethodService,
    private readonly apiUsageService: ApiUsageService,
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
  }

  /**
   * Inicia el proceso de generación de estimado, ya sea en modo chat o manual
   */
  async startEstimateProcess(
    mode: InputMode,
    initialData?: any
  ): Promise<{ sessionId: string, nextStep: string, requiredInfo?: any }> {
    // Generar ID de sesión único
    const sessionId = this.generateSessionId();
    
    // Inicializar contexto según modo
    this.initializeContext(sessionId, mode, initialData);
    
    // Determinar siguiente paso basado en datos iniciales
    const nextStep = this.determineNextStep(sessionId);
    const requiredInfo = this.getRequiredInfoForStep(sessionId, nextStep);
    
    // Registrar inicio del proceso
    this.logActivityStart(sessionId, mode);
    
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
   * Procesa detalles del proyecto con validación inteligente
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
   * Maneja una pregunta en modo chat (Mervin) con inteligencia avanzada
   */
  async processChatMessage(
    sessionId: string,
    message: string
  ): Promise<{ 
    response: string, 
    isActionRequired: boolean, 
    action?: string, 
    requiredInfo?: any,
    intelligentQuestions?: string[]
  }> {
    // Obtener el contexto actual de la conversación
    const context = this.getConversationContext(sessionId);
    
    // Analizar la intención del mensaje
    const { intent, entities } = await this.analyzeMessageIntent(message, context);
    
    // Actualizar el contexto con la nueva información extraída
    this.updateChatContext(sessionId, message, intent, entities);
    
    // MEJORA: Si se detecta un tipo de proyecto, generar preguntas inteligentes
    let intelligentQuestions: string[] | undefined;
    
    if (entities.type || context.project?.type) {
      const projectType = entities.type || context.project?.type;
      const projectDetails = this.extractProjectDetailsFromContext(sessionId);
      
      // Obtener el historial de conversación para contexto
      const conversationHistory = context.chatHistory ? 
        context.chatHistory.slice(-5).map(msg => msg.message) : 
        undefined;
      
      // Generar preguntas inteligentes basadas en el tipo de proyecto
      intelligentQuestions = await this.intelligentQueryEngine.generateAdditionalQuestions(
        projectType,
        projectDetails,
        conversationHistory
      );
    }
    
    // Procesar la intención y generar respuesta
    const response = await this.generateChatResponse(sessionId, intent, entities);
    
    // Determinar si se requiere una acción específica
    const actionRequired = this.determineIfActionRequired(intent, entities, context);
    
    if (actionRequired.isRequired) {
      return {
        response: response,
        isActionRequired: true,
        action: actionRequired.action,
        requiredInfo: actionRequired.requiredInfo,
        intelligentQuestions
      };
    }
    
    return {
      response,
      isActionRequired: false,
      intelligentQuestions
    };
  }

  /**
   * Genera un estimado preliminar usando el motor DeepSearch y conocimiento adaptativo
   */
  private async generatePreliminaryEstimate(sessionId: string): Promise<any> {
    const context = this.getSessionContext(sessionId);
    const { projectType, projectSubtype, dimensions, options, location } = this.extractProjectParams(context);
    
    try {
      // MEJORA: Aplicar conocimiento adaptativo al generar el estimado
      let projectSubtypeToUse = projectSubtype;
      let markupToUse: number | undefined = undefined;
      
      // Si hay recomendaciones adaptativas, usarlas
      if (context.adaptiveRecommendations) {
        const recommendations = context.adaptiveRecommendations;
        
        // Si no se especificó un subtipo/material pero tenemos recomendaciones, usar la primera
        if (!projectSubtypeToUse && recommendations.recommendedMaterials && recommendations.recommendedMaterials.length > 0) {
          projectSubtypeToUse = recommendations.recommendedMaterials[0];
        }
        
        // Usar el markup sugerido si está disponible
        if (recommendations.suggestedMarkup) {
          markupToUse = recommendations.suggestedMarkup;
        }
      }
      
      // Usar el motor DeepSearch para análisis detallado
      const result = await this.deepSearchEngine.analyzeProject(
        projectType,
        projectSubtypeToUse || 'standard',
        dimensions,
        {
          ...options,
          preferredMarkup: markupToUse // Pasar el markup adaptativo si está disponible
        },
        location
      );
      
      // Guardar resultado en el contexto
      this.saveEstimateToContext(sessionId, result);
      
      // Formatear para presentación preliminar
      return this.formatPreliminaryEstimate(result, context);
    } catch (error) {
      console.error('Error generando estimado preliminar:', error);
      // Usar cálculo de respaldo si DeepSearch falla
      return this.generateFallbackEstimate(context);
    }
  }

  /**
   * Extrae detalles del proyecto del contexto de la sesión
   */
  private extractProjectDetailsFromContext(sessionId: string): ProjectDetails {
    const context = this.getSessionContext(sessionId);
    const project = context.project || {};
    
    return {
      type: project.type || '',
      subtype: project.subtype,
      material: project.material,
      dimensions: project.dimensions || {},
      style: project.style,
      color: project.color,
      finish: project.finish,
      gates: project.gates,
      railingType: project.railingType,
      stairs: project.stairs,
      demolition: project.demolition,
      permitNeeded: project.permitNeeded,
      options: project.options,
      notes: project.notes
    };
  }

  /**
   * Guarda recomendaciones adaptativas en el contexto
   */
  private saveAdaptiveRecommendationsToContext(sessionId: string, recommendations: any): void {
    const context = this.getSessionContext(sessionId);
    context.adaptiveRecommendations = recommendations;
    this.mervinConversationContext.set(sessionId, context);
  }

  // Métodos auxiliares

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateEstimateId(): string {
    return `est_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  private initializeContext(sessionId: string, mode: InputMode, initialData?: any): void {
    const context = {
      mode,
      createdAt: new Date(),
      status: 'started',
      client: initialData?.client || null,
      project: initialData?.project || {},
      estimate: null,
      chatHistory: mode === 'chat' ? [] : null
    };
    
    this.mervinConversationContext.set(sessionId, context);
  }

  private getSessionContext(sessionId: string): any {
    return this.mervinConversationContext.get(sessionId) || {};
  }

  private getConversationContext(sessionId: string): any {
    const context = this.getSessionContext(sessionId);
    return {
      ...context,
      recentMessages: context.chatHistory ? context.chatHistory.slice(-5) : []
    };
  }

  private updateClientContext(sessionId: string, client: Client, source: ClientSource): void {
    const context = this.getSessionContext(sessionId);
    context.client = client;
    context.clientSource = source;
    this.mervinConversationContext.set(sessionId, context);
  }

  private updateProjectContext(sessionId: string, projectDetails: ProjectDetails): void {
    const context = this.getSessionContext(sessionId);
    context.project = {
      ...context.project,
      ...projectDetails
    };
    this.mervinConversationContext.set(sessionId, context);
  }

  private validateClientData(clientData: Client): Client {
    // Implementar validaciones aquí
    return clientData;
  }

  private validateProjectDetails(projectDetails: ProjectDetails): ProjectDetails {
    // Implementar validaciones aquí
    return projectDetails;
  }

  private async processProjectImages(sessionId: string, images: ProjectImage[]): Promise<void> {
    // Procesar imágenes y extraer información relevante
    if (images.length === 0) return;
    
    const context = this.getSessionContext(sessionId);
    context.project.images = images;
    
    // Opcional: Analizar imágenes con IA para extraer información adicional
    // const imageAnalysis = await this.analyzeProjectImages(images);
    // context.project.imageAnalysis = imageAnalysis;
    
    this.mervinConversationContext.set(sessionId, context);
  }

  private determineNextStep(sessionId: string): string {
    const context = this.getSessionContext(sessionId);
    
    if (!context.client) {
      return 'client_info';
    }
    
    if (!context.project || Object.keys(context.project).length === 0) {
      return 'project_details';
    }
    
    if (!this.isProjectInfoComplete(sessionId)) {
      return 'additional_project_info';
    }
    
    if (!context.estimate) {
      return 'generate_estimate';
    }
    
    return 'review_estimate';
  }

  private isProjectInfoComplete(sessionId: string): boolean {
    const context = this.getSessionContext(sessionId);
    const project = context.project || {};
    
    // Verificar campos requeridos según tipo de proyecto
    const requiredFields = this.getRequiredFieldsForProject(project.type);
    
    return requiredFields.every(field => {
      const value = this.getNestedProperty(project, field);
      return value !== undefined && value !== null && value !== '';
    });
  }

  private getRequiredFieldsForProject(projectType: string): string[] {
    // Campos requeridos según tipo de proyecto
    const commonFields = ['type', 'subtype', 'dimensions'];
    
    switch (projectType) {
      case 'fencing':
        return [...commonFields, 'dimensions.length', 'dimensions.height', 'material'];
      case 'decking':
        return [...commonFields, 'dimensions.squareFeet', 'material'];
      case 'concrete':
        return [...commonFields, 'dimensions.squareFeet', 'dimensions.thickness'];
      default:
        return commonFields;
    }
  }

  private getNestedProperty(obj: any, path: string): any {
    const parts = path.split('.');
    return parts.reduce((prev, curr) => {
      return prev && prev[curr] !== undefined ? prev[curr] : undefined;
    }, obj);
  }

  private identifyMissingProjectInfo(sessionId: string): string[] {
    const context = this.getSessionContext(sessionId);
    const project = context.project || {};
    
    // Determinar campos faltantes
    const requiredFields = this.getRequiredFieldsForProject(project.type);
    
    return requiredFields.filter(field => {
      const value = this.getNestedProperty(project, field);
      return value === undefined || value === null || value === '';
    });
  }

  private updateAdditionalContext(sessionId: string, additionalInfo: any): void {
    const context = this.getSessionContext(sessionId);
    
    // Actualizar proyecto con información adicional
    context.project = {
      ...context.project,
      ...additionalInfo
    };
    
    // Para dimensiones y otras propiedades anidadas
    if (additionalInfo.dimensions) {
      context.project.dimensions = {
        ...context.project.dimensions,
        ...additionalInfo.dimensions
      };
    }
    
    this.mervinConversationContext.set(sessionId, context);
  }

  private getRequiredInfoForStep(sessionId: string, step: string): any {
    // Devolver la información necesaria para el paso actual
    const context = this.getSessionContext(sessionId);
    
    switch (step) {
      case 'client_info':
        return {
          fields: ['name', 'email', 'phone', 'address'],
          options: {
            canSelectExisting: true
          }
        };
      
      case 'project_details':
        return {
          fields: ['type', 'subtype', 'dimensions'],
          supportedTypes: ['fencing', 'decking', 'concrete'],
          allowImages: true
        };
      
      case 'additional_project_info':
        return {
          fields: this.identifyMissingProjectInfo(sessionId)
        };
      
      case 'review_estimate':
        return {
          canAdjust: true,
          canFinalize: true
        };
      
      default:
        return {};
    }
  }

  private extractProjectParams(context: any): { 
    projectType: string, 
    projectSubtype: string, 
    dimensions: any, 
    options: any, 
    location: Location 
  } {
    const project = context.project || {};
    
    return {
      projectType: project.type || 'fencing',
      projectSubtype: project.subtype || project.material || 'wood',
      dimensions: project.dimensions || {},
      options: {
        material: project.material,
        style: project.style,
        finish: project.finish,
        railingType: project.railingType,
        gates: project.gates,
        ...project.options
      },
      location: this.extractLocationFromContext(context)
    };
  }

  private extractLocationFromContext(context: any): Location {
    const client = context.client || {};
    const address = client.address || {};
    
    return {
      city: address.city || '',
      state: address.state || '',
      zipCode: address.zipCode || ''
    };
  }

  private saveEstimateToContext(sessionId: string, estimate: ProjectResult): void {
    const context = this.getSessionContext(sessionId);
    context.estimate = estimate;
    this.mervinConversationContext.set(sessionId, context);
  }

  private formatPreliminaryEstimate(estimate: ProjectResult, context: any): any {
    // Formatear los datos del estimado para presentación
    return {
      clientName: context.client?.name,
      projectType: context.project?.type,
      projectSubtype: context.project?.subtype,
      materials: estimate.materials,
      services: estimate.services,
      materialCost: estimate.materialCost,
      laborCost: estimate.laborCost,
      equipmentCost: estimate.equipmentCost,
      total: estimate.totalCost,
      pricePerUnit: estimate.pricePerUnit,
      timeEstimate: estimate.timeEstimate
    };
  }

  private generateFallbackEstimate(context: any): any {
    // Generar un estimado básico de respaldo cuando falla DeepSearch
    const project = context.project || {};
    
    // Estimado mínimo viable
    return {
      clientName: context.client?.name,
      projectType: project.type || 'unknown',
      projectSubtype: project.subtype || project.material || 'unknown',
      materials: [],
      services: [],
      materialCost: 0,
      laborCost: 0,
      equipmentCost: 0,
      total: 0,
      pricePerUnit: 0,
      timeEstimate: { minDays: 0, maxDays: 0 }
    };
  }

  private applyEstimateAdjustments(sessionId: string, adjustments: any): void {
    const context = this.getSessionContext(sessionId);
    const currentEstimate = context.estimate;
    
    if (!currentEstimate) return;
    
    // Aplicar ajustes al estimado actual
    // Esto modificará precios, cantidades, etc.
    if (adjustments.materialAdjustments) {
      this.adjustMaterials(currentEstimate, adjustments.materialAdjustments);
    }
    
    if (adjustments.laborAdjustments) {
      this.adjustLabor(currentEstimate, adjustments.laborAdjustments);
    }
    
    if (adjustments.markupAdjustment) {
      currentEstimate.recommendedMarkup = adjustments.markupAdjustment;
    }
    
    // Recalcular totales
    this.recalculateEstimateTotals(currentEstimate);
    
    // Guardar cambios en el contexto
    context.estimate = currentEstimate;
    this.mervinConversationContext.set(sessionId, context);
  }

  private adjustMaterials(estimate: any, adjustments: any[]): void {
    // Aplicar ajustes a materiales
    adjustments.forEach(adj => {
      const material = estimate.materials.find(m => m.id === adj.id);
      if (material) {
        if (adj.quantity !== undefined) material.quantity = adj.quantity;
        if (adj.unitPrice !== undefined) material.unitPrice = adj.unitPrice;
      }
    });
  }

  private adjustLabor(estimate: any, adjustments: any[]): void {
    // Aplicar ajustes a servicios/mano de obra
    adjustments.forEach(adj => {
      const service = estimate.services.find(s => s.id === adj.id);
      if (service) {
        if (adj.hours !== undefined) service.hours = adj.hours;
        if (adj.hourlyRate !== undefined) service.hourlyRate = adj.hourlyRate;
      }
    });
  }

  private recalculateEstimateTotals(estimate: any): void {
    // Recalcular costos totales después de ajustes
    estimate.materialCost = estimate.materials.reduce(
      (sum, item) => sum + (item.quantity * item.unitPrice), 0
    );
    
    estimate.laborCost = estimate.services.reduce(
      (sum, item) => sum + (item.hours * item.hourlyRate), 0
    );
    
    const subtotal = estimate.materialCost + estimate.laborCost + estimate.equipmentCost;
    const markup = subtotal * estimate.recommendedMarkup;
    
    estimate.totalCost = subtotal + markup;
  }

  private applyFinalCustomizations(estimate: any, context: any): any {
    // Personalizar el estimado final con branding del contratista, etc.
    const contractor = context.contractor || {};
    
    return {
      ...estimate,
      contractorInfo: {
        name: contractor.name || 'Your Contractor',
        logo: contractor.logo,
        contact: contractor.contact,
        license: contractor.license
      },
      clientInfo: context.client,
      projectSummary: this.generateProjectSummary(context.project),
      terms: contractor.terms || this.getDefaultTerms(),
      expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 días
    };
  }

  private generateProjectSummary(project: any): string {
    // Generar resumen descriptivo del proyecto
    const type = project.type || 'construction';
    const subtype = project.subtype || project.material || '';
    const dimensions = project.dimensions || {};
    
    let summary = `${subtype} ${type} project`;
    
    if (dimensions.length) {
      summary += ` of ${dimensions.length} linear feet`;
    } else if (dimensions.squareFeet) {
      summary += ` of ${dimensions.squareFeet} square feet`;
    }
    
    if (dimensions.height) {
      summary += ` with a height of ${dimensions.height} feet`;
    }
    
    return summary;
  }

  private getDefaultTerms(): string {
    return 'Estimate valid for 30 days. 50% deposit required to begin work. Balance due upon completion.';
  }

  private updateChatContext(sessionId: string, message: string, intent: string, entities: any): void {
    const context = this.getSessionContext(sessionId);
    
    // Añadir mensaje al historial
    if (!context.chatHistory) context.chatHistory = [];
    context.chatHistory.push({
      message,
      timestamp: new Date(),
      intent,
      entities
    });
    
    // Actualizar contexto del proyecto con entidades extraídas si son relevantes
    this.updateProjectContextFromEntities(sessionId, entities);
    
    this.mervinConversationContext.set(sessionId, context);
  }

  private updateProjectContextFromEntities(sessionId: string, entities: any): void {
    if (!entities || Object.keys(entities).length === 0) return;
    
    const context = this.getSessionContext(sessionId);
    const project = context.project || {};
    
    // Entidades que podrían actualizar el proyecto
    const projectFields = [
      'type', 'subtype', 'material', 'style', 'color', 'finish', 
      'has_gates', 'gate_count', 'gate_width'
    ];
    
    // Dimensiones que podrían ser actualizadas
    const dimensionFields = [
      'length', 'height', 'width', 'square_feet', 'square_meters',
      'thickness', 'depth'
    ];
    
    // Actualizar campos del proyecto
    projectFields.forEach(field => {
      if (entities[field] !== undefined) {
        project[field] = entities[field];
      }
    });
    
    // Actualizar dimensiones
    let dimensions = project.dimensions || {};
    dimensionFields.forEach(field => {
      if (entities[field] !== undefined) {
        // Convertir a número si es posible
        const value = typeof entities[field] === 'string' 
          ? parseFloat(entities[field]) || entities[field] 
          : entities[field];
        
        dimensions[field] = value;
      }
    });
    project.dimensions = dimensions;
    
    // Manejar puertas (gates) si se mencionan
    if (entities.has_gates || entities.gate_count) {
      project.gates = project.gates || [];
      const gateCount = entities.gate_count || (entities.has_gates ? 1 : 0);
      const gateWidth = entities.gate_width || 4; // ancho por defecto en pies
      
      // Ajustar array de puertas según nueva información
      if (gateCount > project.gates.length) {
        // Añadir nuevas puertas
        for (let i = project.gates.length; i < gateCount; i++) {
          project.gates.push({ width: gateWidth });
        }
      } else if (gateCount < project.gates.length) {
        // Reducir número de puertas
        project.gates = project.gates.slice(0, gateCount);
      }
    }
    
    // Actualizar proyecto en el contexto
    context.project = project;
    this.mervinConversationContext.set(sessionId, context);
  }

  private determineIfActionRequired(intent: string, entities: any, context: any): { isRequired: boolean, action?: string, requiredInfo?: any } {
    // Determinar si se necesita alguna acción basada en la intención
    switch (intent) {
      case 'solicitar_estimado':
        // Si hay suficiente información para comenzar un estimado
        if (this.hasMinimumEstimateInfo(entities, context)) {
          return {
            isRequired: true,
            action: 'start_estimate',
            requiredInfo: this.extractEstimateInfoFromEntities(entities)
          };
        }
        break;
        
      case 'añadir_cliente':
        // Si se proporciona información de cliente
        if (this.hasClientInfo(entities)) {
          return {
            isRequired: true,
            action: 'add_client',
            requiredInfo: this.extractClientInfoFromEntities(entities)
          };
        }
        break;
        
      case 'subir_imagen':
        return {
          isRequired: true,
          action: 'request_image'
        };
        
      case 'finalizar_estimado':
        if (context.estimate) {
          return {
            isRequired: true,
            action: 'finalize_estimate'
          };
        }
        break;
    }
    
    return { isRequired: false };
  }

  private hasMinimumEstimateInfo(entities: any, context: any): boolean {
    // Verificar si hay mínimo de información para un estimado
    return Boolean(
      (entities.type || context.project?.type) &&
      (
        (entities.length || context.project?.dimensions?.length) ||
        (entities.square_feet || context.project?.dimensions?.squareFeet)
      )
    );
  }

  private hasClientInfo(entities: any): boolean {
    // Verificar si hay información de cliente
    return Boolean(entities.client_name || entities.client_email || entities.client_phone);
  }

  private extractEstimateInfoFromEntities(entities: any): any {
    // Extraer información para estimado
    const projectInfo: any = {};
    
    if (entities.type) projectInfo.type = entities.type;
    if (entities.subtype) projectInfo.subtype = entities.subtype;
    if (entities.material) projectInfo.material = entities.material;
    
    // Dimensiones
    projectInfo.dimensions = {};
    if (entities.length) projectInfo.dimensions.length = entities.length;
    if (entities.height) projectInfo.dimensions.height = entities.height;
    if (entities.width) projectInfo.dimensions.width = entities.width;
    if (entities.square_feet) projectInfo.dimensions.squareFeet = entities.square_feet;
    if (entities.thickness) projectInfo.dimensions.thickness = entities.thickness;
    
    return projectInfo;
  }

  private extractClientInfoFromEntities(entities: any): any {
    // Extraer información de cliente
    const clientInfo: any = {};
    
    if (entities.client_name) clientInfo.name = entities.client_name;
    if (entities.client_email) clientInfo.email = entities.client_email;
    if (entities.client_phone) clientInfo.phone = entities.client_phone;
    if (entities.client_address) clientInfo.address = entities.client_address;
    
    return clientInfo;
  }

  private generateEstimateRequestResponse(entities: any, context: any): string {
    // Generar respuesta para solicitud de estimado
    const projectType = entities.type || context.project?.type || 'proyecto';
    
    return `¡Perfecto! Vamos a preparar un estimado para tu ${projectType}. ` +
           `Ya tengo algunos detalles, pero necesitaré un poco más de información para darte un estimado preciso.`;
  }

  private generatePriceInformationResponse(entities: any, context: any): string {
    // Generar respuesta sobre precios
    const material = entities.material || context.project?.material || 'material';
    const projectType = entities.type || context.project?.type || 'proyecto';
    
    return `Para un ${projectType} de ${material}, los precios típicamente oscilan entre $X y $Y por unidad. ` +
           `Sin embargo, para darte un precio exacto, necesitaría conocer las dimensiones específicas y otros detalles del proyecto.`;
  }

  private generateDetailConfirmationResponse(entities: any): string {
    // Confirmar que se ha recibido un detalle
    const detailType = Object.keys(entities)[0] || 'detalle';
    
    return `Gracias por proporcionar ese ${detailType}. Lo he añadido a la información del proyecto. ` +
           `¿Hay algo más que quieras añadir o modificar?`;
  }

  private generateMaterialInformationResponse(entities: any, context: any): string {
    // Información sobre materiales
    const material = entities.material || 'este material';
    
    return `${material} es una excelente opción para este tipo de proyecto. Algunas características importantes son la durabilidad, ` +
           `el mantenimiento requerido y el costo. ¿Te gustaría que te proporcione más detalles sobre alguna de estas características?`;
  }

  private generateHelpResponse(context: any): string {
    // Respuesta de ayuda general
    return `Puedo ayudarte con lo siguiente:\n` +
           `1. Crear un estimado para tu proyecto de construcción\n` +
           `2. Proporcionar información sobre materiales y opciones\n` +
           `3. Calcular costos y tiempos estimados\n` +
           `4. Responder preguntas sobre el proceso\n\n` +
           `¿En qué puedo ayudarte específicamente?`;
  }

  private generateGenericResponse(intent: string, entities: any, context: any): string {
    // Respuesta genérica para otras intenciones
    return `Entiendo que estás interesado en obtener más información. ` +
           `Para ayudarte mejor, ¿podrías proporcionarme más detalles sobre tu proyecto?`;
  }

  private logActivityStart(sessionId: string, mode: InputMode): void {
    // Registrar inicio de actividad para análisis
    this.apiUsageService.logActivity({
      type: 'estimate_start',
      sessionId,
      mode,
      timestamp: new Date()
    });
  }

  private logActivityComplete(sessionId: string): void {
    // Registrar finalización de actividad
    const context = this.getSessionContext(sessionId);
    
    this.apiUsageService.logActivity({
      type: 'estimate_complete',
      sessionId,
      mode: context.mode,
      clientId: context.client?.id,
      projectType: context.project?.type,
      timestamp: new Date()
    });
  }
}