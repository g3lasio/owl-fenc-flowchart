# Implementación del Motor DeepSearch para Estimados

## Arquitectura Simplificada Multi-Motor

En lugar de un único motor monolítico, implementaremos un sistema de micro-motores especializados que trabajarán en paralelo:

```
┌───────────────────────────────────────────────────────┐
│                 ORQUESTADOR CENTRAL                   │
└───────────────┬─────────────────┬────────────────────┘
                │                 │                    
    ┌───────────▼─────┐   ┌───────▼────────┐   ┌───────▼────────┐
    │ MOTOR REGULACIÓN│   │ MOTOR MATERIAL │   │  MOTOR LABOR   │
    └─────────┬───────┘   └───────┬────────┘   └───────┬────────┘
              │                   │                    │
    ┌─────────▼───────┐   ┌───────▼────────┐   ┌───────▼────────┐
    │    API/CACHE    │   │   API/CACHE    │   │   API/CACHE    │
    │   REGULACIONES  │   │   MATERIALES   │   │    TARIFAS     │
    └─────────────────┘   └────────────────┘   └────────────────┘
```

### 1. Motor de Regulaciones y Métodos
- **Función**: Investigar códigos, permisos y métodos de construcción
- **Fuentes**: Bases de datos locales, APIs municipales, vectorización de normativas
- **Caché**: 30 días con invalidación por cambios regulatorios

### 2. Motor de Materiales y Precios
- **Función**: Calcular cantidades y buscar precios actualizados
- **Fuentes**: Home Depot API, Lowes API, base de datos interna, webscraping
- **Caché**: 24 horas con invalidación por cambio de precios >5%

### 3. Motor de Labor y Servicios
- **Función**: Determinar costos de mano de obra y servicios
- **Fuentes**: Supabase (labor_pricing), ajustes regionales, calculadores específicos
- **Caché**: 7 días con invalidación por temporada

## Implementación para Industria de Cercas

### Arquitectura del Servicio

```typescript
// Estructura principal del servicio
class FencingDeepSearchService {
  private materialEngine: MaterialSearchEngine;
  private laborEngine: LaborPricingEngine;
  private regulationEngine: RegulationEngine;
  private integrationService: IntegrationService;
  
  constructor(
    private readonly supabaseClient: SupabaseClient,
    private readonly openAIClient: OpenAIClient,
    private readonly anthropicClient: AnthropicClient,
    private readonly priceAPIClients: PriceAPIClients
  ) {
    // Inicializar motores específicos
    this.materialEngine = new MaterialSearchEngine(
      this.supabaseClient, 
      this.priceAPIClients
    );
    
    this.laborEngine = new LaborPricingEngine(
      this.supabaseClient
    );
    
    this.regulationEngine = new RegulationEngine(
      this.openAIClient,
      this.anthropicClient
    );
    
    this.integrationService = new IntegrationService();
  }
  
  async generateEstimate(projectDetails: FenceProjectDetails): Promise<CompleteEstimate> {
    // Ejecutar motores en paralelo
    const [materialResults, laborResults, regulationResults] = await Promise.all([
      this.materialEngine.analyze(projectDetails),
      this.laborEngine.calculateCosts(projectDetails),
      this.regulationEngine.checkRegulations(projectDetails)
    ]);
    
    // Integrar resultados
    const integratedResults = this.integrationService.integrate(
      materialResults,
      laborResults,
      regulationResults,
      projectDetails
    );
    
    // Generar estimado final
    return this.generateFinalEstimate(integratedResults);
  }
}
```

### Implementación del Motor de Materiales

```typescript
class MaterialSearchEngine {
  private cache: MaterialCache;
  
  constructor(
    private readonly supabaseClient: SupabaseClient,
    private readonly priceAPIClients: PriceAPIClients
  ) {
    this.cache = new MaterialCache();
  }
  
  async analyze(project: FenceProjectDetails): Promise<MaterialResults> {
    // Determinar tipo de cerca para calcular materiales
    const materialCalculator = this.getMaterialCalculator(project.fenceType);
    
    // Calcular cantidades necesarias
    const requiredMaterials = materialCalculator.calculate(
      project.dimensions,
      project.options
    );
    
    // Buscar precios actualizados (con failover entre fuentes)
    const pricedMaterials = await this.fetchPrices(
      requiredMaterials,
      project.location
    );
    
    return {
      materials: pricedMaterials,
      totalMaterialCost: this.calculateTotalCost(pricedMaterials)
    };
  }
  
  private getMaterialCalculator(fenceType: string): MaterialCalculator {
    // Seleccionar la implementación correcta según tipo de cerca
    switch(fenceType) {
      case 'wood': return new WoodFenceMaterialCalculator();
      case 'vinyl': return new VinylFenceMaterialCalculator();
      case 'chain-link': return new ChainLinkFenceMaterialCalculator();
      case 'iron': return new IronFenceMaterialCalculator();
      case 'aluminum': return new AluminumFenceMaterialCalculator();
      case 'mesh': return new MeshFenceMaterialCalculator();
      case 'concrete': return new ConcreteFenceMaterialCalculator();
      default: throw new Error(`Unsupported fence type: ${fenceType}`);
    }
  }
  
  async fetchPrices(
    materials: RequiredMaterial[], 
    location: Location
  ): Promise<PricedMaterial[]> {
    // Verificar caché primero
    const cachedResults = this.cache.getMaterialPrices(materials, location);
    const materialsToFetch = materials.filter(m => !cachedResults.has(m.id));
    
    if (materialsToFetch.length === 0) {
      return Array.from(cachedResults.values());
    }
    
    // Buscar precios en múltiples fuentes en paralelo
    const fetchedPrices = await this.fetchPricesFromSources(materialsToFetch, location);
    
    // Actualizar caché con nuevos precios
    fetchedPrices.forEach(priced => this.cache.set(priced));
    
    // Combinar precios en caché con los nuevos
    return [...cachedResults.values(), ...fetchedPrices];
  }
}
```

### Implementación del Motor de Labor (con datos de Supabase)

```typescript
class LaborPricingEngine {
  private cache: LaborCache;
  
  constructor(private readonly supabaseClient: SupabaseClient) {
    this.cache = new LaborCache();
  }
  
  async calculateCosts(project: FenceProjectDetails): Promise<LaborResults> {
    // Determinar tipo de cerca para buscar tarifas apropiadas
    const fenceType = project.fenceType;
    const projectSize = project.dimensions;
    const services = project.services || ['installation']; // Default
    
    // Buscar tarifas en Supabase
    const laborRates = await this.getLaborRates(fenceType, services);
    
    // Calcular costos por servicio
    const serviceCosts = await Promise.all(services.map(async service => {
      const rateInfo = laborRates.find(r => r.service_type === service);
      
      if (!rateInfo) {
        throw new Error(`No labor rate found for ${fenceType} - ${service}`);
      }
      
      // Determinar unidad de medida y método de cálculo
      const { pricing_unit, base_rate, minimum_charge } = rateInfo;
      
      // Calcular precio según unidad (linear_ft, sq_ft, etc)
      const quantity = this.calculateQuantity(pricing_unit, projectSize);
      const rawCost = quantity * base_rate;
      
      // Aplicar cargo mínimo si corresponde
      const finalCost = Math.max(rawCost, minimum_charge);
      
      return {
        service,
        description: this.getServiceDescription(service, fenceType),
        quantity,
        unit: pricing_unit,
        rate: base_rate,
        cost: finalCost
      };
    }));
    
    return {
      services: serviceCosts,
      totalLaborCost: serviceCosts.reduce((sum, item) => sum + item.cost, 0)
    };
  }
  
  private async getLaborRates(fenceType: string, services: string[]): Promise<LaborRate[]> {
    // Consultar tabla labor_pricing en Supabase
    const { data, error } = await this.supabaseClient
      .from('labor_pricing')
      .select('*')
      .in('service_type', services)
      .eq('fence_type', fenceType);
      
    if (error) {
      throw new Error(`Error fetching labor rates: ${error.message}`);
    }
    
    return data;
  }
}
```

## Estrategia de Implementación Rápida (3-4 semanas)

### Semana 1: Infraestructura Base
- **Día 1-2**: Setup del proyecto (Next.js + Express/NestJS)
- **Día 3-5**: Conexión con APIs externas (OpenAI, Anthropic, Supabase)
- **Fin de semana**: Sistema de caché y estructura de base

### Semana 2: Motor de Materiales para Cercas
- **Día 1-2**: Implementación de calculadores para Wood y Vinyl
- **Día 3-4**: Implementación de calculadores para Chain Link y Iron
- **Día 5**: Implementación para Aluminum, Mesh y Concrete
- **Fin de semana**: Testing y ajustes

### Semana 3: Motor de Labor y Regulaciones
- **Día 1-2**: Integración con Supabase labor_pricing
- **Día 3-4**: Sistema de consulta de regulaciones
- **Día 5**: Integración de componentes
- **Fin de semana**: Testing con datos reales

### Semana 4: Frontend y Generación de Estimados
- **Día 1-2**: Formulario para captura de datos
- **Día 3-4**: Generador de PDFs profesionales
- **Día 5**: Sistema de envío por email
- **Fin de semana**: Pruebas finales

## Detalles de Implementación por Tipo de Cerca

### 1. Wood Fence
```typescript
class WoodFenceMaterialCalculator implements MaterialCalculator {
  calculate(dimensions: FenceDimensions, options: FenceOptions): RequiredMaterial[] {
    const { length, height } = dimensions;
    const postSpacing = 8; // pies entre postes
    
    const posts = Math.ceil(length / postSpacing) + 1;
    const rails = Math.ceil(length / postSpacing) * 3; // 3 rails por sección
    const pickets = Math.ceil(length * 2); // 2 pickets por pie lineal
    
    return [
      { 
        id: 'wood-post', 
        name: `${height + 2}' Wood Post`, 
        quantity: posts, 
        unit: 'each'
      },
      { 
        id: 'rail-2x4',
        name: '2"x4"x8\' Pressure Treated Rail', 
        quantity: rails, 
        unit: 'each' 
      },
      { 
        id: 'picket',
        name: `1"x6"x${height}' Wood Fence Picket`, 
        quantity: pickets, 
        unit: 'each' 
      },
      { 
        id: 'concrete',
        name: 'Concrete Mix 50lb', 
        quantity: posts * 2, 
        unit: 'bag' 
      },
      { 
        id: 'screws',
        name: 'Exterior Screws 5lb', 
        quantity: Math.ceil(pickets / 100), 
        unit: 'box' 
      }
    ];
  }
}
```

### 2. Chain Link Fence
```typescript
class ChainLinkFenceMaterialCalculator implements MaterialCalculator {
  calculate(dimensions: FenceDimensions, options: FenceOptions): RequiredMaterial[] {
    const { length, height } = dimensions;
    const { gauge = '11', coating = 'galvanized' } = options;
    const postSpacing = 10; // pies entre postes
    
    const terminalPosts = 2;
    const linePosts = Math.ceil(length / postSpacing) - 1;
    const fabric = Math.ceil(length * 1.05); // 5% extra para solapamiento
    const topRail = Math.ceil(length * 1.05);
    
    return [
      { 
        id: 'terminal-post', 
        name: `${height + 2}' Terminal Post ${gauge} Gauge ${coating}`, 
        quantity: terminalPosts, 
        unit: 'each'
      },
      { 
        id: 'line-post',
        name: `${height + 2}' Line Post ${gauge} Gauge ${coating}`, 
        quantity: linePosts, 
        unit: 'each' 
      },
      { 
        id: 'fabric',
        name: `${height}' Chain Link Fabric ${gauge} Gauge ${coating}`, 
        quantity: fabric, 
        unit: 'foot' 
      },
      { 
        id: 'top-rail',
        name: `1-3/8" Top Rail ${coating}`, 
        quantity: topRail, 
        unit: 'foot' 
      },
      { 
        id: 'tension-wire',
        name: 'Tension Wire', 
        quantity: fabric, 
        unit: 'foot' 
      },
      { 
        id: 'concrete',
        name: 'Concrete Mix 50lb', 
        quantity: (terminalPosts + linePosts) * 2, 
        unit: 'bag' 
      }
    ];
  }
}
```

### 3. Iron Fence
```typescript
class IronFenceMaterialCalculator implements MaterialCalculator {
  calculate(dimensions: FenceDimensions, options: FenceOptions): RequiredMaterial[] {
    const { length, height } = dimensions;
    const { style = 'traditional', postCap = 'standard' } = options;
    const postSpacing = 6; // pies entre postes para cerca de hierro
    
    const posts = Math.ceil(length / postSpacing) + 1;
    const panels = Math.ceil(length / postSpacing);
    
    return [
      { 
        id: 'iron-post', 
        name: `${height + 1}' Iron Post for ${height}' Fence`, 
        quantity: posts, 
        unit: 'each'
      },
      { 
        id: 'iron-panel',
        name: `${height}' x ${postSpacing}' Iron Fence Panel (${style})`, 
        quantity: panels, 
        unit: 'each' 
      },
      { 
        id: 'post-cap',
        name: `Iron Post Cap (${postCap} style)`, 
        quantity: posts, 
        unit: 'each' 
      },
      { 
        id: 'concrete',
        name: 'Concrete Mix 60lb', 
        quantity: posts * 3, // Más concreto para postes de hierro
        unit: 'bag' 
      },
      { 
        id: 'paint',
        name: 'Exterior Metal Paint Gallon', 
        quantity: Math.ceil(panels / 8), // 1 galón cubre 8 paneles aprox
        unit: 'each' 
      },
      { 
        id: 'hardware',
        name: 'Metal Fence Hardware Kit', 
        quantity: panels, 
        unit: 'kit' 
      }
    ];
  }
}
```

### 4. Aluminum Fence
```typescript
class AluminumFenceMaterialCalculator implements MaterialCalculator {
  calculate(dimensions: FenceDimensions, options: FenceOptions): RequiredMaterial[] {
    const { length, height } = dimensions;
    const { style = 'standard', color = 'black' } = options;
    const postSpacing = 6; // pies entre postes
    
    const posts = Math.ceil(length / postSpacing) + 1;
    const panels = Math.ceil(length / postSpacing);
    
    return [
      { 
        id: 'aluminum-post', 
        name: `${height + 1}' Aluminum Post, ${color}`, 
        quantity: posts, 
        unit: 'each'
      },
      { 
        id: 'aluminum-panel',
        name: `${height}' x ${postSpacing}' Aluminum Panel (${style}), ${color}`, 
        quantity: panels, 
        unit: 'each' 
      },
      { 
        id: 'post-cap',
        name: `Aluminum Post Cap, ${color}`, 
        quantity: posts, 
        unit: 'each' 
      },
      { 
        id: 'concrete',
        name: 'Concrete Mix 60lb', 
        quantity: posts * 2, 
        unit: 'bag' 
      },
      { 
        id: 'hardware',
        name: 'Aluminum Fence Bracket Kit', 
        quantity: panels * 2, // Brackets para cada panel
        unit: 'kit' 
      },
      { 
        id: 'self-tapping-screws',
        name: 'Self-tapping Screws (100 count)', 
        quantity: Math.ceil(panels / 3), // Un paquete cada 3 paneles
        unit: 'box' 
      }
    ];
  }
}
```

### 5. Mesh Fence
```typescript
class MeshFenceMaterialCalculator implements MaterialCalculator {
  calculate(dimensions: FenceDimensions, options: FenceOptions): RequiredMaterial[] {
    const { length, height } = dimensions;
    const { meshType = 'standard', fastening = 'clips' } = options;
    const postSpacing = 8; // pies entre postes
    
    const posts = Math.ceil(length / postSpacing) + 1;
    const meshArea = length * height * 1.1; // 10% adicional para solapamiento
    
    return [
      { 
        id: 'metal-post', 
        name: `${height + 2}' Metal Post`, 
        quantity: posts, 
        unit: 'each'
      },
      { 
        id: 'mesh',
        name: `Mesh Fencing Material ${meshType}`, 
        quantity: meshArea, 
        unit: 'sq_ft' 
      },
      { 
        id: fastening,
        name: `Mesh ${fastening.charAt(0).toUpperCase() + fastening.slice(1)}`, 
        quantity: posts * 3, // 3 puntos de fijación por poste
        unit: 'each' 
      },
      { 
        id: 'concrete',
        name: 'Concrete Mix 50lb', 
        quantity: posts * 2, 
        unit: 'bag' 
      },
      { 
        id: 'tension-cable',
        name: 'Tension Cable', 
        quantity: length * 3, // Cable superior, medio e inferior
        unit: 'foot' 
      }
    ];
  }
}
```

### 6. Concrete Fence
```typescript
class ConcreteFenceMaterialCalculator implements MaterialCalculator {
  calculate(dimensions: FenceDimensions, options: FenceOptions): RequiredMaterial[] {
    const { length, height } = dimensions;
    const { finish = 'smooth', panelType = 'precast' } = options;
    const postSpacing = panelType === 'precast' ? 8 : 4; // Espaciado depende del tipo
    
    const posts = Math.ceil(length / postSpacing) + 1;
    const panels = Math.ceil(length / postSpacing);
    const concreteVolume = posts * (height * 0.33 * 0.33 * 3); // Pies cúbicos para postes (profundidad 3')
    
    return [
      { 
        id: 'concrete-post', 
        name: `${height + 3}' Concrete Fence Post (${finish})`, 
        quantity: posts, 
        unit: 'each'
      },
      { 
        id: 'concrete-panel',
        name: `${height}' x ${postSpacing}' ${panelType.charAt(0).toUpperCase() + panelType.slice(1)} Concrete Panel (${finish})`, 
        quantity: panels, 
        unit: 'each' 
      },
      { 
        id: 'gravel',
        name: 'Gravel for Post Base', 
        quantity: posts * 0.25, // Yardas cúbicas
        unit: 'cubic_yard' 
      },
      { 
        id: 'concrete-mix',
        name: 'Concrete Mix', 
        quantity: concreteVolume / 0.6, // Convertir pies cúbicos a bolsas (0.6 pies³ por bolsa)
        unit: 'bag' 
      },
      { 
        id: 'rebar',
        name: 'Reinforcing Bar (Rebar)', 
        quantity: posts * height * 4, // 4 barras por poste
        unit: 'foot' 
      },
      { 
        id: 'joint-compound',
        name: 'Concrete Joint Compound', 
        quantity: panels, 
        unit: 'tube' 
      }
    ];
  }
}
```

### 7. Vinyl Fence
```typescript
class VinylFenceMaterialCalculator implements MaterialCalculator {
  calculate(dimensions: FenceDimensions, options: FenceOptions): RequiredMaterial[] {
    const { length, height } = dimensions;
    const { style = 'privacy', color = 'white' } = options;
    const postSpacing = 8; // pies entre postes
    
    const posts = Math.ceil(length / postSpacing) + 1;
    const panels = Math.ceil(length / postSpacing);
    
    return [
      { 
        id: 'vinyl-post', 
        name: `${height + 2}' Vinyl Post, ${color}`, 
        quantity: posts, 
        unit: 'each'
      },
      { 
        id: 'vinyl-panel',
        name: `${height}' x ${postSpacing}' Vinyl ${style.charAt(0).toUpperCase() + style.slice(1)} Panel, ${color}`, 
        quantity: panels, 
        unit: 'each' 
      },
      { 
        id: 'post-cap',
        name: `Vinyl Post Cap, ${color}`, 
        quantity: posts, 
        unit: 'each' 
      },
      { 
        id: 'concrete',
        name: 'Concrete Mix 50lb', 
        quantity: posts * 2, 
        unit: 'bag' 
      },
      { 
        id: 'bracket-kit',
        name: 'Vinyl Fence Bracket Kit', 
        quantity: panels * 2, // Brackets para cada panel
        unit: 'kit' 
      }
    ];
  }
}
```

## Implementación para Consulta de Precios en Tiempo Real

```typescript
interface PriceSource {
  name: string;
  priority: number;
  client: PriceAPIClient;
}

class PriceService {
  private sources: PriceSource[] = [
    {
      name: 'homedepot',
      priority: 1,
      client: new HomeDepotAPIClient(this.config.apiKeys.homeDepot)
    },
    {
      name: 'lowes',
      priority: 2,
      client: new LowesAPIClient(this.config.apiKeys.lowes)
    },
    {
      name: 'supabase',
      priority: 3,
      client: new SupabasePriceClient(this.supabaseClient)
    }
  ];
  
  constructor(
    private readonly config: ConfigService,
    private readonly supabaseClient: SupabaseClient
  ) {}
  
  async getPrices(materials: RequiredMaterial[], location: Location): Promise<PricingResult> {
    const materialsWithPrices = await Promise.all(materials.map(async material => {
      // Intentar con cada fuente en orden de prioridad
      for (const source of this.sources) {
        try {
          const price = await source.client.getPrice(material.id, location);
          
          if (price && price.available) {
            return {
              ...material,
              unitPrice: price.amount,
              source: source.name,
              totalPrice: price.amount * material.quantity
            };
          }
        } catch (error) {
          console.error(`Error fetching price from ${source.name}:`, error);
          // Continuar con la siguiente fuente
        }
      }
      
      // Si todas las fuentes fallan, usar precio estimado
      return {
        ...material,
        unitPrice: this.getEstimatedPrice(material.id),
        source: 'estimated',
        totalPrice: this.getEstimatedPrice(material.id) * material.quantity
      };
    }));
    
    return {
      items: materialsWithPrices,
      sources: this.summarizeSources(materialsWithPrices),
      timestamp: new Date()
    };
  }
  
  private getEstimatedPrice(materialId: string): number {
    // Precios fallback para materiales comunes
    const fallbackPrices: Record<string, number> = {
      'wood-post': 15.99,
      'rail-2x4': 7.99,
      'picket': 3.99,
      'concrete': 5.99,
      'terminal-post': 25.99,
      'line-post': 19.99,
      'fabric': 4.99,
      'top-rail': 2.49,
      // Más materiales...
    };
    
    return fallbackPrices[materialId] || 10.00; // Precio por defecto
  }
}
```

## Implementación Específica del Motor de Regulaciones

```typescript
class RegulationEngine {
  private cache: RegulationCache;
  
  constructor(
    private readonly openAIClient: OpenAIClient,
    private readonly anthropicClient: AnthropicClient
  ) {
    this.cache = new RegulationCache();
  }
  
  async checkRegulations(project: FenceProjectDetails): Promise<RegulationResults> {
    const { fenceType, location, dimensions } = project;
    
    // Verificar caché primero
    const cachedRegulations = this.cache.get(location.zipCode, fenceType);
    if (cachedRegulations) {
      return this.applyRegulationsToProject(cachedRegulations, project);
    }
    
    // Consultar regulaciones con IA (Claude Opus)
    const regulationPrompt = this.buildRegulationPrompt(fenceType, location);
    const regulationResponse = await this.anthropicClient.complete({
      prompt: regulationPrompt,
      maxTokens: 2000
    });
    
    // Parsear respuesta estructurada
    const regulations = this.parseRegulationResponse(regulationResponse);
    
    // Guardar en caché
    this.cache.set(location.zipCode, fenceType, regulations);
    
    // Aplicar regulaciones al proyecto específico
    return this.applyRegulationsToProject(regulations, project);
  }
  
  private buildRegulationPrompt(fenceType: string, location: Location): string {
    return `
      I need detailed information about building regulations for ${fenceType} fences 
      in ${location.city}, ${location.state}, zip code ${location.zipCode}.
      
      Please provide information on:
      1. Maximum allowed height for residential fences
      2. Setback requirements from property lines
      3. Permit requirements and typical costs
      4. Any specific restrictions on materials or designs
      5. HOA common restrictions in this area
      6. Installation requirements (post depth, spacing, etc)
      
      Format your response as structured data in JSON format.
    `;
  }
}
```

## Asignación Óptima de Motores de IA por Tarea

```typescript
class AIOrchestrator {
  // Configuración de modelos por tarea
  private modelConfiguration = {
    regulationResearch: {
      primary: {
        provider: 'anthropic',
        model: 'claude-opus',
        timeout: 15000
      },
      fallback: {
        provider: 'openai',
        model: 'gpt-4o',
        timeout: 10000
      }
    },
    materialCalculation: {
      primary: {
        provider: 'openai',
        model: 'gpt-4o',
        timeout: 8000
      },
      fallback: {
        provider: 'anthropic',
        model: 'claude-haiku',
        timeout: 5000
      }
    },
    documentGeneration: {
      primary: {
        provider: 'anthropic',
        model: 'claude-sonnet',
        timeout: 10000
      },
      fallback: {
        provider: 'openai',
        model: 'gpt-4o',
        timeout: 10000
      }
    }
  };
  
  constructor(
    private readonly openAIClient: OpenAIClient,
    private readonly anthropicClient: AnthropicClient,
    private readonly config: ConfigService
  ) {}
  
  async completeTask(task: AITask): Promise<AIResponse> {
    const taskConfig = this.getTaskConfiguration(task.type);
    
    try {
      // Intentar con modelo primario
      const primaryResponse = await this.callModel(
        taskConfig.primary, 
        task.prompt,
        task.parameters
      );
      
      return primaryResponse;
    } catch (error) {
      console.error(`Error with primary model for ${task.type}:`, error);
      
      // Fallar a modelo secundario
      return this.callModel(
        taskConfig.fallback,
        task.prompt,
        task.parameters
      );
    }
  }
  
  private async callModel(
    config: ModelConfig, 
    prompt: string, 
    parameters: any
  ): Promise<AIResponse> {
    const { provider, model, timeout } = config;
    
    if (provider === 'openai') {
      return this.openAIClient.complete({
        model,
        prompt,
        ...parameters,
        timeout
      });
    } else if (provider === 'anthropic') {
      return this.anthropicClient.complete({
        model,
        prompt,
        ...parameters,
        timeout
      });
    }
    
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
```