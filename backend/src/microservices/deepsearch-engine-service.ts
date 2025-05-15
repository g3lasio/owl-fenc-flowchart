import { MicroserviceBase, MessageBroker } from '../architecture/microservices-architecture';
import { OpenAIClient } from '../services/openai.client';
import { AnthropicClient } from '../services/anthropic.client';
import { PersistentCacheService } from '../services/persistent-cache.service';
import { PriceApiService } from '../services/price-api.service';
import { PriceResearchService } from '../services/price-research.service';
import { ConstructionMethodService } from '../services/construction-method.service';
import { ContractorProfileService } from '../services/contractor-profile.service';
import { MaterialCalculator } from '../calculators/material.calculator';
import { PricingCalculator } from '../calculators/pricing.calculator';
import { TimeEstimator } from '../calculators/time.estimator';
import { config } from '../config/config';

/**
 * Servicio de DeepSearch Engine para arquitectura de microservicios
 * 
 * Proporciona análisis avanzado y estimación precisa de proyectos
 * utilizando procesamiento paralelo y optimizaciones
 */
export class DeepSearchEngineService extends MicroserviceBase {
  private openAIClient: OpenAIClient;
  private anthropicClient: AnthropicClient;
  private priceApiService: PriceApiService;
  private priceResearchService: PriceResearchService;
  private constructionMethodService: ConstructionMethodService;
  private materialCache: PersistentCacheService;
  private materialCalculator: MaterialCalculator;
  private pricingCalculator: PricingCalculator;
  private timeEstimator: TimeEstimator;
  
  constructor(
    private readonly messageBroker: MessageBroker,
    private readonly cachePath: string = config.cache.cachePath
  ) {
    super('DeepSearchEngine', '1.0.0');
    
    // Inicializar clientes y servicios
    this.openAIClient = new OpenAIClient(config.openai.apiKey);
    this.anthropicClient = new AnthropicClient(config.anthropic.apiKey);
    this.priceApiService = new PriceApiService();
    this.priceResearchService = new PriceResearchService();
    this.constructionMethodService = new ConstructionMethodService();
    
    // Inicializar caché persistente para rendimiento mejorado
    this.materialCache = new PersistentCacheService(this.cachePath);
    
    // Inicializar calculadoras
    this.materialCalculator = new MaterialCalculator(
      this.priceApiService,
      this.openAIClient,
      this.anthropicClient
    );
    this.pricingCalculator = new PricingCalculator(this.priceResearchService);
    this.timeEstimator = new TimeEstimator();
    
    // Configurar suscripciones al broker
    this.configureBrokerSubscriptions();
    
    // Verificar configuración de claves API
    this.checkApiKeys();
  }
  
  /**
   * Configura las suscripciones a eventos del message broker
   */
  private configureBrokerSubscriptions(): void {
    this.messageBroker.subscribe('deepsearch.analyze-project', this.handleAnalyzeProject.bind(this));
    this.messageBroker.subscribe('deepsearch.estimate-materials', this.handleEstimateMaterials.bind(this));
    this.messageBroker.subscribe('deepsearch.estimate-labor', this.handleEstimateLabor.bind(this));
    this.messageBroker.subscribe('deepsearch.research-prices', this.handleResearchPrices.bind(this));
    this.messageBroker.subscribe('deepsearch.calculate-time', this.handleCalculateTime.bind(this));
    this.messageBroker.subscribe('deepsearch.record-feedback', this.handleRecordFeedback.bind(this));
    this.messageBroker.subscribe('deepsearch.update-estimate-result', this.handleUpdateEstimateResult.bind(this));
  }
  
  /**
   * Verifica que las claves API necesarias estén configuradas
   */
  private checkApiKeys(): void {
    if (!config.openai.apiKey) {
      this.logWarning('OpenAI API key no configurada. Algunas funciones tendrán rendimiento limitado.');
    }
    
    if (!config.anthropic.apiKey) {
      this.logWarning('Anthropic API key no configurada. Algunas funciones tendrán rendimiento limitado.');
    }
  }
  
  /**
   * Maneja solicitud para analizar un proyecto completo
   */
  private async handleAnalyzeProject(message: any): Promise<void> {
    const { requestId, projectType, projectDetails, contractorId, clientInfo } = message;
    
    this.logInfo(`Analizando proyecto tipo: ${projectType} para contratista: ${contractorId || 'anónimo'}`);
    
    try {
      // Normalizar opciones del proyecto si es necesario
      const normalizedOptions = this.normalizeProjectOptions(projectDetails, projectType);
      
      // 1. Estimar materiales
      const materialsResult = await this.estimateMaterialsForProject(projectType, normalizedOptions, contractorId);
      
      // 2. Estimar mano de obra
      const laborResult = await this.estimateLaborForProject(projectType, normalizedOptions, materialsResult.materials, contractorId);
      
      // 3. Calcular tiempo estimado
      const timeEstimate = await this.calculateTimeEstimate(projectType, normalizedOptions, materialsResult.materials, laborResult.laborItems);
      
      // 4. Aplicar markup adecuado
      const markupPercentage = await this.determineAppropriateMarkup(projectType, projectDetails, contractorId);
      
      // 5. Construir estimado completo
      const estimate = {
        estimateId: `est_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        projectType,
        projectDetails: normalizedOptions,
        materials: materialsResult.materials,
        materialCost: materialsResult.totalCost,
        services: laborResult.laborItems,
        laborCost: laborResult.totalCost,
        timeEstimate,
        markupPercentage,
        totalCost: this.calculateTotalWithMarkup(
          materialsResult.totalCost,
          laborResult.totalCost,
          markupPercentage
        ),
        clientInfo,
        contractorId,
        createdAt: new Date(),
        recommendations: materialsResult.recommendations || []
      };
      
      // Publicar resultado del análisis
      await this.messageBroker.publish('deepsearch.project-analyzed', {
        requestId,
        estimate,
        success: true
      });
      
      this.logInfo(`Análisis completado para requestId: ${requestId}`);
    } catch (error) {
      this.logError(`Error analizando proyecto para requestId: ${requestId}`, error);
      
      // Publicar error
      await this.messageBroker.publish('deepsearch.project-analysis-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Maneja solicitud para estimar materiales
   */
  private async handleEstimateMaterials(message: any): Promise<void> {
    const { requestId, projectType, projectDetails, contractorId } = message;
    
    this.logInfo(`Estimando materiales para proyecto tipo: ${projectType}`);
    
    try {
      const result = await this.estimateMaterialsForProject(projectType, projectDetails, contractorId);
      
      // Publicar resultado
      await this.messageBroker.publish('deepsearch.materials-estimated', {
        requestId,
        materials: result.materials,
        totalCost: result.totalCost,
        recommendations: result.recommendations,
        success: true
      });
    } catch (error) {
      this.logError(`Error estimando materiales para requestId: ${requestId}`, error);
      
      // Publicar error
      await this.messageBroker.publish('deepsearch.materials-estimation-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Maneja solicitud para estimar mano de obra
   */
  private async handleEstimateLabor(message: any): Promise<void> {
    const { requestId, projectType, projectDetails, materials, contractorId } = message;
    
    this.logInfo(`Estimando mano de obra para proyecto tipo: ${projectType}`);
    
    try {
      const result = await this.estimateLaborForProject(projectType, projectDetails, materials, contractorId);
      
      // Publicar resultado
      await this.messageBroker.publish('deepsearch.labor-estimated', {
        requestId,
        laborItems: result.laborItems,
        totalCost: result.totalCost,
        success: true
      });
    } catch (error) {
      this.logError(`Error estimando mano de obra para requestId: ${requestId}`, error);
      
      // Publicar error
      await this.messageBroker.publish('deepsearch.labor-estimation-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Maneja solicitud para investigar precios
   */
  private async handleResearchPrices(message: any): Promise<void> {
    const { requestId, items } = message;
    
    this.logInfo(`Investigando precios para ${items.length} ítems`);
    
    try {
      const pricedItems = await Promise.all(items.map(async (item: any) => {
        const price = await this.priceResearchService.researchPrice(item.name, item.unit);
        return {
          ...item,
          unitPrice: price
        };
      }));
      
      // Publicar resultado
      await this.messageBroker.publish('deepsearch.prices-researched', {
        requestId,
        items: pricedItems,
        success: true
      });
    } catch (error) {
      this.logError(`Error investigando precios para requestId: ${requestId}`, error);
      
      // Publicar error
      await this.messageBroker.publish('deepsearch.price-research-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Maneja solicitud para calcular tiempo
   */
  private async handleCalculateTime(message: any): Promise<void> {
    const { requestId, projectType, projectDetails, materials, laborItems } = message;
    
    this.logInfo(`Calculando tiempo para proyecto tipo: ${projectType}`);
    
    try {
      const timeEstimate = await this.calculateTimeEstimate(projectType, projectDetails, materials, laborItems);
      
      // Publicar resultado
      await this.messageBroker.publish('deepsearch.time-calculated', {
        requestId,
        timeEstimate,
        success: true
      });
    } catch (error) {
      this.logError(`Error calculando tiempo para requestId: ${requestId}`, error);
      
      // Publicar error
      await this.messageBroker.publish('deepsearch.time-calculation-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Maneja solicitud para registrar retroalimentación
   */
  private async handleRecordFeedback(message: any): Promise<void> {
    const { requestId, contractorId, estimateId, feedback } = message;
    
    this.logInfo(`Registrando retroalimentación para estimado: ${estimateId}`);
    
    try {
      // Crear servicio de perfil del contratista
      const contractorProfileService = new ContractorProfileService(this.openAIClient);
      
      // Registrar retroalimentación
      const success = await contractorProfileService.recordContractorFeedback(
        contractorId,
        estimateId,
        feedback
      );
      
      // Publicar resultado
      await this.messageBroker.publish('deepsearch.feedback-recorded', {
        requestId,
        success
      });
      
      // Si tuvo éxito, publicar también para el servicio de aprendizaje adaptativo
      if (success) {
        await this.messageBroker.publish('adaptive-learning.new-feedback', {
          contractorId,
          estimateId,
          feedback
        });
      }
    } catch (error) {
      this.logError(`Error registrando retroalimentación para estimado: ${estimateId}`, error);
      
      // Publicar error
      await this.messageBroker.publish('deepsearch.feedback-recording-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Maneja solicitud para actualizar resultado de estimado
   */
  private async handleUpdateEstimateResult(message: any): Promise<void> {
    const { requestId, contractorId, estimateId, wasApproved } = message;
    
    this.logInfo(`Actualizando resultado de estimado: ${estimateId} (${wasApproved ? 'aprobado' : 'rechazado'})`);
    
    try {
      // Crear servicio de perfil del contratista
      const contractorProfileService = new ContractorProfileService(this.openAIClient);
      
      // Actualizar resultado del estimado
      const success = await contractorProfileService.updateServiceRates(
        contractorId,
        estimateId,
        wasApproved
      );
      
      // Publicar resultado
      await this.messageBroker.publish('deepsearch.estimate-result-updated', {
        requestId,
        success
      });
      
      // Si tuvo éxito, publicar también para el servicio de aprendizaje adaptativo
      if (success) {
        await this.messageBroker.publish('adaptive-learning.estimate-result-updated', {
          contractorId,
          estimateId,
          wasApproved
        });
      }
    } catch (error) {
      this.logError(`Error actualizando resultado de estimado: ${estimateId}`, error);
      
      // Publicar error
      await this.messageBroker.publish('deepsearch.estimate-result-update-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Normaliza las opciones del proyecto según el tipo
   */
  private normalizeProjectOptions(options: any, projectType: string): any {
    // Crear una copia para evitar modificar el original
    const normalizedOptions = { ...options };
    
    // Añadir valores predeterminados según tipo de proyecto
    switch (projectType.toLowerCase()) {
      case 'fence':
      case 'fencing':
        if (!normalizedOptions.postSpacing) {
          normalizedOptions.postSpacing = 8; // 8 pies entre postes por defecto
        }
        break;
      case 'roof':
      case 'roofing':
        if (!normalizedOptions.pitch) {
          normalizedOptions.pitch = '4:12'; // Inclinación 4:12 por defecto
        }
        break;
      case 'deck':
      case 'decking':
        if (!normalizedOptions.height) {
          normalizedOptions.height = 3; // 3 pies de altura por defecto
        }
        break;
      case 'concrete':
        if (!normalizedOptions.thickness) {
          normalizedOptions.thickness = 4; // 4 pulgadas de grosor por defecto
        }
        break;
    }
    
    return normalizedOptions;
  }
  
  /**
   * Estima materiales para un proyecto
   */
  private async estimateMaterialsForProject(
    projectType: string,
    projectDetails: any,
    contractorId?: string
  ): Promise<{
    materials: Array<any>,
    totalCost: number,
    recommendations?: Array<string>
  }> {
    // Usar el MaterialCalculator para estimar materiales
    const materials = await this.materialCalculator.calculateMaterialsForProject(
      projectType,
      projectDetails
    );
    
    // Calcular costo total de materiales
    const totalCost = materials.reduce((sum, material) => {
      return sum + (material.quantity * material.unitPrice);
    }, 0);
    
    // Obtener recomendaciones si hay un contratista específico
    let recommendations: string[] = [];
    if (contractorId) {
      try {
        // Consultar al servicio de aprendizaje adaptativo para recomendaciones
        await this.messageBroker.publish('adaptive-learning.request-recommendations', {
          requestId: `req_materials_${Date.now()}`,
          contractorId,
          projectType,
          projectDetails
        });
        
        // En una implementación real, esperaríamos la respuesta
        // Por ahora, simplemente incluimos algunas recomendaciones genéricas
        recommendations = [
          `Para proyectos de ${projectType}, considere usar materiales de alta calidad para mayor durabilidad.`,
          'Verifique las regulaciones locales y permisos necesarios antes de comenzar el proyecto.'
        ];
      } catch (error) {
        this.logWarning(`No se pudieron obtener recomendaciones para el contratista: ${contractorId}`, error);
      }
    }
    
    return { materials, totalCost, recommendations };
  }
  
  /**
   * Estima mano de obra para un proyecto
   */
  private async estimateLaborForProject(
    projectType: string,
    projectDetails: any,
    materials: Array<any>,
    contractorId?: string
  ): Promise<{
    laborItems: Array<any>,
    totalCost: number
  }> {
    // Determinar servicios necesarios según tipo de proyecto
    const services = this.determineRequiredServices(projectType, projectDetails);
    
    // Si hay un contratista específico, buscar tarifas recomendadas
    if (contractorId) {
      try {
        // Solicitar tarifas recomendadas al servicio de aprendizaje adaptativo
        await this.messageBroker.publish('adaptive-learning.request-labor-rates', {
          requestId: `req_labor_${Date.now()}`,
          contractorId,
          projectType,
          services: services.map(s => s.name)
        });
        
        // En una implementación real, esperaríamos la respuesta
        // Por ahora, procedemos con las tarifas predeterminadas
      } catch (error) {
        this.logWarning(`No se pudieron obtener tarifas recomendadas para el contratista: ${contractorId}`, error);
      }
    }
    
    // Estimar horas para cada servicio
    const laborItems = services.map(service => {
      // Calcular horas basadas en los materiales y dimensiones
      const hours = this.estimateServiceHours(service, projectDetails, materials);
      
      return {
        id: `service_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        name: service.name,
        description: service.description,
        hours,
        hourlyRate: service.rate,
        totalCost: hours * service.rate
      };
    });
    
    // Calcular costo total de mano de obra
    const totalCost = laborItems.reduce((sum, item) => sum + item.totalCost, 0);
    
    return { laborItems, totalCost };
  }
  
  /**
   * Determina los servicios requeridos para un tipo de proyecto
   */
  private determineRequiredServices(projectType: string, projectDetails: any): Array<{
    name: string,
    description: string,
    rate: number
  }> {
    // Servicios según tipo de proyecto
    switch (projectType.toLowerCase()) {
      case 'fence':
      case 'fencing':
        return [
          { name: 'layout', description: 'Diseño y replanteo', rate: 75 },
          { name: 'postHoleDrilling', description: 'Perforación de hoyos para postes', rate: 85 },
          { name: 'postSetting', description: 'Instalación de postes', rate: 80 },
          { name: 'railInstallation', description: 'Instalación de rieles', rate: 75 },
          { name: 'picketInstallation', description: 'Instalación de tablas', rate: 70 },
          { name: 'gateInstallation', description: 'Instalación de puertas', rate: 90 },
          { name: 'cleanup', description: 'Limpieza final', rate: 65 }
        ];
      case 'deck':
      case 'decking':
        return [
          { name: 'layout', description: 'Diseño y replanteo', rate: 75 },
          { name: 'footingExcavation', description: 'Excavación para cimientos', rate: 85 },
          { name: 'footingPouring', description: 'Vertido de cimientos', rate: 90 },
          { name: 'framingConstruction', description: 'Construcción de estructura', rate: 85 },
          { name: 'deckingInstallation', description: 'Instalación de entablado', rate: 80 },
          { name: 'railingInstallation', description: 'Instalación de barandas', rate: 85 },
          { name: 'stairConstruction', description: 'Construcción de escaleras', rate: 95 },
          { name: 'finishing', description: 'Acabado y sellado', rate: 75 },
          { name: 'cleanup', description: 'Limpieza final', rate: 65 }
        ];
      case 'concrete':
        return [
          { name: 'layout', description: 'Diseño y replanteo', rate: 75 },
          { name: 'excavation', description: 'Excavación y preparación', rate: 85 },
          { name: 'formwork', description: 'Instalación de encofrado', rate: 80 },
          { name: 'reinforcement', description: 'Colocación de malla de refuerzo', rate: 85 },
          { name: 'pouring', description: 'Vertido de concreto', rate: 90 },
          { name: 'finishing', description: 'Acabado de superficie', rate: 85 },
          { name: 'curing', description: 'Curado de concreto', rate: 70 },
          { name: 'formRemoval', description: 'Remoción de encofrado', rate: 75 },
          { name: 'cleanup', description: 'Limpieza final', rate: 65 }
        ];
      case 'roof':
      case 'roofing':
        return [
          { name: 'tearOff', description: 'Remoción de techo existente', rate: 85 },
          { name: 'deckInspection', description: 'Inspección y reparación de base', rate: 90 },
          { name: 'underlayment', description: 'Instalación de base impermeable', rate: 80 },
          { name: 'flashing', description: 'Instalación de tapajuntas', rate: 85 },
          { name: 'shingleInstallation', description: 'Instalación de tejas', rate: 85 },
          { name: 'ridgeVentInstallation', description: 'Instalación de ventilación de cumbrera', rate: 90 },
          { name: 'cleanup', description: 'Limpieza final', rate: 70 }
        ];
      default:
        return [
          { name: 'preparation', description: 'Preparación', rate: 75 },
          { name: 'installation', description: 'Instalación', rate: 85 },
          { name: 'finishing', description: 'Acabado', rate: 80 },
          { name: 'cleanup', description: 'Limpieza final', rate: 65 }
        ];
    }
  }
  
  /**
   * Estima las horas para un servicio específico
   */
  private estimateServiceHours(
    service: { name: string, description: string, rate: number },
    projectDetails: any,
    materials: Array<any>
  ): number {
    // Factor base de horas según tipo de servicio
    let baseHours = 2; // valor predeterminado
    
    switch (service.name) {
      case 'layout':
      case 'preparation':
        baseHours = 1.5;
        break;
      case 'postHoleDrilling':
      case 'footingExcavation':
      case 'excavation':
        baseHours = 0.2 * this.calculatePostCount(projectDetails);
        break;
      case 'postSetting':
        baseHours = 0.25 * this.calculatePostCount(projectDetails);
        break;
      case 'railInstallation':
      case 'picketInstallation':
      case 'deckingInstallation':
        baseHours = this.calculateAreaFactor(projectDetails) * 0.5;
        break;
      case 'gateInstallation':
        baseHours = (projectDetails.gateCount || 0) * 1.5;
        break;
      case 'cleanup':
        baseHours = Math.max(1, this.calculateAreaFactor(projectDetails) * 0.1);
        break;
      default:
        baseHours = this.calculateAreaFactor(projectDetails) * 0.3;
    }
    
    // Garantizar un mínimo de horas
    return Math.max(1, baseHours);
  }
  
  /**
   * Calcula el número estimado de postes según las dimensiones
   */
  private calculatePostCount(projectDetails: any): number {
    if (projectDetails.type === 'fence' || projectDetails.type === 'fencing') {
      const length = projectDetails.length || projectDetails.dimensions?.length || 100;
      const postSpacing = projectDetails.postSpacing || 8;
      
      return Math.ceil(length / postSpacing) + 1;
    } else if (projectDetails.type === 'deck' || projectDetails.type === 'decking') {
      const length = projectDetails.length || projectDetails.dimensions?.length || 12;
      const width = projectDetails.width || projectDetails.dimensions?.width || 12;
      const area = length * width;
      
      // Aproximadamente un poste cada 16 pies cuadrados más postes de perímetro
      return Math.ceil(area / 16) + Math.ceil(2 * (length + width) / 6);
    }
    
    // Valor predeterminado
    return 10;
  }
  
  /**
   * Calcula un factor basado en el área del proyecto
   */
  private calculateAreaFactor(projectDetails: any): number {
    if (projectDetails.dimensions?.squareFeet) {
      return projectDetails.dimensions.squareFeet / 100;
    }
    
    let length = projectDetails.length || projectDetails.dimensions?.length || 0;
    let width = projectDetails.width || projectDetails.dimensions?.width || 0;
    let height = projectDetails.height || projectDetails.dimensions?.height || 0;
    
    if (projectDetails.type === 'fence' || projectDetails.type === 'fencing') {
      // Para cercas, área = longitud x altura
      return (length * height) / 100;
    } else if (projectDetails.type === 'roof' || projectDetails.type === 'roofing') {
      // Para techos, usar área directamente
      return length * width / 100;
    } else {
      // Para otros, calcular área y ajustar
      return length * width / 100;
    }
  }
  
  /**
   * Calcula el tiempo estimado para el proyecto
   */
  private async calculateTimeEstimate(
    projectType: string,
    projectDetails: any,
    materials: Array<any>,
    laborItems: Array<any>
  ): Promise<{
    minDays: number,
    maxDays: number,
    totalLaborHours: number
  }> {
    // Calcular horas totales de mano de obra
    const totalLaborHours = laborItems.reduce((sum, item) => sum + item.hours, 0);
    
    // Estimar días de trabajo (asumiendo 8 horas por día)
    const workDays = Math.ceil(totalLaborHours / 8);
    
    // Añadir tiempo para imprevistos
    const minDays = workDays;
    const maxDays = Math.ceil(workDays * 1.3); // 30% adicional para imprevistos
    
    return {
      minDays,
      maxDays,
      totalLaborHours
    };
  }
  
  /**
   * Determina el markup apropiado para el proyecto
   */
  private async determineAppropriateMarkup(
    projectType: string,
    projectDetails: any,
    contractorId?: string
  ): Promise<number> {
    // Markup predeterminado por tipo de proyecto
    const defaultMarkups: Record<string, number> = {
      'fence': 0.25,
      'fencing': 0.25,
      'deck': 0.3,
      'decking': 0.3,
      'concrete': 0.2,
      'roof': 0.25,
      'roofing': 0.25
    };
    
    let markup = defaultMarkups[projectType.toLowerCase()] || 0.25;
    
    // Si hay un contratista específico, intentar obtener su markup típico
    if (contractorId) {
      try {
        // Solicitar markup recomendado al servicio de aprendizaje adaptativo
        await this.messageBroker.publish('adaptive-learning.request-markup', {
          requestId: `req_markup_${Date.now()}`,
          contractorId,
          projectType,
          projectDetails
        });
        
        // En una implementación real, esperaríamos la respuesta
        // Por ahora, usamos el markup predeterminado
      } catch (error) {
        this.logWarning(`No se pudo obtener markup para el contratista: ${contractorId}`, error);
      }
    }
    
    return markup;
  }
  
  /**
   * Calcula el total con markup aplicado
   */
  private calculateTotalWithMarkup(
    materialCost: number,
    laborCost: number,
    markupPercentage: number
  ): number {
    const baseCost = materialCost + laborCost;
    return baseCost * (1 + markupPercentage);
  }
}
