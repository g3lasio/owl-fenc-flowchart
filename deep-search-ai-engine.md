# Motor DeepSearch Multi-IA para Estimados Ultra Precisos

Este documento detalla la arquitectura y funcionamiento del motor DeepSearch que potencia el sistema Owl Fence Estimator, combinando múltiples motores de IA para generar estimados basados en investigación en tiempo real.

## Arquitectura Multi-IA

### Componentes Principales del Motor DeepSearch

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│  IA Investigadora │     │  IA Calculadora   │     │  IA Compositora   │
│  (Claude Opus)    │────▶│  (GPT-4o)         │────▶│  (Claude Sonnet)  │
└───────────────────┘     └───────────────────┘     └───────────────────┘
         │                         │                          │
         ▼                         ▼                          ▼
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│ Base Conocimiento │     │   Base de Datos   │     │ Generador de PDF  │
│     Vectorial     │     │    Materiales     │     │    Dinámico       │
└───────────────────┘     └───────────────────┘     └───────────────────┘
```

### 1. IA Investigadora (Claude Opus)
Especializada en recopilar información profunda sobre:
- Códigos y regulaciones de construcción por localidad
- Métodos de instalación específicos para cada proyecto
- Estándares de la industria y mejores prácticas
- Tendencias locales y preferencias de clientes

### 2. IA Calculadora (GPT-4o)
Enfocada en procesamiento numérico preciso:
- Cálculo exacto de cantidades de materiales
- Estimación de horas de mano de obra
- Ajustes por factores de complejidad
- Optimización de costos y márgenes

### 3. IA Compositora (Claude Sonnet)
Especializada en generación de documentos profesionales:
- Lenguaje persuasivo orientado a ventas
- Descripción clara y detallada del proyecto
- Términos y condiciones personalizados
- Formato visualmente atractivo

## Flujo del Proceso DeepSearch

### Fase 1: Investigación Profunda en Tiempo Real

```typescript
interface DeepSearchRequest {
  projectType: string;          // "vinyl_fence_installation", "wood_fence_repair"
  location: {
    address?: string;
    city: string;
    state: string;
    zipCode: string;
    county?: string;
  };
  propertyType: string;         // "residential", "commercial"
  dimensions: {
    [key: string]: number;      // Dimensiones relevantes del proyecto
  };
  clientRequirements?: string;  // Requisitos especiales mencionados por el cliente
}

async function performDeepResearch(request: DeepSearchRequest): Promise<ResearchResults> {
  // 1. Consultar códigos de construcción locales
  const buildingCodes = await fetchBuildingCodes(request.location, request.projectType);
  
  // 2. Investigar prácticas estándar de instalación
  const installationPractices = await researchInstallationMethods(
    request.projectType, 
    request.location.state,
    buildingCodes
  );
  
  // 3. Determinar métodos de medición y cobro estándar
  const pricingMethods = await researchIndustryPricing(
    request.projectType,
    request.location
  );
  
  // 4. Analizar precios promedio en la zona
  const regionalPricing = await analyzeRegionalPricing(
    request.projectType,
    request.location.zipCode,
    request.dimensions
  );
  
  return {
    buildingCodes,
    installationPractices,
    pricingMethods,
    regionalPricing,
    lastUpdated: new Date()
  };
}
```

### Fase 2: Consulta de Precios en Tiempo Real

```typescript
async function fetchRealTimePricing(
  materials: MaterialsList,
  location: Location
): Promise<PricedMaterialsList> {
  // Lista de fuentes de precios a consultar
  const pricingSources = [
    { source: "homedepot", priority: 1 },
    { source: "lowes", priority: 2 },
    { source: "menards", priority: 3 },
    { source: "internal_database", priority: 4 }
  ];
  
  const pricedMaterials = await Promise.all(materials.map(async material => {
    // Consulta en paralelo a múltiples fuentes
    const priceResults = await Promise.all(pricingSources.map(async source => {
      try {
        return await fetchPrice(material, source.source, location);
      } catch (e) {
        // Si una fuente falla, registrar y continuar
        console.error(`Failed to fetch price from ${source.source}`, e);
        return null;
      }
    }));
    
    // Elegir el mejor precio disponible (filtrar nulls, ordenar por prioridad)
    const validPrices = priceResults
      .filter(result => result !== null)
      .sort((a, b) => {
        // Primero por disponibilidad, luego por prioridad de fuente
        if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
        // Luego por prioridad de la fuente
        const aPriority = pricingSources.find(s => s.source === a.source)?.priority || 99;
        const bPriority = pricingSources.find(s => s.source === b.source)?.priority || 99;
        return aPriority - bPriority;
      });
    
    const selectedPrice = validPrices[0] || { 
      price: material.fallbackPrice,
      source: "estimated",
      isAvailable: true
    };
    
    return {
      ...material,
      unitPrice: selectedPrice.price,
      priceSource: selectedPrice.source,
      totalPrice: selectedPrice.price * material.quantity
    };
  }));
  
  return {
    items: pricedMaterials,
    lastUpdated: new Date()
  };
}
```

### Fase 3: Cálculo Avanzado de Mano de Obra

```typescript
async function calculateLaborCosts(
  projectType: string,
  dimensions: Record<string, number>,
  complexity: ProjectComplexity,
  location: Location,
  projectSpecifics: ProjectSpecifics
): Promise<LaborCostBreakdown> {
  // 1. Obtener tarifas base para la región
  const baseRates = await fetchRegionalLaborRates(location, projectType);
  
  // 2. Calcular horas base según dimensiones y tipo
  const baseHours = calculateBaseHours(projectType, dimensions);
  
  // 3. Aplicar factores de complejidad
  const complexityFactor = determineComplexityFactor(complexity);
  const adjustedHours = baseHours * complexityFactor;
  
  // 4. Desglosar por tipo de trabajo
  const laborBreakdown = determineLaborBreakdown(
    projectType, 
    adjustedHours,
    projectSpecifics
  );
  
  // 5. Calcular costos usando tarifas regionales
  const costBreakdown = laborBreakdown.map(labor => ({
    description: labor.description,
    hours: labor.hours,
    rate: baseRates[labor.skillLevel] || baseRates.default,
    totalCost: labor.hours * (baseRates[labor.skillLevel] || baseRates.default)
  }));
  
  // 6. Aplicar factor de ajuste regional final
  const regionalFactor = location.regionalFactor || 1.0;
  
  return {
    items: costBreakdown,
    totalHours: adjustedHours,
    subtotal: costBreakdown.reduce((sum, item) => sum + item.totalCost, 0),
    regionalAdjustment: regionalFactor,
    total: costBreakdown.reduce((sum, item) => sum + item.totalCost, 0) * regionalFactor
  };
}
```

### Fase 4: Integración y Generación del Estimado Final

```typescript
async function generateCompleteEstimate(
  clientInfo: ClientInfo,
  contractorInfo: ContractorInfo,
  projectDetails: ProjectDetails,
  researchResults: ResearchResults,
  pricedMaterials: PricedMaterialsList,
  laborCosts: LaborCostBreakdown
): Promise<CompleteEstimate> {
  // 1. Calcular subtotales
  const materialSubtotal = pricedMaterials.items.reduce((sum, item) => sum + item.totalPrice, 0);
  const laborSubtotal = laborCosts.total;
  
  // 2. Calcular impuestos aplicables
  const taxInfo = await calculateApplicableTaxes(
    projectDetails.location,
    materialSubtotal,
    projectDetails.projectType
  );
  
  // 3. Aplicar margen de beneficio del contratista
  const margin = contractorInfo.preferredMargin || 0.25; // 25% por defecto
  const profitAmount = (materialSubtotal + laborSubtotal) * margin;
  
  // 4. Generar resumen financiero
  const financialSummary = {
    materialCost: materialSubtotal,
    laborCost: laborSubtotal,
    subtotal: materialSubtotal + laborSubtotal,
    tax: taxInfo.taxAmount,
    taxRate: taxInfo.taxRate,
    profit: profitAmount,
    profitMargin: margin,
    total: materialSubtotal + laborSubtotal + profitAmount + taxInfo.taxAmount,
    depositRequired: (materialSubtotal + laborSubtotal + profitAmount + taxInfo.taxAmount) * 0.33
  };
  
  // 5. Generar descripción del proyecto
  const projectDescription = await generateProjectDescription(
    projectDetails,
    researchResults,
    pricedMaterials,
    laborCosts
  );
  
  // 6. Generar términos y condiciones personalizados
  const termsAndConditions = await generateCustomTerms(
    contractorInfo,
    projectDetails.projectType,
    projectDetails.location
  );
  
  // 7. Compilar estimado completo
  return {
    estimateId: generateUniqueId(),
    clientInfo,
    contractorInfo,
    projectDetails,
    materials: pricedMaterials,
    labor: laborCosts,
    financialSummary,
    projectDescription,
    termsAndConditions,
    createdAt: new Date(),
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Válido 30 días
    notes: contractorInfo.defaultNotes || ""
  };
}
```

## Fuentes de Datos e Integraciones

### 1. Fuentes para Códigos y Regulaciones
- **ICC (International Code Council)**: API para acceder a códigos de construcción
- **Municode**: Ordenanzas municipales por ciudad/condado
- **HUD Database**: Regulaciones federales y estatales
- **UpCodes**: Base de datos actualizada de códigos de construcción

### 2. Fuentes de Precios para Materiales
- **Home Depot API**: Precios y disponibilidad en tiempo real
- **Lowe's API**: Alternativa para precios de materiales
- **Specialty Distributors**: APIs para materiales específicos
- **Price Scraping Engine**: Sistema de scraping ético para precios públicos
- **Internal Price Database**: Base datos histórica de precios como fallback

### 3. Integraciones de Precios Regionales de Labor
- **ZipRecruiter API**: Tarifas laborales promedio por región
- **Bureau of Labor Statistics**: Datos oficiales de tarifas por industria
- **Industry Associations**: Datos específicos por asociaciones de contratistas
- **Proprietary Survey Data**: Base de datos propietaria basada en encuestas

## Optimizaciones Técnicas del DeepSearch

### 1. Paralelización de Consultas
- Múltiples consultas simultáneas a diferentes fuentes
- Timeouts inteligentes para evitar bloqueos
- Failover automático a fuentes alternativas

### 2. Estrategia de Caché Regionalizada
- Caché de códigos de construcción por región (TTL: 30 días)
- Caché de precios de materiales (TTL: 24 horas)
- Caché de prácticas de instalación (TTL: 60 días)

### 3. Procesamiento Asíncrono
- Pre-carga de datos probables durante primeras interacciones
- Actualización continua de datos mientras el usuario completa formulario
- Generación anticipada de componentes del PDF

## Implementación Técnica del DeepSearch

### API Gateway para Investigación
```typescript
// Ejemplo de endpoint para iniciar investigación profunda
app.post('/api/research', async (req, res) => {
  const taskId = uuidv4();
  
  // Iniciar proceso asíncrono
  researchQueue.add({
    taskId,
    request: req.body,
    userId: req.user.id,
    priority: req.body.urgent ? 'high' : 'normal'
  });
  
  // Responder inmediatamente con ID de tarea
  res.json({ 
    taskId, 
    estimatedCompletionTime: req.body.urgent ? 30 : 60 // segundos
  });
});

// Endpoint para consultar resultado de investigación
app.get('/api/research/:taskId', async (req, res) => {
  const result = await redisClient.get(`research:${req.params.taskId}`);
  
  if (!result) {
    const jobStatus = await researchQueue.getJob(req.params.taskId);
    return res.json({
      status: jobStatus ? jobStatus.status : 'not_found',
      progress: jobStatus ? jobStatus.progress : 0
    });
  }
  
  res.json({
    status: 'completed',
    result: JSON.parse(result)
  });
});
```

### Servicios de Workers para Procesamiento
```typescript
// Procesamiento de cola de investigación
researchQueue.process(async (job) => {
  const { taskId, request } = job.data;
  
  try {
    // Actualizar progreso
    job.progress(10);
    
    // 1. Investigar códigos de construcción
    const buildingCodes = await investigateBuildingCodes(request);
    job.progress(30);
    
    // 2. Investigar prácticas de instalación
    const installationPractices = await investigateInstallationPractices(request);
    job.progress(50);
    
    // 3. Obtener precios de materiales
    const materialPricing = await fetchMaterialPricing(request);
    job.progress(70);
    
    // 4. Investigar tarifas laborales regionales
    const laborRates = await investigateLaborRates(request);
    job.progress(90);
    
    // Compilar resultados
    const result = {
      buildingCodes,
      installationPractices,
      materialPricing,
      laborRates,
      timestamp: new Date()
    };
    
    // Guardar en caché
    await redisClient.set(
      `research:${taskId}`,
      JSON.stringify(result),
      'EX',
      60 * 60 * 24 // Caché por 24 horas
    );
    
    job.progress(100);
    return result;
  } catch (error) {
    console.error(`Error processing research job ${taskId}:`, error);
    throw error;
  }
});
```

## Extensibilidad del Sistema DeepSearch

El sistema está diseñado para expandirse fácilmente a nuevas industrias:

```typescript
// Registro de nuevas industrias
interface IndustryDefinition {
  id: string;                // Identificador único
  name: string;              // Nombre para mostrar
  researchEndpoints: {       // Endpoints específicos para investigación
    buildingCodes: string;
    installationPractices: string;
    materialSources: string[];
    laborRatesSources: string[];
  };
  calculationModels: {       // Modelos de cálculo específicos
    materials: string;       // Referencia a función de cálculo
    labor: string;
    pricing: string;
  };
  documentTemplates: {       // Plantillas para documentos
    estimate: string;
    contract: string;
    invoice: string;
  };
}

// Ejemplo de registro de industria de carpintería
registerIndustry({
  id: "carpentry",
  name: "Carpentry Services",
  researchEndpoints: {
    buildingCodes: "/api/research/building-codes/carpentry",
    installationPractices: "/api/research/practices/carpentry",
    materialSources: [
      "/api/materials/wood",
      "/api/materials/hardware"
    ],
    laborRatesSources: [
      "/api/labor/carpentry",
      "/api/labor/general-construction"
    ]
  },
  calculationModels: {
    materials: "calculators.carpentry.materials",
    labor: "calculators.carpentry.labor",
    pricing: "calculators.carpentry.pricing"
  },
  documentTemplates: {
    estimate: "templates/carpentry/estimate.html",
    contract: "templates/carpentry/contract.html",
    invoice: "templates/carpentry/invoice.html"
  }
});
```

## Conclusión y Ventajas Competitivas

El Motor DeepSearch Multi-IA proporciona ventajas decisivas:

1. **Elimina la necesidad de bases de datos exhaustivas** al investigar en tiempo real
2. **Genera estimados ultra precisos** basados en condiciones actuales del mercado
3. **Se adapta automáticamente a cualquier región** y sus regulaciones específicas
4. **Mantiene precios actualizados constantemente** sin intervención manual
5. **Proporciona justificaciones detalladas** para cada aspecto del estimado

Este enfoque revolucionario supera definitivamente a cualquier sistema tradicional de estimación, ya que no depende de datos estáticos o reglas pre-programadas, sino que activamente investiga cada proyecto como lo haría un experto humano, pero en cuestión de segundos.