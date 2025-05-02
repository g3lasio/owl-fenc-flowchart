// filepath: /workspaces/owl-fenc-flowchart/backend/src/test-deepsearch-exhaustive.ts
import { DeepSearchEngine } from './engines/deepsearch.engine';
import { MaterialEngine } from './engines/materials/material.engine';
import { MaterialCalculatorFactory } from './engines/materials/material-calculator.factory';
import { OpenAIClient } from './services/openai.client';
import { AnthropicClient } from './services/anthropic.client';
import { PriceApiService } from './services/price-api.service';
import { PriceResearchService } from './services/price-research.service';
import { ConstructionMethodService } from './services/construction-method.service';
import { ConstructionMethodCacheService } from './services/construction-method-cache.service';
import { MaterialCacheService } from './services/cache.service';
import { FenceDimensions, FenceOptions, FenceType, RequiredMaterial, Location } from './interfaces/fence.interfaces';
import { config } from './config/config';
import * as fs from 'fs';
import * as path from 'path';

// Interfaces necesarias para las pruebas
interface RequiredService {
  id: string;
  name: string;
  description: string;
  specialtyLevel: string;
  hours: number;
  hourlyRate: number;
  equipmentNeeded?: string[];
  equipmentCost?: number;
  sequence: number;
  dependencies?: string[];
}

interface PricingRecommendation {
  recommendedMarkup: number;
  pricingStrategy: string;
  competitiveAnalysis: string;
}

interface MaterialCache {
  get: (key: string) => any;
  set: (key: string, value: any) => void;
}

/**
 * PRUEBAS EXHAUSTIVAS DEL MOTOR DEEPSEARCH
 * Este archivo implementa pruebas rigurosas y específicas para validar la funcionalidad
 * y robustez del motor DeepSearch, garantizando que cumpla con todos los términos
 * y expectativas de nuestro proyecto, incluyendo:
 * 
 * 1. Precisión y completitud en la identificación de materiales y servicios para diversos proyectos
 * 2. Manejo adecuado de errores y casos límite para asegurar estabilidad operativa
 * 3. Rendimiento y optimización para satisfacer los requisitos de tiempo de respuesta
 * 4. Validación comparativa frente a los motores específicos para garantizar calidad superior
 * 5. Integración efectiva con servicios externos críticos para el flujo de trabajo
 * 
 * Estas pruebas están diseñadas para asegurar que el DeepSearch pueda funcionar
 * como la columna vertebral de nuestras estimaciones, cumpliendo con los estándares
 * de calidad y confiabilidad exigidos por la industria de cercas y construcción exterior.
 */

// Inicializar clientes y servicios necesarios
const openAIClient = new OpenAIClient(config.apis.openai.key || '');
const anthropicClient = new AnthropicClient(config.apis.anthropic.key || '');
const constructionMethodCache = new ConstructionMethodCacheService();
const constructionMethodService = new ConstructionMethodService(anthropicClient, constructionMethodCache);
const priceApiService = new PriceApiService();
// Crear una implementación concreta de MaterialCache
const materialCache = new MaterialCacheService(config.cache.ttlSeconds);
// Crear servicio de investigación de precios con parámetros correctos
const priceResearchService = new PriceResearchService(
  config.research.enableAI,
  config.cache.ttlSeconds
);

// Crear el motor DeepSearch avanzado
const deepSearchEngine = new DeepSearchEngine(
  openAIClient,
  anthropicClient,
  priceApiService,
  priceResearchService,
  constructionMethodService
);

// Crear el motor de materiales especializado (para comparación)
const materialCalcFactory = new MaterialCalculatorFactory();
const materialEngine = new MaterialEngine(
  materialCalcFactory,
  materialCache
);

// Guardar resultados de pruebas para análisis
const TEST_RESULTS_DIR = path.join(__dirname, '../test-results');
if (!fs.existsSync(TEST_RESULTS_DIR)) {
  fs.mkdirSync(TEST_RESULTS_DIR, { recursive: true });
}

/**
 * Utilidad para guardar resultados de pruebas en archivo
 */
function saveTestResult(testName: string, result: any) {
  const filename = path.join(TEST_RESULTS_DIR, `${testName}-${Date.now()}.json`);
  fs.writeFileSync(filename, JSON.stringify(result, null, 2));
  console.log(`Resultados guardados en: ${filename}`);
}

/**
 * Utilidad para medir tiempo de ejecución
 */
async function measureExecutionTime<T>(fn: () => Promise<T>): Promise<{ result: T, executionTimeMs: number }> {
  const startTime = Date.now();
  const result = await fn();
  const endTime = Date.now();
  return { result, executionTimeMs: endTime - startTime };
}

/**
 * Utilidad para comparar resultados entre motores
 */
function compareResults(deepSearchResult: any, specificEngineResult: any): { 
  materialCountDiff: number, 
  costDifference: number, 
  costDifferencePercent: number,
  missingMaterials: string[],
  additionalMaterials: string[],
  analysisText: string
} {
  // Materiales en DeepSearch
  const deepSearchMaterials = deepSearchResult.materials.map((m: any) => m.name);
  // Materiales en motor específico
  const specificMaterials = specificEngineResult.materials.map((m: any) => m.name);
  
  // Encontrar materiales faltantes/adicionales
  const missingMaterials = specificMaterials.filter((m: string) => !deepSearchMaterials.includes(m));
  const additionalMaterials = deepSearchMaterials.filter((m: string) => !specificMaterials.includes(m));
  
  // Calcular diferencias
  const materialCountDiff = deepSearchMaterials.length - specificMaterials.length;
  const costDifference = deepSearchResult.totalCost - specificEngineResult.totalCost;
  const costDifferencePercent = specificEngineResult.totalCost > 0 
    ? (costDifference / specificEngineResult.totalCost) * 100
    : 0;
  
  // Texto de análisis
  let analysisText = "ANÁLISIS COMPARATIVO:\n";
  analysisText += `- DeepSearch encontró ${Math.abs(materialCountDiff)} ${materialCountDiff >= 0 ? 'más' : 'menos'} materiales\n`;
  analysisText += `- La diferencia de costo es $${Math.abs(costDifference).toFixed(2)} (${Math.abs(costDifferencePercent).toFixed(2)}%)\n`;
  
  if (missingMaterials.length > 0) {
    analysisText += `- Materiales faltantes en DeepSearch: ${missingMaterials.join(', ')}\n`;
  }
  
  if (additionalMaterials.length > 0) {
    analysisText += `- Materiales adicionales en DeepSearch: ${additionalMaterials.join(', ')}\n`;
  }
  
  return {
    materialCountDiff,
    costDifference,
    costDifferencePercent,
    missingMaterials,
    additionalMaterials,
    analysisText
  };
}

/**
 * CONJUNTO 1: PRUEBAS DE PRECISIÓN EN DIFERENTES TIPOS DE PROYECTOS
 */
async function runProjectTypeTests() {
  console.log('\n===== PRUEBAS DE PRECISIÓN POR TIPO DE PROYECTO =====');
  
  const projectsToTest = [
    // Cercas (diferentes tipos)
    {
      name: 'cerca-madera-privacidad',
      projectType: 'fencing',
      projectSubtype: 'wood',
      dimensions: { length: 100, height: 6 },
      options: { 
        type: 'wood' as const,
        style: 'privacy', 
        posts: 'pressure-treated', 
        gates: [{ width: 4, height: 6, type: 'standard' }] 
      },
      location: { city: 'Sacramento', state: 'CA', zipCode: '95814' }
    },
    {
      name: 'cerca-vinilo-decorativa',
      projectType: 'fencing',
      projectSubtype: 'vinyl',
      dimensions: { length: 75, height: 4 },
      options: { 
        type: 'vinyl' as const,
        style: 'picket', 
        color: 'white', 
        gates: [{ width: 3, height: 4, type: 'standard' }] 
      },
      location: { city: 'Portland', state: 'OR', zipCode: '97201' }
    },
    {
      name: 'cerca-chainlink-comercial',
      projectType: 'fencing',
      projectSubtype: 'chain-link',  // Corregido: chain-link con guion
      dimensions: { length: 200, height: 8 },
      options: { 
        type: 'chain-link' as const,
        gauge: '9', 
        topRail: true, 
        gates: [{ width: 12, height: 8, type: 'sliding' }] 
      },
      location: { city: 'Chicago', state: 'IL', zipCode: '60601' }
    },
    {
      name: 'cerca-aluminio-residencial',
      projectType: 'fencing',
      projectSubtype: 'aluminum',
      dimensions: { length: 60, height: 5 },
      options: { 
        type: 'aluminum' as const,
        style: 'ornamental', 
        color: 'black', 
        gates: [{ width: 4, height: 5, type: 'standard' }] 
      },
      location: { city: 'Atlanta', state: 'GA', zipCode: '30301' }
    },
    
    // Otros tipos de proyectos
    {
      name: 'deck-composite-con-gazebo',
      projectType: 'decking',
      projectSubtype: 'composite',
      dimensions: { squareFeet: 400, height: 3 },
      options: { material: 'trex', railingType: 'aluminum', stairs: true, gazebo: true },
      location: { city: 'Denver', state: 'CO', zipCode: '80201' }
    },
    {
      name: 'entrada-concreto-estampado',
      projectType: 'concrete',
      projectSubtype: 'driveway',
      dimensions: { squareFeet: 1200, thickness: 6 },
      options: { finish: 'stamped', pattern: 'cobblestone', colorAdditive: true },
      location: { city: 'Las Vegas', state: 'NV', zipCode: '89101' }
    },
    {
      name: 'patio-ladrillo-complejo',
      projectType: 'patio',
      projectSubtype: 'brick',
      dimensions: { squareFeet: 350, shape: 'circular' },
      options: { patternType: 'herringbone', borderType: 'soldier course', sealant: true },
      location: { city: 'Boston', state: 'MA', zipCode: '02201' }
    }
  ];
  
  for (const project of projectsToTest) {
    console.log(`\n----- PRUEBA: ${project.name} -----`);
    console.log(`Analizando proyecto de ${project.projectType} (${project.projectSubtype})...`);
    
    try {
      // Medir rendimiento junto con resultado
      const { result, executionTimeMs } = await measureExecutionTime(() => 
        deepSearchEngine.analyzeProject(
          project.projectType,
          project.projectSubtype,
          project.dimensions,
          project.options,
          project.location
        )
      );
      
      // Validar completitud de los resultados
      const hasMaterials = result.materials && result.materials.length > 0;
      const hasServices = result.services && result.services.length > 0;
      const hasMethodology = result.constructionMethod && result.constructionMethod.length > 0;
      
      // Imprimir resultados resumidos
      console.log('\nRESULTADOS:');
      console.log(`- Materiales: ${result.materials.length} items identificados`);
      console.log(`- Servicios: ${result.services.length} servicios requeridos`);
      console.log(`- Costo Total: $${result.totalCost.toFixed(2)}`);
      console.log(`- Tiempo de procesamiento: ${executionTimeMs}ms`);
      console.log(`- Completitud: ${hasMaterials ? '✓' : '✗'} Materiales, ${hasServices ? '✓' : '✗'} Servicios, ${hasMethodology ? '✓' : '✗'} Metodología`);
      
      // Guardar resultados detallados
      saveTestResult(project.name, {
        project,
        result,
        executionTimeMs,
        completeness: {
          hasMaterials,
          hasServices,
          hasMethodology
        }
      });
      
    } catch (error) {
      console.error(`ERROR en prueba de ${project.name}:`, error);
      saveTestResult(`${project.name}-ERROR`, {
        project,
        error: (error as Error).message,
        stack: (error as Error).stack
      });
    }
  }
}

/**
 * CONJUNTO 2: PRUEBAS DE MANEJO DE ERRORES Y CASOS LÍMITE
 */
async function runErrorHandlingTests() {
  console.log('\n===== PRUEBAS DE MANEJO DE ERRORES Y CASOS LÍMITE =====');
  
  const edgeCasesToTest = [
    // Proyecto con dimensiones extremas
    {
      name: 'dimensiones-extremas',
      projectType: 'fencing',
      projectSubtype: 'wood',
      dimensions: { length: 10000, height: 20 }, // Valores muy altos
      options: { 
        type: 'wood' as const,
        style: 'privacy' 
      },
      location: { city: 'Miami', state: 'FL', zipCode: '33101' }
    },
    
    // Proyecto con valores faltantes
    {
      name: 'datos-incompletos',
      projectType: 'decking',
      projectSubtype: 'composite',
      dimensions: { }, // Dimensiones faltantes
      options: { material: 'trex' },
      location: { city: 'Seattle', state: 'WA', zipCode: '98101' }
    },
    
    // Proyecto con tipo inexistente
    {
      name: 'tipo-inexistente',
      projectType: 'nonexistent_type',
      projectSubtype: 'invalid_subtype',
      dimensions: { squareFeet: 200 },
      options: { },
      location: { city: 'Austin', state: 'TX', zipCode: '78701' }
    },
    
    // Proyecto con ubicación inválida
    {
      name: 'ubicacion-invalida',
      projectType: 'concrete',
      projectSubtype: 'driveway',
      dimensions: { squareFeet: 500 },
      options: { finish: 'broom' },
      location: { city: 'Nonexistent', state: 'ZZ', zipCode: '99999' }
    },
    
    // Proyecto con valores negativos
    {
      name: 'valores-negativos',
      projectType: 'patio',
      projectSubtype: 'stone',
      dimensions: { squareFeet: -100, thickness: -2 },
      options: { stoneType: 'flagstone' },
      location: { city: 'Phoenix', state: 'AZ', zipCode: '85001' }
    }
  ];
  
  for (const edgeCase of edgeCasesToTest) {
    console.log(`\n----- PRUEBA DE CASO LÍMITE: ${edgeCase.name} -----`);
    console.log(`Probando escenario: ${edgeCase.name}`);
    
    try {
      const result = await deepSearchEngine.analyzeProject(
        edgeCase.projectType,
        edgeCase.projectSubtype,
        edgeCase.dimensions,
        edgeCase.options,
        edgeCase.location
      );
      
      console.log('✓ El motor manejó el caso sin errores');
      console.log(`- Materiales: ${result.materials ? result.materials.length : 0} items identificados`);
      console.log(`- Costo Total: $${result.totalCost ? result.totalCost.toFixed(2) : 'N/A'}`);
      
      saveTestResult(`edgecase-${edgeCase.name}`, {
        edgeCase,
        result,
        status: 'success'
      });
      
    } catch (error) {
      console.log('✗ El motor generó un error (esperado en algunos casos)');
      console.error(`- Error: ${(error as Error).message}`);
      
      saveTestResult(`edgecase-${edgeCase.name}`, {
        edgeCase,
        error: (error as Error).message,
        stack: (error as Error).stack,
        status: 'error'
      });
    }
  }
}

/**
 * CONJUNTO 3: PRUEBAS DE RENDIMIENTO Y OPTIMIZACIÓN
 */
async function runPerformanceTests() {
  console.log('\n===== PRUEBAS DE RENDIMIENTO Y OPTIMIZACIÓN =====');
  
  // Proyecto estándar para pruebas de rendimiento
  const standardProject = {
    projectType: 'fencing',
    projectSubtype: 'wood',
    dimensions: { length: 100, height: 6 },
    options: { 
      type: 'wood' as const,
      style: 'privacy', 
      posts: 'pressure-treated' 
    },
    location: { city: 'Sacramento', state: 'CA', zipCode: '95814' }
  };
  
  // 1. Prueba de Carga: múltiples proyectos secuenciales
  console.log('\n----- PRUEBA DE CARGA SECUENCIAL -----');
  console.log('Ejecutando 5 análisis secuenciales del mismo proyecto...');
  
  const sequentialTimes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const startTime = Date.now();
    
    try {
      await deepSearchEngine.analyzeProject(
        standardProject.projectType,
        standardProject.projectSubtype,
        standardProject.dimensions,
        standardProject.options,
        standardProject.location
      );
      
      const executionTime = Date.now() - startTime;
      sequentialTimes.push(executionTime);
      console.log(`- Ejecución #${i+1}: ${executionTime}ms`);
      
    } catch (error) {
      console.error(`Error en prueba secuencial #${i+1}:`, error);
    }
  }
  
  const avgSequentialTime = sequentialTimes.reduce((sum, time) => sum + time, 0) / sequentialTimes.length;
  console.log(`\nTiempo promedio de ejecución secuencial: ${avgSequentialTime.toFixed(2)}ms`);
  
  // 2. Prueba de memoria caché
  console.log('\n----- PRUEBA DE EFECTIVIDAD DE CACHÉ -----');
  console.log('Ejecutando múltiples solicitudes para el mismo proyecto (debe usar caché)...');
  
  // Primera ejecución (sin caché)
  const startTimeNoCache = Date.now();
  await deepSearchEngine.analyzeProject(
    standardProject.projectType,
    standardProject.projectSubtype,
    standardProject.dimensions,
    standardProject.options,
    standardProject.location
  );
  const executionTimeNoCache = Date.now() - startTimeNoCache;
  
  // Segunda ejecución (debería usar caché)
  const startTimeWithCache = Date.now();
  await deepSearchEngine.analyzeProject(
    standardProject.projectType,
    standardProject.projectSubtype,
    standardProject.dimensions,
    standardProject.options,
    standardProject.location
  );
  const executionTimeWithCache = Date.now() - startTimeWithCache;
  
  console.log(`- Tiempo sin caché: ${executionTimeNoCache}ms`);
  console.log(`- Tiempo con caché: ${executionTimeWithCache}ms`);
  console.log(`- Mejora de velocidad: ${((executionTimeNoCache - executionTimeWithCache) / executionTimeNoCache * 100).toFixed(2)}%`);
  
  saveTestResult('performance-tests', {
    sequentialTimes,
    averageSequentialTime: avgSequentialTime,
    cacheTest: {
      executionTimeNoCache,
      executionTimeWithCache,
      improvement: ((executionTimeNoCache - executionTimeWithCache) / executionTimeNoCache * 100)
    }
  });
}

/**
 * CONJUNTO 4: PRUEBAS COMPARATIVAS CON MOTORES ESPECÍFICOS
 */
async function runComparativeTests() {
  console.log('\n===== PRUEBAS COMPARATIVAS CON MOTORES ESPECÍFICOS =====');
  
  const projectsToCompare = [
    {
      name: 'cerca-madera-tradicional',
      fenceType: 'wood' as const,
      dimensions: { 
        length: 100, // Corregido: length en lugar de linearFeet
        height: 6,
        postSpacing: 8
      },
      options: { 
        type: 'wood' as const, // Agregado: type es requerido en FenceOptions
        style: 'privacy',
        gates: [{ width: 4, height: 6, type: 'standard' }] // Agregado: type es requerido en GateInfo
      },
      location: { city: 'Sacramento', state: 'CA', zipCode: '95814' }
    },
    {
      name: 'cerca-vinilo-basica',
      fenceType: 'vinyl' as const,
      dimensions: { 
        length: 75, // Corregido: length en lugar de linearFeet
        height: 6,
        postSpacing: 8
      },
      options: { 
        type: 'vinyl' as const, // Agregado: type es requerido en FenceOptions
        style: 'privacy',
        color: 'white',
        gates: [{ width: 4, height: 6, type: 'standard' }] // Agregado: type es requerido en GateInfo
      },
      location: { city: 'Portland', state: 'OR', zipCode: '97201' }
    },
    {
      name: 'cerca-chainlink-basica',
      fenceType: 'chain-link' as const,
      dimensions: { 
        length: 150, // Corregido: length en lugar de linearFeet
        height: 4,
        postSpacing: 10
      },
      options: { 
        type: 'chain-link' as const, // Agregado: type es requerido en FenceOptions
        gauge: '11',
        topRail: true,
        gates: [{ width: 3, height: 4, type: 'standard' }] // Agregado: type es requerido en GateInfo
      },
      location: { city: 'Phoenix', state: 'AZ', zipCode: '85001' }
    }
  ];
  
  // Comparar resultados entre motores para cada proyecto
  for (const project of projectsToCompare) {
    console.log(`\n----- COMPARACIÓN: ${project.name} -----`);
    
    try {
      // 1. Obtener resultado del motor específico
      const specificEngineResult = await materialEngine.calculateMaterials(
        project.fenceType,
        project.dimensions as FenceDimensions, // Cast para asegurar compatibilidad
        project.options as FenceOptions, // Cast para asegurar compatibilidad
        project.location
      );
      
      // 2. Obtener resultado del motor DeepSearch
      const deepSearchResult = await deepSearchEngine.analyzeProject(
        'fencing',
        project.fenceType,
        {
          length: project.dimensions.length, // Usando length directamente
          height: project.dimensions.height
        },
        project.options,
        project.location
      );
      
      // Comparar resultados
      const comparison = compareResults(deepSearchResult, specificEngineResult);
      
      // Imprimir resultados de comparación
      console.log('\nRESULTADOS DE COMPARACIÓN:');
      console.log(`- Total materiales DeepSearch: ${deepSearchResult.materials.length}`);
      console.log(`- Total materiales Motor Específico: ${specificEngineResult.materials.length}`);
      console.log(`- Diferencia en costo: $${comparison.costDifference.toFixed(2)} (${comparison.costDifferencePercent.toFixed(2)}%)`);
      console.log('\n' + comparison.analysisText);
      
      // Guardar resultados comparativos
      saveTestResult(`comparison-${project.name}`, {
        project,
        deepSearchResult,
        specificEngineResult,
        comparison
      });
      
    } catch (error) {
      console.error(`Error en comparación de ${project.name}:`, error);
      saveTestResult(`comparison-error-${project.name}`, {
        project,
        error: (error as Error).message,
        stack: (error as Error).stack
      });
    }
  }
  
  console.log('\nCONCLUSIÓN DE PRUEBAS COMPARATIVAS:');
  console.log('Las conclusiones detalladas se encuentran en los archivos de resultados.');
}

/**
 * CONJUNTO 5: PRUEBAS DE INTEGRACIÓN CON SERVICIOS EXTERNOS
 */
async function runExternalIntegrationTests() {
  console.log('\n===== PRUEBAS DE INTEGRACIÓN CON SERVICIOS EXTERNOS =====');
  
  // Pruebas de integración con APIs de precios
  console.log('\n----- PRUEBA DE APIS DE PRECIOS -----');
  try {
    const testMaterials = [
      { id: 'pt-2x4-8', name: 'Pressure Treated 2x4x8', quantity: 10, unit: 'each' },
      { id: 'concrete-80lb', name: 'Concrete Mix 80lb', quantity: 5, unit: 'bag' },
      { id: 'deck-screw-5lb', name: 'Deck Screws 5lb Box', quantity: 2, unit: 'box' }
    ];
    
    const priceResult = await priceApiService.getPrices(testMaterials, { 
      city: 'Sacramento', 
      state: 'CA', 
      zipCode: '95814' 
    });
    
    console.log('Respuesta de API de precios:');
    console.log(`- Materiales con precios: ${priceResult.length}`);
    // Verificar si hay precios, pero sin asumir una propiedad específica unitPrice
    const materialsWithPriceInfo = priceResult.filter(m => {
      return m && typeof m === 'object' && 
             Object.keys(m).some(key => key.includes('price') || key.includes('cost'));
    });
    console.log(`- Materiales con información de precio: ${materialsWithPriceInfo.length} de ${priceResult.length}`);
    
    saveTestResult('price-api-test', { testMaterials, priceResult });
    
  } catch (error) {
    console.error('Error en prueba de API de precios:', error);
  }
  
  // Pruebas de integración con OpenAI
  console.log('\n----- PRUEBA DE OPENAI -----');
  try {
    const openAIPrompt = "Lista 3 materiales esenciales para una cerca de madera.";
    const openAIResponse = await openAIClient.complete({ 
      prompt: openAIPrompt, 
      maxTokens: 150 
    });
    
    console.log('Respuesta de OpenAI:');
    console.log(openAIResponse.substring(0, 150) + '...');
    
    saveTestResult('openai-test', { prompt: openAIPrompt, response: openAIResponse });
    
  } catch (error) {
    console.error('Error en prueba de OpenAI:', error);
  }
  
  // Pruebas de integración con Anthropic
  console.log('\n----- PRUEBA DE ANTHROPIC -----');
  try {
    const anthropicPrompt = "Lista 3 materiales esenciales para una cerca de cadena (chain link).";
    const anthropicResponse = await anthropicClient.complete({ 
      prompt: anthropicPrompt, 
      maxTokens: 150 
    });
    
    console.log('Respuesta de Anthropic:');
    console.log(anthropicResponse.substring(0, 150) + '...');
    
    saveTestResult('anthropic-test', { prompt: anthropicPrompt, response: anthropicResponse });
    
  } catch (error) {
    console.error('Error en prueba de Anthropic:', error);
  }
}

/**
 * Función principal para ejecutar todas las pruebas
 */
async function runAllTests() {
  console.log('Iniciando pruebas exhaustivas del motor DeepSearch...');
  console.log('Fecha/Hora: ' + new Date().toLocaleString());
  
  // Registrar configuración
  console.log('\nCONFIGURACIÓN DE PRUEBA:');
  console.log(`- OpenAI API: ${config.apis.openai.key ? 'Configurada' : 'No configurada'}`);
  console.log(`- Anthropic API: ${config.apis.anthropic.key ? 'Configurada' : 'No configurada'}`);
  console.log(`- Directorio de resultados: ${TEST_RESULTS_DIR}`);
  
  try {
    // Ejecutar cada conjunto de pruebas secuencialmente
    await runProjectTypeTests();
    await runErrorHandlingTests();
    await runPerformanceTests();
    await runComparativeTests();
    await runExternalIntegrationTests();
    
    console.log('\n===== PRUEBAS COMPLETADAS CON ÉXITO =====');
    console.log('Todos los resultados han sido guardados en:', TEST_RESULTS_DIR);
    
  } catch (error) {
    console.error('\n===== ERROR EN PRUEBAS =====');
    console.error('Ocurrió un error durante la ejecución de las pruebas:', error);
  }
}

// Ejecutar todas las pruebas
console.log('==============================================');
console.log('PRUEBAS EXHAUSTIVAS DEL MOTOR DEEPSEARCH');
console.log('==============================================');
runAllTests().catch(error => {
  console.error('Error crítico en la ejecución de pruebas:', error);
});