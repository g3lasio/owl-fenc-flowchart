import { OpenAIClient } from '../services/openai.client';
import { AnthropicClient } from '../services/anthropic.client';
import { FenceDimensions, FenceOptions, FenceType, RequiredMaterial, Location, ProjectResult, RequiredService } from '../interfaces/fence.interfaces';
import { MaterialCache } from '../interfaces/calculators.interfaces';
import { PriceApiService } from '../services/price-api.service';
import { PriceResearchService } from '../services/price-research.service';
import { ConstructionMethodService } from '../services/construction-method.service';
import { PersistentCacheService } from '../services/persistent-cache.service';
import { config } from '../config/config';

/**
 * Motor DeepSearch con procesamiento paralelo y optimizaciones avanzadas
 * para estimados precisos y rápidos
 */
export class DeepSearchEngine {
  private materialCache: PersistentCacheService;
  private readonly SUPPORTED_PROJECT_TYPES = [
    'fencing', 'decking', 'roofing', 'concrete', 'patio', 'pergola', 'gazebo', 'retaining_wall'
  ];
  private readonly SUPPORTED_FENCE_SUBTYPES = [
    'wood', 'vinyl', 'chain_link', 'aluminum', 'iron', 'composite', 'bamboo', 'steel', 'pvc'
  ];
  private readonly FALLBACK_MARKUP_PERCENT = 20; // 20% sobre costos si falla el cálculo de markup
  private readonly DEFAULT_MARKUPS = {
    fencing: 0.25, // 25% para cercas
    decking: 0.30, // 30% para terrazas
    patio: 0.28, // 28% para patios
    landscaping: 0.35, // 35% para paisajismo
    default: 0.25 // valor por defecto
  };

  // Precios por pie lineal por tipo de proyecto y región
  private readonly REGIONAL_PRICES_PER_LINEAR_FOOT = {
    california: {
      fencing: {
        wood: { withGates: 65, withoutGates: 61 },
        vinyl: { withGates: 70, withoutGates: 65 },
        'chain-link': { withGates: 40, withoutGates: 35 },
        aluminum: { withGates: 80, withoutGates: 75 },
        iron: { withGates: 120, withoutGates: 110 }
      }
    },
    texas: {
      fencing: {
        wood: { withGates: 58, withoutGates: 54 },
        vinyl: { withGates: 65, withoutGates: 60 },
        'chain-link': { withGates: 35, withoutGates: 30 },
        aluminum: { withGates: 75, withoutGates: 70 },
        iron: { withGates: 110, withoutGates: 100 }
      }
    },
    florida: {
      fencing: {
        wood: { withGates: 62, withoutGates: 57 },
        vinyl: { withGates: 68, withoutGates: 63 },
        'chain-link': { withGates: 38, withoutGates: 33 },
        aluminum: { withGates: 78, withoutGates: 73 },
        iron: { withGates: 115, withoutGates: 105 }
      }
    },
    default: {
      fencing: {
        wood: { withGates: 60, withoutGates: 55 },
        vinyl: { withGates: 65, withoutGates: 60 },
        'chain-link': { withGates: 35, withoutGates: 30 },
        aluminum: { withGates: 75, withoutGates: 70 },
        iron: { withGates: 110, withoutGates: 100 }
      }
    }
  };

  constructor(
    private readonly openAIClient: OpenAIClient,
    private readonly anthropicClient: AnthropicClient,
    private readonly priceApiService: PriceApiService,
    private readonly priceResearchService: PriceResearchService,
    private readonly constructionMethodService: ConstructionMethodService
  ) {
    // Usar caché persistente para mejorar rendimiento
    this.materialCache = new PersistentCacheService(config.cache.cachePath);
    
    // Verificar si las API keys están configuradas
    this.checkApiKeys();
  }

  /**
   * Verifica que las API keys necesarias estén configuradas
   */
  private checkApiKeys(): void {
    if (!config.openai.apiKey) {
      console.warn('⚠️ OpenAI API key no configurada. Algunas funciones tendrán rendimiento limitado.');
    }
    
    if (!config.anthropic.apiKey) {
      console.warn('⚠️ Anthropic API key no configurada. Algunas funciones tendrán rendimiento limitado.');
    }
  }
  
  /**
   * Analiza un proyecto para generar un estimado completo
   * Utiliza procesamiento paralelo para maximizar la eficiencia
   */
  async analyzeProject(
    projectType: string, 
    projectSubtype: string, 
    dimensions: any, 
    options: any, 
    location: Location
  ): Promise<ProjectResult> {
    // Crear clave de caché
    const cacheKey = this.generateCacheKey(projectType, projectSubtype, dimensions, options, location);
    
    // Verificar caché
    const cachedResult = this.materialCache.get<ProjectResult>(cacheKey);
    if (cachedResult) {
      console.log('Usando resultado en caché para:', projectType, projectSubtype);
      return cachedResult;
    }
    
    try {
      // Validar los parámetros de entrada
      this.validateProjectInputs(projectType, projectSubtype, dimensions, location);
      
      // Normalizar datos de entrada
      const normalizedDimensions = this.normalizeDimensions(dimensions, projectType);
      const normalizedOptions = this.normalizeOptions(options, projectType, projectSubtype);
      
      // PROCESAMIENTO PARALELO: Ejecutar tareas independientes simultáneamente
      console.log('Iniciando análisis paralelo del proyecto...');
      
      const [
        materialsAndPrices,
        constructionMethod,
        regionalPricing
      ] = await Promise.all([
        this.analyzeMaterialsAndPrices(projectType, projectSubtype, normalizedDimensions, normalizedOptions, location),
        this.getConstructionMethod(projectType, projectSubtype, normalizedDimensions, normalizedOptions, location),
        this.getRegionalPricingData(projectType, projectSubtype, location, normalizedOptions)
      ]);
      
      // Procesar resultados de las tareas paralelas
      const { materials, services } = materialsAndPrices;
      const { pricePerFoot, hasGates } = regionalPricing;
      
      // Calcular costos
      const materialCost = this.calculateMaterialCost(materials);
      const laborCost = this.calculateLaborCost(services);
      const equipmentCost = this.calculateEquipmentCost(services);
      
      // Calcular precio total basado en pie lineal con ajustes
      const totalPrice = this.calculateTotalPriceFromLinearFoot(
        pricePerFoot,
        normalizedDimensions,
        normalizedOptions
      );
      
      // Calcular markup implícito basado en la diferencia entre el precio por pie lineal
      // y los costos calculados
      const totalDirectCost = materialCost + laborCost + equipmentCost;
      const impliedMarkup = Math.max(0, totalPrice.totalCost - totalDirectCost);
      const recommendedMarkup = impliedMarkup / totalDirectCost || this.getDefaultMarkup(projectType);
      
      // Estimación de tiempo del proyecto
      const timeEstimate = this.calculateTimeEstimate(services, projectType, normalizedDimensions);
      
      // Construir resultado final
      const result: ProjectResult = {
        materials,
        services,
        materialCost,
        laborCost, 
        equipmentCost,
        recommendedMarkup,
        totalCost: totalPrice.totalCost,
        pricePerUnit: totalPrice.pricePerUnit,
        constructionMethod,
        timeEstimate
      };
      
      // Guardar en caché con el TTL configurado
      this.materialCache.set(
        cacheKey, 
        result, 
        config.cache.ttlSeconds,
        config.cache.persistToDisk
      );
      
      return result;
    } catch (error) {
      console.error('Error en DeepSearchEngine.analyzeProject:', error);
      throw error;
    }
  }
  
  /**
   * Método optimizado para analizar materiales y precios en paralelo
   */
  private async analyzeMaterialsAndPrices(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    location: Location
  ): Promise<{materials: RequiredMaterial[], services: RequiredService[]}> {
    try {
      // Ejecutar en paralelo la obtención de materiales y servicios
      const [requiredMaterials, requiredServices] = await Promise.all([
        this.getRequiredMaterials(projectType, projectSubtype, dimensions, options),
        this.getRequiredServices(projectType, projectSubtype, dimensions, options, location)
      ]);
      
      // Obtener precios para todos los materiales en paralelo
      const materials = await this.getPricedMaterials(requiredMaterials, location);
      
      return { materials, services: requiredServices };
    } catch (error) {
      console.error('Error en análisis paralelo de materiales y precios:', error);
      
      // Usar fallbacks si falla el análisis paralelo
      const materials = this.getFallbackMaterials(projectType, projectSubtype, dimensions);
      const services = this.getFallbackServices(projectType, projectSubtype, dimensions);
      
      return { materials, services };
    }
  }
  
  /**
   * Obtiene información de precios regionales
   */
  private async getRegionalPricingData(
    projectType: string,
    projectSubtype: string,
    location: Location,
    options: any
  ): Promise<{ pricePerFoot: number, hasGates: boolean }> {
    const hasGates = options.gates && options.gates.length > 0;
    
    // Obtener precio por pie lineal para la región
    const pricePerFoot = await this.getRegionalPricePerLinearFoot(
      projectType,
      projectSubtype,
      location,
      options
    );
    
    return { pricePerFoot, hasGates };
  }
  
  /**
   * Genera clave única para caché basada en los parámetros del proyecto
   */
  private generateCacheKey(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    location: Location
  ): string {
    // Crear clave de caché que capture todos los aspectos relevantes del proyecto
    const dimensionsKey = JSON.stringify(dimensions);
    const optionsKey = JSON.stringify(options);
    const locationKey = `${location.city}-${location.state}-${location.zipCode}`;
    
    return `${projectType}|${projectSubtype}|${dimensionsKey}|${optionsKey}|${locationKey}`;
  }

  /**
   * Obtiene el precio por pie lineal para una región específica
   * También puede investigar automáticamente precios si no están en la base de conocimiento
   */
  private async getRegionalPricePerLinearFoot(
    projectType: string,
    projectSubtype: string,
    location: Location,
    options: any
  ): Promise<number> {
    // Determinar región basado en state
    const region = this.getRegionFromState(location.state);
    
    // Determinar si hay puertas para aplicar precio correspondiente
    const hasGates = options.gates && options.gates.length > 0;
    const priceType = hasGates ? 'withGates' : 'withoutGates';
    
    // Buscar en precios conocidos
    try {
      const regionData = this.REGIONAL_PRICES_PER_LINEAR_FOOT[region] || 
                         this.REGIONAL_PRICES_PER_LINEAR_FOOT.default;
      
      const projectData = regionData[projectType] || {};
      const subTypeData = projectData[projectSubtype] || {};
      
      // Si tenemos el precio, devolverlo
      if (subTypeData[priceType]) {
        return subTypeData[priceType];
      }
    } catch (error) {
      console.warn('Error al buscar precio regional, buscando automáticamente:', error);
    }
    
    // Si no tenemos el precio en nuestro catálogo, investigarlo
    return this.researchRegionalPricing(projectType, projectSubtype, location, hasGates);
  }
  
  /**
   * Investiga precios por pie lineal para un tipo de proyecto y ubicación
   * Usa IA para buscar precios actualizados
   */
  private async researchRegionalPricing(
    projectType: string,
    projectSubtype: string,
    location: Location,
    hasGates: boolean
  ): Promise<number> {
    const priceType = hasGates ? 'con puertas' : 'sin puertas';
    
    // Crear prompt para investigar precios
    const prompt = `
    Como experto en contratación para proyectos de construcción exterior, necesito información sobre
    precios actuales por pie lineal para ${projectSubtype} ${projectType} ${priceType} en ${location.city}, ${location.state}.
    
    Por favor proporciona:
    1. El rango de precios típico por pie lineal para este tipo de proyecto en esta área
    2. El precio promedio que cobran los contratistas de buena reputación
    3. Factores que pueden afectar el precio en esta área específica
    
    Responde SOLO con el precio promedio por pie lineal como un número, por ejemplo: "65.50"
    `;
    
    try {
      // Usar Anthropic para investigación de precios (más preciso para este caso)
      const completion = await this.anthropicClient.complete({
        prompt,
        model: 'claude-instant-1.2',
        maxTokens: 50,
        temperature: 0.2
      });
      
      // Extraer número de la respuesta
      const priceMatch = completion.match(/(\d+\.\d+|\d+)/);
      if (priceMatch && priceMatch[0]) {
        const price = parseFloat(priceMatch[0]);
        if (price > 0) {
          return price;
        }
      }
      
      // Si no se pudo extraer, usar precios por defecto
      return hasGates ? 65 : 60; // Valores por defecto para cercas
    } catch (error) {
      console.error('Error al investigar precios regionales:', error);
      return hasGates ? 65 : 60; // Valores por defecto en caso de error
    }
  }
  
  /**
   * Calcula el precio total basado en pie lineal y dimensiones
   */
  private calculateTotalPriceFromLinearFoot(
    pricePerFoot: number,
    dimensions: any,
    options: any
  ): { totalCost: number; pricePerUnit: number } {
    // Para cercas, el precio por unidad es por pie lineal
    let linearFeet = dimensions.length || 0;
    
    // Ajustes por altura (típicamente +$2 por pie adicional sobre 6')
    const standardHeight = 6;
    const height = dimensions.height || standardHeight;
    
    let heightAdjustment = 0;
    if (height > standardHeight) {
      heightAdjustment = (height - standardHeight) * 2;
    }
    
    const adjustedPricePerFoot = pricePerFoot + heightAdjustment;
    const totalCost = linearFeet * adjustedPricePerFoot;
    
    return {
      totalCost,
      pricePerUnit: adjustedPricePerFoot
    };
  }
  
  /**
   * Convierte estado en región para buscar precios regionales
   */
  private getRegionFromState(state: string): string {
    const californiaStates = ['CA', 'California'];
    const texasStates = ['TX', 'Texas'];
    const floridaStates = ['FL', 'Florida'];
    
    if (californiaStates.includes(state)) {
      return 'california';
    } else if (texasStates.includes(state)) {
      return 'texas';
    } else if (floridaStates.includes(state)) {
      return 'florida';
    }
    
    return 'default';
  }

  // Resto del código existente...
}