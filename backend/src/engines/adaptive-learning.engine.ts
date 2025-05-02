import { OpenAIClient } from '../services/openai.client';
import { AnthropicClient } from '../services/anthropic.client';
import { ProjectDetails, EstimateResult, Client } from '../interfaces/flow-manager.interfaces';
import { PersistentCacheService } from '../services/persistent-cache.service';
import { config } from '../config/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Motor de Aprendizaje Adaptativo que aprende del contratista y sus estimados
 * para mejorar progresivamente la precisión y personalización
 */
export class AdaptiveLearningEngine {
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
    private readonly openAIClient: OpenAIClient,
    private readonly anthropicClient: AnthropicClient,
    private readonly contractorId: string
  ) {
    // Inicializar caché persistente para el contratista específico
    const cachePath = path.join(config.cache.cachePath, `contractor_${contractorId}`);
    this.persistentCache = new PersistentCacheService(cachePath);
    
    // Asegurar que existan las estructuras de datos necesarias
    this.initializeKnowledgeBase();
  }

  /**
   * Inicializa la base de conocimiento si no existe
   */
  private initializeKnowledgeBase(): void {
    // Verificar si ya existe la base de conocimiento
    const knowledgeBasePath = path.join(this.persistentCache.getCachePath(), 'knowledge_base.json');
    
    if (!fs.existsSync(knowledgeBasePath)) {
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
      fs.writeFileSync(knowledgeBasePath, JSON.stringify(initialKnowledgeBase, null, 2));
    }
  }

  /**
   * Registra un nuevo estimado completado para aprendizaje
   */
  async learnFromEstimate(
    estimate: EstimateResult,
    projectDetails: ProjectDetails,
    clientInfo: Client,
    wasAccepted: boolean = false,
    finalPrice?: number
  ): Promise<void> {
    // 1. Actualizar conocimiento sobre materiales y precios
    await this.updateMaterialKnowledge(estimate, projectDetails);
    
    // 2. Actualizar conocimiento sobre tarifas de mano de obra
    await this.updateLaborKnowledge(estimate, projectDetails);
    
    // 3. Actualizar patrones de proyectos
    await this.updateProjectPatterns(estimate, projectDetails, wasAccepted, finalPrice);
    
    // 4. Actualizar preferencias del cliente
    if (clientInfo.id) {
      await this.updateClientPreferences(clientInfo.id, projectDetails, wasAccepted);
    }
    
    // 5. Analizar y actualizar el perfil del contratista
    await this.updateContractorProfile();
  }

  /**
   * Genera recomendaciones específicas para un nuevo proyecto
   * basadas en el conocimiento aprendido
   */
  async generateRecommendations(
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
    const knowledgeBase = this.loadKnowledgeBase();
    
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
   * basados en el aprendizaje previo
   */
  async getEstimatedMaterialCosts(
    materials: Array<{ id: string, name: string, quantity: number, unit: string }>
  ): Promise<Array<{ id: string, name: string, quantity: number, unit: string, estimatedPrice: number }>> {
    // Cargar conocimiento de precios de materiales
    const knowledgeBase = this.loadKnowledgeBase();
    const materialPrices = knowledgeBase.materialPrices.items;
    
    // Aplicar precios conocidos o estimados
    return materials.map(material => {
      const materialKey = this.normalizeMaterialId(material.id);
      const knownPrice = materialPrices[materialKey];
      
      let estimatedPrice = 0;
      if (knownPrice) {
        estimatedPrice = knownPrice.price;
      } else {
        // Usar lógica de fallback para estimar precio
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
  async getRecommendedLaborRates(
    projectType: string,
    services: string[]
  ): Promise<Array<{ service: string, rate: number, unit: string }>> {
    // Cargar conocimiento de tarifas de mano de obra
    const knowledgeBase = this.loadKnowledgeBase();
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
  async analyzeContractorSpecialties(): Promise<{ 
    topSpecialties: string[],
    preferredMaterials: Record<string, string[]>,
    typicalMarkups: Record<string, number>
  }> {
    const knowledgeBase = this.loadKnowledgeBase();
    
    return {
      topSpecialties: knowledgeBase.contractorProfile.specialties,
      preferredMaterials: knowledgeBase.contractorProfile.preferredMaterials,
      typicalMarkups: knowledgeBase.contractorProfile.typicalMarkups
    };
  }

  /**
   * Actualiza el conocimiento sobre materiales y precios
   */
  private async updateMaterialKnowledge(
    estimate: EstimateResult,
    projectDetails: ProjectDetails
  ): Promise<void> {
    // Solo actualizar si hay información de materiales
    if (!estimate.materials || estimate.materials.length === 0) {
      return;
    }
    
    // Cargar conocimiento actual
    const knowledgeBase = this.loadKnowledgeBase();
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
    
    // Guardar conocimiento actualizado
    this.saveKnowledgeBase(knowledgeBase);
  }

  /**
   * Actualiza el conocimiento sobre tarifas de mano de obra
   */
  private async updateLaborKnowledge(
    estimate: EstimateResult,
    projectDetails: ProjectDetails
  ): Promise<void> {
    // Solo actualizar si hay información de servicios
    if (!estimate.services || estimate.services.length === 0) {
      return;
    }
    
    // Cargar conocimiento actual
    const knowledgeBase = this.loadKnowledgeBase();
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
    
    // Guardar conocimiento actualizado
    this.saveKnowledgeBase(knowledgeBase);
  }

  /**
   * Actualiza los patrones de proyectos
   */
  private async updateProjectPatterns(
    estimate: EstimateResult,
    projectDetails: ProjectDetails,
    wasAccepted: boolean,
    finalPrice?: number
  ): Promise<void> {
    // Cargar conocimiento actual
    const knowledgeBase = this.loadKnowledgeBase();
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
    
    // Guardar conocimiento actualizado
    this.saveKnowledgeBase(knowledgeBase);
    
    // Si es necesario, actualizar el perfil del contratista
    if (this.shouldUpdateContractorProfile(knowledgeBase)) {
      await this.updateContractorProfile();
    }
  }

  /**
   * Actualiza las preferencias del cliente
   */
  private async updateClientPreferences(
    clientId: string,
    projectDetails: ProjectDetails,
    wasAccepted: boolean
  ): Promise<void> {
    // Cargar conocimiento actual
    const knowledgeBase = this.loadKnowledgeBase();
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
    
    // Guardar conocimiento actualizado
    this.saveKnowledgeBase(knowledgeBase);
  }

  /**
   * Actualiza el perfil general del contratista
   */
  private async updateContractorProfile(): Promise<void> {
    // Cargar conocimiento actual
    const knowledgeBase = this.loadKnowledgeBase();
    
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
    
    // Guardar conocimiento actualizado
    this.saveKnowledgeBase(knowledgeBase);
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
   * Carga la base de conocimiento desde caché persistente
   */
  private loadKnowledgeBase(): any {
    const knowledgeBasePath = path.join(this.persistentCache.getCachePath(), 'knowledge_base.json');
    
    try {
      const data = fs.readFileSync(knowledgeBasePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error cargando base de conocimiento:', error);
      // Si hay error, inicializar de nuevo
      this.initializeKnowledgeBase();
      return this.loadKnowledgeBase();
    }
  }

  /**
   * Guarda la base de conocimiento en caché persistente
   */
  private saveKnowledgeBase(knowledgeBase: any): void {
    const knowledgeBasePath = path.join(this.persistentCache.getCachePath(), 'knowledge_base.json');
    
    try {
      fs.writeFileSync(knowledgeBasePath, JSON.stringify(knowledgeBase, null, 2));
    } catch (error) {
      console.error('Error guardando base de conocimiento:', error);
    }
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
      // Si no hay datos, devolver un rango por defecto
      return { min: 1000, max: 5000 };
    }
    
    // Extraer costos y ajustar por dimensiones
    const baseCosts = similarPatterns.map(pattern => {
      let sizeFactor = 1;
      
      // Intentar ajustar por tamaño si es posible
      if (pattern.dimensions && projectDetails.dimensions) {
        if (pattern.dimensions.squareFeet && projectDetails.dimensions.squareFeet) {
          sizeFactor = projectDetails.dimensions.squareFeet / pattern.dimensions.squareFeet;
        } else if (pattern.dimensions.length && projectDetails.dimensions.length) {
          sizeFactor = projectDetails.dimensions.length / pattern.dimensions.length;
        }
      }
      
      // Limitar el factor a un rango razonable
      sizeFactor = Math.max(0.5, Math.min(2, sizeFactor));
      
      return pattern.totalEstimatedCost * sizeFactor;
    });
    
    // Calcular el rango basado en los costos ajustados
    const sortedCosts = baseCosts.sort((a, b) => a - b);
    const min = sortedCosts[0];
    const max = sortedCosts[sortedCosts.length - 1];
    
    return { min, max };
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