import { MicroserviceBase, MessageBroker } from '../architecture/microservices-architecture';
import { OpenAIClient } from '../services/openai.client';
import { AnthropicClient } from '../services/anthropic.client';
import { ProjectDetails, EstimateResult, Client } from '../interfaces/flow-manager.interfaces';
import { PersistentCacheService } from '../services/persistent-cache.service';
import { config } from '../config/config';
import * as fs from 'fs';
import * as path from 'path';
import { ContractorProfileService } from '../services/contractor-profile.service';

/**
 * Servicio de Aprendizaje Adaptativo para arquitectura de microservicios
 * 
 * Este servicio es responsable de mejorar continuamente el sistema
 * mediante el aprendizaje de los patrones de los contratistas y los proyectos.
 */
export class AdaptiveLearningService extends MicroserviceBase {
  private openAIClient: OpenAIClient;
  private anthropicClient: AnthropicClient;
  private contractorProfileService: ContractorProfileService;
  private persistentCache: PersistentCacheService;
  private readonly defaultModel = config.openai.defaultModel || 'gpt-4o';
  
  // Intervalos de actualización para cada tipo de conocimiento (en días)
  private readonly updateIntervals = {
    materialPrices: 7,    // Actualizar precios de materiales cada 7 días
    laborRates: 30,       // Actualizar tarifas de mano de obra cada 30 días
    projectPatterns: 14,  // Actualizar patrones de proyectos cada 14 días
    clientPreferences: 60 // Actualizar preferencias de clientes cada 60 días
  };
  
  constructor(
    messageBroker: MessageBroker,
    private readonly cachePath: string = config.cache.cachePath
  ) {
    super('AdaptiveLearningService', '1.0.0');
    
    // Inicializar clientes de IA
    this.openAIClient = new OpenAIClient(config.openai.apiKey);
    this.anthropicClient = new AnthropicClient(config.anthropic.apiKey);
    
    // Inicializar servicio de perfiles de contratista
    this.contractorProfileService = new ContractorProfileService(this.openAIClient);
    
    // Inicializar caché persistente
    this.persistentCache = new PersistentCacheService(this.cachePath);
    
    // Configurar listeners de mensajes
    this.configureBrokerSubscriptions(messageBroker);
  }
  
  /**
   * Configura las suscripciones a eventos del message broker
   */
  private configureBrokerSubscriptions(messageBroker: MessageBroker): void {
    messageBroker.subscribe('adaptive-learning.learn-from-estimate', this.handleLearnFromEstimate.bind(this));
    messageBroker.subscribe('adaptive-learning.get-recommendations', this.handleGetRecommendations.bind(this));
    messageBroker.subscribe('adaptive-learning.get-material-costs', this.handleGetMaterialCosts.bind(this));
    messageBroker.subscribe('adaptive-learning.get-labor-rates', this.handleGetLaborRates.bind(this));
    messageBroker.subscribe('adaptive-learning.analyze-specialties', this.handleAnalyzeSpecialties.bind(this));
  }
  
  /**
   * Maneja solicitud para aprender de un estimado completado
   */
  private async handleLearnFromEstimate(message: any): Promise<void> {
    const { contractorId, estimate, projectDetails, clientInfo, wasAccepted, finalPrice } = message;
    
    this.logInfo(`Aprendiendo de estimado ${estimate.estimateId} para contratista ${contractorId}`);
    
    try {
      // Crear cachePath específico para este contratista
      const contractorCachePath = path.join(this.cachePath, `contractor_${contractorId}`);
      const contractorCache = new PersistentCacheService(contractorCachePath);
      
      await this.learnFromEstimate(
        contractorCache,
        estimate,
        projectDetails,
        clientInfo,
        wasAccepted,
        finalPrice
      );
      
      // Publicar evento de aprendizaje completado
      await this.messageBroker.publish('adaptive-learning.learning-completed', {
        contractorId,
        estimateId: estimate.estimateId,
        timestamp: new Date()
      });
    } catch (error) {
      this.logError(`Error durante el proceso de aprendizaje para estimado ${estimate.estimateId}`, error);
    }
  }
  
  /**
   * Maneja solicitud para obtener recomendaciones para un proyecto
   */
  private async handleGetRecommendations(message: any): Promise<void> {
    const { requestId, contractorId, projectType, projectDetails, clientId } = message;
    
    this.logInfo(`Generando recomendaciones para proyecto tipo ${projectType} - Contratista ${contractorId}`);
    
    try {
      // Crear cachePath específico para este contratista
      const contractorCachePath = path.join(this.cachePath, `contractor_${contractorId}`);
      const contractorCache = new PersistentCacheService(contractorCachePath);
      
      const recommendations = await this.generateRecommendations(
        contractorCache,
        projectType,
        projectDetails,
        clientId
      );
      
      // Publicar recomendaciones generadas
      await this.messageBroker.publish('adaptive-learning.recommendations-generated', {
        requestId,
        contractorId,
        recommendations,
        timestamp: new Date()
      });
    } catch (error) {
      this.logError(`Error generando recomendaciones para ${projectType}`, error);
      
      // Publicar error
      await this.messageBroker.publish('adaptive-learning.recommendations-error', {
        requestId,
        contractorId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Maneja solicitud para obtener costos de materiales estimados
   */
  private async handleGetMaterialCosts(message: any): Promise<void> {
    const { requestId, contractorId, materials } = message;
    
    this.logInfo(`Estimando costos de materiales para contratista ${contractorId}`);
    
    try {
      // Crear cachePath específico para este contratista
      const contractorCachePath = path.join(this.cachePath, `contractor_${contractorId}`);
      const contractorCache = new PersistentCacheService(contractorCachePath);
      
      const materialCosts = await this.getEstimatedMaterialCosts(
        contractorCache,
        materials
      );
      
      // Publicar costos de materiales estimados
      await this.messageBroker.publish('adaptive-learning.material-costs-estimated', {
        requestId,
        contractorId,
        materialCosts,
        timestamp: new Date()
      });
    } catch (error) {
      this.logError(`Error estimando costos de materiales`, error);
      
      // Publicar error
      await this.messageBroker.publish('adaptive-learning.material-costs-error', {
        requestId,
        contractorId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Maneja solicitud para obtener tarifas de mano de obra recomendadas
   */
  private async handleGetLaborRates(message: any): Promise<void> {
    const { requestId, contractorId, projectType, services } = message;
    
    this.logInfo(`Obteniendo tarifas recomendadas para servicios de ${projectType}`);
    
    try {
      // Crear cachePath específico para este contratista
      const contractorCachePath = path.join(this.cachePath, `contractor_${contractorId}`);
      const contractorCache = new PersistentCacheService(contractorCachePath);
      
      const laborRates = await this.getRecommendedLaborRates(
        contractorCache,
        projectType,
        services
      );
      
      // Publicar tarifas recomendadas
      await this.messageBroker.publish('adaptive-learning.labor-rates-recommended', {
        requestId,
        contractorId,
        laborRates,
        timestamp: new Date()
      });
    } catch (error) {
      this.logError(`Error obteniendo tarifas recomendadas`, error);
      
      // Publicar error
      await this.messageBroker.publish('adaptive-learning.labor-rates-error', {
        requestId,
        contractorId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Maneja solicitud para analizar especialidades del contratista
   */
  private async handleAnalyzeSpecialties(message: any): Promise<void> {
    const { requestId, contractorId } = message;
    
    this.logInfo(`Analizando especialidades del contratista ${contractorId}`);
    
    try {
      // Crear cachePath específico para este contratista
      const contractorCachePath = path.join(this.cachePath, `contractor_${contractorId}`);
      const contractorCache = new PersistentCacheService(contractorCachePath);
      
      const specialties = await this.analyzeContractorSpecialties(contractorCache);
      
      // Publicar especialidades analizadas
      await this.messageBroker.publish('adaptive-learning.specialties-analyzed', {
        requestId,
        contractorId,
        specialties,
        timestamp: new Date()
      });
    } catch (error) {
      this.logError(`Error analizando especialidades del contratista ${contractorId}`, error);
      
      // Publicar error
      await this.messageBroker.publish('adaptive-learning.specialties-error', {
        requestId,
        contractorId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Registra un nuevo estimado completado para aprendizaje
   */
  private async learnFromEstimate(
    cache: PersistentCacheService,
    estimate: EstimateResult,
    projectDetails: ProjectDetails,
    clientInfo: Client,
    wasAccepted: boolean = false,
    finalPrice?: number
  ): Promise<void> {
    // 1. Cargar o inicializar la base de conocimiento
    const knowledgeBase = this.loadKnowledgeBase(cache);
    
    // 2. Actualizar conocimiento sobre materiales y precios
    await this.updateMaterialKnowledge(knowledgeBase, estimate, projectDetails);
    
    // 3. Actualizar conocimiento sobre tarifas de mano de obra
    await this.updateLaborKnowledge(knowledgeBase, estimate, projectDetails);
    
    // 4. Actualizar patrones de proyectos
    await this.updateProjectPatterns(knowledgeBase, estimate, projectDetails, wasAccepted, finalPrice);
    
    // 5. Actualizar preferencias del cliente
    if (clientInfo.id) {
      await this.updateClientPreferences(knowledgeBase, clientInfo.id, projectDetails, wasAccepted);
    }
    
    // 6. Analizar y actualizar el perfil del contratista
    if (this.shouldUpdateContractorProfile(knowledgeBase)) {
      await this.updateContractorProfile(knowledgeBase);
    }
    
    // 7. Guardar la base de conocimiento actualizada
    this.saveKnowledgeBase(cache, knowledgeBase);
  }
  
  /**
   * Genera recomendaciones específicas para un nuevo proyecto
   */
  private async generateRecommendations(
    cache: PersistentCacheService,
    projectType: string,
    projectDetails: ProjectDetails,
    clientId?: string
  ): Promise<{
    recommendedMaterials: string[],
    estimatedCosts: { min: number, max: number },
    suggestedMarkup: number,
    clientSpecificTips?: string[]
  }> {
    // 1. Cargar la base de conocimiento actual
    const knowledgeBase = this.loadKnowledgeBase(cache);
    
    // 2. Identificar materiales recomendados basados en patrones anteriores
    const recommendedMaterials = this.getRecommendedMaterials(
      projectType, 
      projectDetails,
      knowledgeBase
    );
    
    // 3. Estimar rango de costos basado en proyectos similares
    const estimatedCosts = this.estimateCostRange(
      projectType,
      projectDetails,
      knowledgeBase
    );
    
    // 4. Determinar el markup sugerido basado en el tipo de proyecto y patrones
    const suggestedMarkup = this.determineSuggestedMarkup(
      projectType,
      projectDetails,
      knowledgeBase
    );
    
    // 5. Si hay un cliente específico, generar recomendaciones personalizadas
    let clientSpecificTips: string[] | undefined;
    if (clientId && knowledgeBase.clientPreferences.clients[clientId]) {
      clientSpecificTips = this.generateClientSpecificRecommendations(
        clientId,
        projectType,
        knowledgeBase
      );
    }
    
    return {
      recommendedMaterials,
      estimatedCosts,
      suggestedMarkup,
      clientSpecificTips
    };
  }
  
  /**
   * Obtiene los costos estimados de materiales para un proyecto
   */
  private async getEstimatedMaterialCosts(
    cache: PersistentCacheService,
    materials: Array<{ id: string, name: string, quantity: number, unit: string }>
  ): Promise<Array<{ id: string, name: string, quantity: number, unit: string, estimatedPrice: number }>> {
    // Cargar conocimiento de precios de materiales
    const knowledgeBase = this.loadKnowledgeBase(cache);
    const materialPrices = knowledgeBase.materialPrices.items;
    
    return materials.map(material => {
      const materialKey = this.normalizeMaterialId(material.id);
      let estimatedPrice = 0;
      
      // Si tenemos un precio conocido para este material, usarlo
      if (materialPrices[materialKey]) {
        estimatedPrice = materialPrices[materialKey].price;
      } else {
        // Si no, estimar basado en materiales similares
        estimatedPrice = this.estimateMaterialPrice(material, materialPrices);
      }
      
      return {
        ...material,
        estimatedPrice
      };
    });
  }
  
  /**
   * Obtiene las tarifas de mano de obra recomendadas para un proyecto
   */
  private async getRecommendedLaborRates(
    cache: PersistentCacheService,
    projectType: string,
    services: string[]
  ): Promise<Array<{ service: string, rate: number, unit: string }>> {
    // Cargar conocimiento de tarifas de mano de obra
    const knowledgeBase = this.loadKnowledgeBase(cache);
    const laborRates = knowledgeBase.laborRates.rates;
    
    return services.map(service => {
      const serviceKey = `${projectType}:${service}`;
      const knownRate = laborRates[serviceKey];
      
      if (knownRate) {
        return {
          service,
          rate: knownRate.rate,
          unit: knownRate.unit
        };
      } else {
        // Usar tarifa estimada si no se conoce
        return {
          service,
          rate: this.estimateLaborRate(service, projectType, laborRates),
          unit: 'hour'
        };
      }
    });
  }
  
  /**
   * Identifica los patrones de especialidad del contratista
   */
  private async analyzeContractorSpecialties(cache: PersistentCacheService): Promise<{ 
    topSpecialties: string[],
    preferredMaterials: Record<string, string[]>,
    typicalMarkups: Record<string, number>
  }> {
    const knowledgeBase = this.loadKnowledgeBase(cache);
    
    return {
      topSpecialties: knowledgeBase.contractorProfile.specialties,
      preferredMaterials: knowledgeBase.contractorProfile.preferredMaterials,
      typicalMarkups: knowledgeBase.contractorProfile.typicalMarkups
    };
  }
  
  /**
   * Carga la base de conocimiento desde caché persistente o inicializa una nueva
   */
  private loadKnowledgeBase(cache: PersistentCacheService): any {
    const knowledgeBasePath = path.join(cache.getCachePath(), 'knowledge_base.json');
    
    try {
      if (fs.existsSync(knowledgeBasePath)) {
        const data = fs.readFileSync(knowledgeBasePath, 'utf8');
        return JSON.parse(data);
      } else {
        // Si no existe, crear una base de conocimiento inicial
        return this.initializeKnowledgeBase(cache);
      }
    } catch (error) {
      this.logError('Error cargando base de conocimiento, inicializando una nueva', error);
      return this.initializeKnowledgeBase(cache);
    }
  }
  
  /**
   * Inicializa una nueva base de conocimiento
   */
  private initializeKnowledgeBase(cache: PersistentCacheService): any {
    // Crear estructura inicial de la base de conocimiento
    const initialKnowledgeBase = {
      contractorProfile: {
        specialties: [],
        preferredMaterials: {},
        typicalMarkups: {},
        workingPattern: {},
        lastUpdated: new Date()
      },
      materialPrices: {
        items: {},
        lastUpdated: new Date()
      },
      laborRates: {
        rates: {},
        lastUpdated: new Date()
      },
      projectPatterns: {
        patterns: [],
        lastUpdated: new Date()
      },
      clientPreferences: {
        clients: {},
        lastUpdated: new Date()
      }
    };
    
    // Guardar la estructura inicial
    this.saveKnowledgeBase(cache, initialKnowledgeBase);
    
    return initialKnowledgeBase;
  }
  
  /**
   * Guarda la base de conocimiento en caché persistente
   */
  private saveKnowledgeBase(cache: PersistentCacheService, knowledgeBase: any): void {
    const knowledgeBasePath = path.join(cache.getCachePath(), 'knowledge_base.json');
    
    try {
      fs.writeFileSync(knowledgeBasePath, JSON.stringify(knowledgeBase, null, 2));
    } catch (error) {
      this.logError('Error guardando base de conocimiento', error);
    }
  }
  
  /**
   * Actualiza conocimiento sobre materiales y precios
   */
  private async updateMaterialKnowledge(
    knowledgeBase: any,
    estimate: EstimateResult,
    projectDetails: ProjectDetails
  ): Promise<void> {
    // Solo actualizar si hay información de materiales
    if (!estimate.materials || estimate.materials.length === 0) {
      return;
    }
    
    const materialPrices = knowledgeBase.materialPrices.items;
    
    // Actualizar información para cada material
    estimate.materials.forEach(material => {
      const materialKey = this.normalizeMaterialId(material.id);
      
      // Si ya existe, actualizar con promedio ponderado
      if (materialPrices[materialKey]) {
        const existing = materialPrices[materialKey];
        
        const totalQuantity = existing.quantity + material.quantity;
        
        // Actualizar precio con promedio ponderado
        existing.price = (
          (existing.price * existing.quantity) + 
          (material.unitPrice * material.quantity)
        ) / totalQuantity;
        
        existing.quantity = totalQuantity;
        existing.occurrences += 1;
        existing.lastUpdated = new Date();
      } else {
        // Crear nuevo registro
        materialPrices[materialKey] = {
          name: material.name,
          price: material.unitPrice,
          quantity: material.quantity,
          unit: material.unit,
          occurrences: 1,
          projectTypes: [projectDetails.type],
          lastUpdated: new Date()
        };
      }
      
      // Asegurar que el tipo de proyecto esté registrado para este material
      if (!materialPrices[materialKey].projectTypes.includes(projectDetails.type)) {
        materialPrices[materialKey].projectTypes.push(projectDetails.type);
      }
    });
    
    // Actualizar timestamp
    knowledgeBase.materialPrices.lastUpdated = new Date();
  }
  
  /**
   * Actualiza conocimiento sobre tarifas de mano de obra
   */
  private async updateLaborKnowledge(
    knowledgeBase: any,
    estimate: EstimateResult,
    projectDetails: ProjectDetails
  ): Promise<void> {
    // Solo actualizar si hay información de servicios
    if (!estimate.services || estimate.services.length === 0) {
      return;
    }
    
    const laborRates = knowledgeBase.laborRates.rates;
    
    // Actualizar información para cada servicio
    estimate.services.forEach(service => {
      const serviceKey = `${projectDetails.type}:${service.name}`;
      
      // Si ya existe, actualizar con promedio ponderado
      if (laborRates[serviceKey]) {
        const existing = laborRates[serviceKey];
        
        const totalHours = existing.hours + service.hours;
        
        // Actualizar tarifa con promedio ponderado
        existing.rate = (
          (existing.rate * existing.hours) + 
          (service.hourlyRate * service.hours)
        ) / totalHours;
        
        existing.hours = totalHours;
        existing.occurrences += 1;
        existing.lastUpdated = new Date();
      } else {
        // Crear nuevo registro
        laborRates[serviceKey] = {
          rate: service.hourlyRate,
          hours: service.hours,
          unit: 'hour',
          occurrences: 1,
          lastUpdated: new Date()
        };
      }
    });
    
    // Actualizar timestamp
    knowledgeBase.laborRates.lastUpdated = new Date();
  }
  
  /**
   * Actualiza los patrones de proyectos
   */
  private async updateProjectPatterns(
    knowledgeBase: any,
    estimate: EstimateResult,
    projectDetails: ProjectDetails,
    wasAccepted: boolean,
    finalPrice?: number
  ): Promise<void> {
    const patterns = knowledgeBase.projectPatterns.patterns;
    
    // Crear un nuevo patrón de proyecto
    const newPattern = {
      id: `pattern_${Date.now()}`,
      projectType: projectDetails.type,
      projectSubtype: projectDetails.subtype,
      dimensions: projectDetails.dimensions,
      materialCost: estimate.materialCost,
      laborCost: estimate.laborCost,
      totalEstimatedCost: estimate.totalCost,
      finalPrice: finalPrice || estimate.totalCost,
      wasAccepted,
      markup: this.calculateEffectiveMarkup(estimate.materialCost, estimate.laborCost, estimate.totalCost),
      timestamp: new Date(),
      materials: estimate.materials?.map(m => ({
        id: m.id,
        name: m.name,
        quantity: m.quantity,
        unit: m.unit
      })) || [],
      key_features: this.extractKeyFeatures(projectDetails)
    };
    
    // Añadir a la colección de patrones
    patterns.push(newPattern);
    
    // Limitar a los últimos 100 patrones para manejar el tamaño
    if (patterns.length > 100) {
      patterns.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      knowledgeBase.projectPatterns.patterns = patterns.slice(0, 100);
    } else {
      knowledgeBase.projectPatterns.patterns = patterns;
    }
    
    // Actualizar timestamp
    knowledgeBase.projectPatterns.lastUpdated = new Date();
  }
  
  /**
   * Actualiza las preferencias del cliente
   */
  private async updateClientPreferences(
    knowledgeBase: any,
    clientId: string,
    projectDetails: ProjectDetails,
    wasAccepted: boolean
  ): Promise<void> {
    const clientPreferences = knowledgeBase.clientPreferences.clients;
    
    // Si el cliente ya existe, actualizar sus preferencias
    if (clientPreferences[clientId]) {
      const client = clientPreferences[clientId];
      
      // Actualizar historial de proyectos
      client.projectHistory.push({
        type: projectDetails.type,
        subtype: projectDetails.subtype,
        date: new Date(),
        wasAccepted
      });
      
      // Actualizar preferencias de materiales
      if (projectDetails.material) {
        const materialKey = `${projectDetails.type}:material`;
        client.preferences[materialKey] = projectDetails.material;
      }
      
      // Actualizar preferencias de estilo
      if (projectDetails.style) {
        const styleKey = `${projectDetails.type}:style`;
        client.preferences[styleKey] = projectDetails.style;
      }
      
      client.lastUpdated = new Date();
    } else {
      // Crear nuevo cliente
      clientPreferences[clientId] = {
        projectHistory: [{
          type: projectDetails.type,
          subtype: projectDetails.subtype,
          date: new Date(),
          wasAccepted
        }],
        preferences: {},
        lastUpdated: new Date()
      };
      
      // Inicializar preferencias básicas
      if (projectDetails.material) {
        const materialKey = `${projectDetails.type}:material`;
        clientPreferences[clientId].preferences[materialKey] = projectDetails.material;
      }
      
      if (projectDetails.style) {
        const styleKey = `${projectDetails.type}:style`;
        clientPreferences[clientId].preferences[styleKey] = projectDetails.style;
      }
    }
    
    // Actualizar timestamp
    knowledgeBase.clientPreferences.lastUpdated = new Date();
  }
  
  /**
   * Actualiza el perfil general del contratista
   */
  private async updateContractorProfile(knowledgeBase: any): Promise<void> {
    // Analizar patrones de proyectos para determinar especialidades
    const patterns = knowledgeBase.projectPatterns.patterns;
    
    // 1. Identificar especialidades del contratista
    const projectTypeCounts: Record<string, number> = {};
    patterns.forEach(pattern => {
      projectTypeCounts[pattern.projectType] = (projectTypeCounts[pattern.projectType] || 0) + 1;
    });
    
    // Ordenar por frecuencia
    const topSpecialties = Object.entries(projectTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3) // Top 3 especialidades
      .map(entry => entry[0]);
    
    // 2. Identificar materiales preferidos por tipo de proyecto
    const preferredMaterials: Record<string, Record<string, number>> = {};
    
    patterns.forEach(pattern => {
      if (!preferredMaterials[pattern.projectType]) {
        preferredMaterials[pattern.projectType] = {};
      }
      
      const material = pattern.projectSubtype || 'unknown';
      preferredMaterials[pattern.projectType][material] = 
        (preferredMaterials[pattern.projectType][material] || 0) + 1;
    });
    
    // Convertir a lista de preferidos
    const preferredMaterialsList: Record<string, string[]> = {};
    
    Object.entries(preferredMaterials).forEach(([projectType, materials]) => {
      preferredMaterialsList[projectType] = Object.entries(materials)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3) // Top 3 materiales por tipo
        .map(entry => entry[0]);
    });
    
    // 3. Identificar markups típicos por tipo de proyecto
    const markups: Record<string, number[]> = {};
    
    patterns.forEach(pattern => {
      if (!markups[pattern.projectType]) {
        markups[pattern.projectType] = [];
      }
      
      if (pattern.markup) {
        markups[pattern.projectType].push(pattern.markup);
      }
    });
    
    // Calcular markup promedio por tipo
    const typicalMarkups: Record<string, number> = {};
    
    Object.entries(markups).forEach(([projectType, markupList]) => {
      if (markupList.length > 0) {
        typicalMarkups[projectType] = markupList.reduce((sum, m) => sum + m, 0) / markupList.length;
      }
    });
    
    // 4. Identificar patrones de trabajo (días de la semana, hora del día, etc.)
    // Esta sería una función avanzada que se podría implementar posteriormente
    
    // Actualizar el perfil del contratista
    knowledgeBase.contractorProfile = {
      specialties: topSpecialties,
      preferredMaterials: preferredMaterialsList,
      typicalMarkups,
      workingPattern: {}, // Para implementación futura
      lastUpdated: new Date()
    };
  }
  
  /**
   * Determina si se debe actualizar el perfil del contratista
   */
  private shouldUpdateContractorProfile(knowledgeBase: any): boolean {
    // Verificar si han pasado al menos 2 semanas desde la última actualización
    const lastUpdate = new Date(knowledgeBase.contractorProfile.lastUpdated);
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    return lastUpdate < twoWeeksAgo;
  }
  
  /**
   * Normaliza un ID de material para usarlo como clave
   */
  private normalizeMaterialId(id: string): string {
    return id.toLowerCase().replace(/[^a-z0-9]/g, '_');
  }
  
  /**
   * Estima el precio de un material no conocido
   */
  private estimateMaterialPrice(
    material: { id: string, name: string, quantity: number, unit: string },
    knownPrices: any
  ): number {
    // Buscar materiales similares
    const materialName = material.name.toLowerCase();
    let similarMaterials = [];
    
    for (const [key, value] of Object.entries(knownPrices)) {
      const price: any = value;
      if (price.name && price.name.toLowerCase().includes(materialName.substring(0, 4))) {
        similarMaterials.push(price);
      }
    }
    
    if (similarMaterials.length > 0) {
      // Calcular precio promedio de materiales similares
      const averagePrice = similarMaterials.reduce((sum, m: any) => sum + m.price, 0) / similarMaterials.length;
      return averagePrice;
    }
    
    // Si no hay similares, usar un precio genérico basado en el tipo
    if (materialName.includes('wood') || materialName.includes('madera')) return 15;
    if (materialName.includes('concrete') || materialName.includes('concreto')) return 12;
    if (materialName.includes('paint') || materialName.includes('pintura')) return 25;
    if (materialName.includes('tool') || materialName.includes('herramienta')) return 40;
    
    return 20; // Precio genérico por defecto
  }
  
  /**
   * Estima la tarifa de mano de obra para un servicio no conocido
   */
  private estimateLaborRate(
    service: string,
    projectType: string,
    knownRates: any
  ): number {
    // Buscar servicios similares
    const serviceName = service.toLowerCase();
    let similarServices = [];
    
    for (const [key, value] of Object.entries(knownRates)) {
      const rate: any = value;
      if (key.includes(projectType) && key.toLowerCase().includes(serviceName.substring(0, 4))) {
        similarServices.push(rate);
      }
    }
    
    if (similarServices.length > 0) {
      // Calcular tarifa promedio de servicios similares
      const averageRate = similarServices.reduce((sum, r: any) => sum + r.rate, 0) / similarServices.length;
      return averageRate;
    }
    
    // Si no hay similares, usar una tarifa genérica basada en el tipo
    if (serviceName.includes('install') || serviceName.includes('instala')) return 75;
    if (serviceName.includes('repair') || serviceName.includes('repara')) return 85;
    if (serviceName.includes('remove') || serviceName.includes('remov')) return 65;
    if (serviceName.includes('prep') || serviceName.includes('prepar')) return 60;
    
    return 70; // Tarifa genérica por defecto
  }
  
  /**
   * Calcula el markup efectivo basado en costos y precio final
   */
  private calculateEffectiveMarkup(
    materialCost: number,
    laborCost: number,
    totalCost: number
  ): number {
    const baseCost = materialCost + laborCost;
    if (baseCost <= 0) return 0.25; // Valor por defecto
    
    const markup = (totalCost - baseCost) / baseCost;
    return Math.max(0, markup); // Asegurar que no sea negativo
  }
  
  /**
   * Extrae características clave de un proyecto
   */
  private extractKeyFeatures(projectDetails: ProjectDetails): string[] {
    const features: string[] = [];
    
    if (projectDetails.type) features.push(`type:${projectDetails.type}`);
    if (projectDetails.subtype) features.push(`subtype:${projectDetails.subtype}`);
    if (projectDetails.material) features.push(`material:${projectDetails.material}`);
    if (projectDetails.style) features.push(`style:${projectDetails.style}`);
    if (projectDetails.color) features.push(`color:${projectDetails.color}`);
    if (projectDetails.finish) features.push(`finish:${projectDetails.finish}`);
    
    // Añadir dimensiones relevantes
    if (projectDetails.dimensions) {
      Object.entries(projectDetails.dimensions).forEach(([key, value]) => {
        if (value !== undefined) {
          features.push(`dimension:${key}:${value}`);
        }
      });
    }
    
    // Añadir características booleanas
    if (projectDetails.demolition) features.push('has:demolition');
    if (projectDetails.stairs) features.push('has:stairs');
    if (projectDetails.permitNeeded) features.push('has:permit');
    
    // Añadir puertas si existen
    if (projectDetails.gates && projectDetails.gates.length > 0) {
      features.push(`gates:${projectDetails.gates.length}`);
    }
    
    return features;
  }
  
  /**
   * Obtiene materiales recomendados basados en patrones anteriores
   */
  private getRecommendedMaterials(
    projectType: string,
    projectDetails: ProjectDetails,
    knowledgeBase: any
  ): string[] {
    // 1. Buscar materiales preferidos para este tipo de proyecto
    if (knowledgeBase.contractorProfile.preferredMaterials[projectType]) {
      return knowledgeBase.contractorProfile.preferredMaterials[projectType];
    }
    
    // 2. Buscar los materiales más comunes en este tipo de proyecto
    const materialCounts: Record<string, number> = {};
    
    knowledgeBase.projectPatterns.patterns
      .filter(pattern => pattern.projectType === projectType)
      .forEach(pattern => {
        const material = pattern.projectSubtype || '';
        if (material) {
          materialCounts[material] = (materialCounts[material] || 0) + 1;
        }
      });
    
    // Ordenar por frecuencia
    const recommendedMaterials = Object.entries(materialCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3) // Top 3 materiales
      .map(entry => entry[0]);
    
    return recommendedMaterials.length > 0 ? recommendedMaterials : ['wood', 'vinyl', 'composite'];
  }
  
  /**
   * Estima un rango de costos basado en proyectos similares
   */
  private estimateCostRange(
    projectType: string,
    projectDetails: ProjectDetails,
    knowledgeBase: any
  ): { min: number, max: number } {
    // Buscar proyectos similares
    const similarPatterns = knowledgeBase.projectPatterns.patterns
      .filter(pattern => pattern.projectType === projectType);
    
    if (similarPatterns.length === 0) {
      // Si no hay proyectos similares, retornar un rango genérico
      return { min: 1000, max: 5000 };
    }
    
    // Calcular estadísticas de costo
    const costs = similarPatterns.map(pattern => pattern.totalEstimatedCost);
    costs.sort((a, b) => a - b);
    
    // Encontrar proyectos más similares basados en dimensiones
    let adjustedCosts = [...costs];
    
    // Si hay dimensiones disponibles, intentar ajustar los costos
    if (projectDetails.dimensions && Object.keys(projectDetails.dimensions).length > 0) {
      adjustedCosts = similarPatterns.map(pattern => {
        let sizeFactor = 1.0;
        
        // Intentar ajustar por tamaño si es posible
        if (pattern.dimensions && projectDetails.dimensions) {
          if (pattern.dimensions.squareFeet && projectDetails.dimensions.squareFeet) {
            sizeFactor = projectDetails.dimensions.squareFeet / pattern.dimensions.squareFeet;
          } else if (pattern.dimensions.length && projectDetails.dimensions.length) {
            sizeFactor = projectDetails.dimensions.length / pattern.dimensions.length;
          }
        }
        
        // Limitar el factor a un rango razonable
        sizeFactor = Math.max(0.5, Math.min(sizeFactor, 2.0));
        
        return pattern.totalEstimatedCost * sizeFactor;
      });
      
      adjustedCosts.sort((a, b) => a - b);
    }
    
    // Calcular rango (percentil 25 a percentil 75)
    const lowerIdx = Math.floor(adjustedCosts.length * 0.25);
    const upperIdx = Math.floor(adjustedCosts.length * 0.75);
    
    return {
      min: adjustedCosts[lowerIdx] || adjustedCosts[0],
      max: adjustedCosts[upperIdx] || adjustedCosts[adjustedCosts.length - 1]
    };
  }
  
  /**
   * Determina el markup sugerido basado en el tipo de proyecto y patrones
   */
  private determineSuggestedMarkup(
    projectType: string,
    projectDetails: ProjectDetails,
    knowledgeBase: any
  ): number {
    // 1. Verificar si tenemos un markup típico para este tipo de proyecto
    if (knowledgeBase.contractorProfile.typicalMarkups[projectType] !== undefined) {
      return knowledgeBase.contractorProfile.typicalMarkups[projectType];
    }
    
    // 2. Buscar el markup promedio en proyectos similares
    const similarPatterns = knowledgeBase.projectPatterns.patterns
      .filter(pattern => pattern.projectType === projectType);
    
    if (similarPatterns.length > 0) {
      const markups = similarPatterns
        .filter(pattern => pattern.markup !== undefined)
        .map(pattern => pattern.markup);
      
      if (markups.length > 0) {
        return markups.reduce((sum, m) => sum + m, 0) / markups.length;
      }
    }
    
    // 3. Valor por defecto si no hay datos
    return 0.25; // 25% por defecto
  }
  
  /**
   * Genera recomendaciones específicas para un cliente basado en su historial
   */
  private generateClientSpecificRecommendations(
    clientId: string,
    projectType: string,
    knowledgeBase: any
  ): string[] {
    const client = knowledgeBase.clientPreferences.clients[clientId];
    if (!client) return [];
    
    const recommendations: string[] = [];
    
    // 1. Verificar preferencias de materiales específicas
    const materialKey = `${projectType}:material`;
    if (client.preferences[materialKey]) {
      recommendations.push(`El cliente ha preferido ${client.preferences[materialKey]} para proyectos de ${projectType} en el pasado.`);
    }
    
    // 2. Verificar preferencias de estilo
    const styleKey = `${projectType}:style`;
    if (client.preferences[styleKey]) {
      recommendations.push(`El cliente prefiere el estilo ${client.preferences[styleKey]} para este tipo de proyectos.`);
    }
    
    // 3. Analizar historial de aceptación de estimados
    const projectTypeHistory = client.projectHistory.filter(p => p.type === projectType);
    const acceptedCount = projectTypeHistory.filter(p => p.wasAccepted).length;
    
    if (projectTypeHistory.length > 0) {
      const acceptanceRate = acceptedCount / projectTypeHistory.length;
      
      if (acceptanceRate < 0.5) {
        recommendations.push(`Este cliente ha rechazado ${projectTypeHistory.length - acceptedCount} de ${projectTypeHistory.length} estimados para proyectos de ${projectType}. Considere un precio más competitivo.`);
      } else if (acceptanceRate > 0.8) {
        recommendations.push(`Este cliente tiene una alta tasa de aceptación (${Math.round(acceptanceRate * 100)}%) para proyectos de ${projectType}.`);
      }
    }
    
    return recommendations;
  }
}
