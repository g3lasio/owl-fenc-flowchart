import { OpenAIClient } from './services/openai.client';
import { AnthropicClient } from './services/anthropic.client';
import { DeepSearchEngine } from './engines/deepsearch.engine';
import { PriceApiService } from './services/price-api.service';
import { PriceResearchService } from './services/price-research.service';
import { ConstructionMethodService } from './services/construction-method.service';
import { ConstructionMethodCacheService } from './services/construction-method-cache.service';
import { ApiUsageService } from './services/api-usage.service';
import { config } from './config/config';
import { PricedMaterial } from './interfaces/fence.interfaces';

/**
 * Prueba de estimado para deck de madera tratada a presión (pressure treated)
 * - Cliente quiere un deck de 100 sqft
 * - Se pide estimado de material y labor
 * - Necesitamos costos unitarios y totales
 */
async function runWoodDeckEstimateTest() {
  try {
    console.log('--------------------------------------------------------------------------');
    console.log('PRUEBA DE ESTIMADO: DECK DE MADERA TRATADA A PRESIÓN (100 SQFT)');
    console.log('--------------------------------------------------------------------------');
    
    // Inicializar servicios
    const apiUsageService = new ApiUsageService();
    const openAIClient = new OpenAIClient(config.openai.apiKey, apiUsageService);
    const anthropicClient = new AnthropicClient(config.anthropic.apiKey, apiUsageService);
    const constructionMethodCache = new ConstructionMethodCacheService();
    const constructionMethodService = new ConstructionMethodService(anthropicClient, constructionMethodCache);
    const priceApiService = new PriceApiService();
    const priceResearchService = new PriceResearchService(true, 86400, openAIClient);
    
    // Crear instancia del motor DeepSearch
    const deepSearchEngine = new DeepSearchEngine(
      openAIClient,
      anthropicClient,
      priceApiService,
      priceResearchService,
      constructionMethodService
    );
    
    // Definir especificaciones del deck
    const projectType = 'decking';
    const projectSubtype = 'wood';
    const dimensions = {
      area: 100, // pies cuadrados
      length: 10, // pies
      width: 10, // pies
      height: 3, // pies (altura del deck desde el suelo)
    };
    const options = {
      material: 'pressure_treated',
      railings: true,
      stairs: true,
      numStairs: 3
    };
    const location = {
      city: 'Los Angeles',
      state: 'California',
      zipCode: '90001'
    };
    
    console.log('Solicitud de estimado:');
    console.log('---------------------');
    console.log(`- Tipo de proyecto: ${projectType}`);
    console.log(`- Subtipo: ${projectSubtype}`);
    console.log(`- Dimensiones: ${JSON.stringify(dimensions)}`);
    console.log(`- Opciones: ${JSON.stringify(options)}`);
    console.log(`- Ubicación: ${location.city}, ${location.state}`);
    console.log('\nGenerando estimado detallado...\n');
    
    // Cronometrar el tiempo de ejecución
    const startTime = new Date().getTime();
    
    // Generar estimado
    const result = await deepSearchEngine.analyzeProject(
      projectType,
      projectSubtype,
      dimensions,
      options,
      location
    );
    
    // Calcular tiempo de ejecución
    const endTime = new Date().getTime();
    const executionTime = (endTime - startTime) / 1000;
    
    // Mostrar resultados formateados
    console.log('RESULTADO DEL ESTIMADO:');
    console.log('======================');
    
    // 1. Resumen general
    console.log('RESUMEN:');
    console.log(`- Costo Total: $${result.totalCost.toFixed(2)}`);
    console.log(`- Precio por Pie Cuadrado: $${result.pricePerUnit.toFixed(2)}`);
    console.log(`- Tiempo estimado de construcción: ${result.timeEstimate || 'No disponible'}`);
    console.log(`- Markup recomendado: ${(result.recommendedMarkup * 100).toFixed(2)}%`);
    
    // 2. Desglose de costos
    console.log('\nDESGLOSE DE COSTOS:');
    console.log(`- Materiales: $${result.materialCost.toFixed(2)}`);
    console.log(`- Mano de obra: $${result.laborCost.toFixed(2)}`);
    console.log(`- Equipo: $${result.equipmentCost.toFixed(2)}`);
    
    // 3. Lista detallada de materiales
    console.log('\nLISTA DE MATERIALES:');
    console.log('-------------------------------------------------------------------------');
    console.log('| Material                   | Cantidad | Unidad   | Precio U. | Total  |');
    console.log('-------------------------------------------------------------------------');
    
    result.materials.forEach((mat: PricedMaterial) => {
      const name = mat.name.padEnd(27);
      const quantity = mat.quantity.toString().padEnd(9);
      const unit = mat.unit.padEnd(9);
      const unitPrice = `$${mat.unitPrice.toFixed(2)}`.padEnd(10);
      const total = `$${mat.totalPrice.toFixed(2)}`;
      
      console.log(`| ${name} | ${quantity} | ${unit} | ${unitPrice} | ${total} |`);
    });
    console.log('-------------------------------------------------------------------------');
    
    // 4. Lista detallada de servicios (mano de obra)
    console.log('\nMANO DE OBRA:');
    console.log('-------------------------------------------------------------------------');
    console.log('| Servicio                   | Horas    | Tarifa    | Total    |');
    console.log('-------------------------------------------------------------------------');
    
    result.services.forEach((serv: any) => {
      const name = serv.name.padEnd(27);
      const hours = serv.hours.toString().padEnd(9);
      const rate = `$${serv.rate.toFixed(2)}`.padEnd(10);
      const total = `$${serv.totalCost.toFixed(2)}`;
      
      console.log(`| ${name} | ${hours} | ${rate} | ${total} |`);
    });
    console.log('-------------------------------------------------------------------------');
    
    // 5. Método de construcción
    console.log('\nMÉTODO DE CONSTRUCCIÓN:');
    console.log(result.constructionMethod || 'No disponible');
    
    // 6. Estadísticas de la prueba
    console.log('\nESTADÍSTICAS:');
    console.log(`- Tiempo de ejecución: ${executionTime.toFixed(2)} segundos`);
    console.log(`- Uso de API: ${apiUsageService.getUsageStats().openai.calls} llamadas a OpenAI, ${apiUsageService.getUsageStats().anthropic.calls} llamadas a Anthropic`);
    console.log('--------------------------------------------------------------------------');
    
  } catch (error) {
    console.error('Error al generar estimado de deck de madera:', error);
  }
}

// Ejecutar la prueba
runWoodDeckEstimateTest()
  .then(() => console.log('Prueba completada'))
  .catch(err => console.error('Error en prueba:', err));