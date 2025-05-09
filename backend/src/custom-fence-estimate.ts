import { FlowManagerEngine } from './engines/flow-manager.engine';
import { OpenAIClient } from './services/openai.client';
import { AnthropicClient } from './services/anthropic.client';
import { PriceApiService } from './services/price-api.service';
import { PriceResearchService } from './services/price-research.service';
import { ConstructionMethodService } from './services/construction-method.service';
import { ConstructionMethodCacheService } from './services/construction-method-cache.service';
import { ApiUsageService } from './services/api-usage.service';
import { config } from './config/config';

/**
 * Script personalizado para generar un estimado específico para un proyecto de cercado de madera
 * con demolición y retirada de material.
 */
async function generateCustomFenceEstimate() {
  console.log('===== GENERANDO ESTIMADO PERSONALIZADO =====');

  // Inicializar los servicios necesarios
  const openAIClient = new OpenAIClient(config.openai.apiKey);
  const anthropicClient = new AnthropicClient(config.anthropic.apiKey);
  const constructionMethodCache = new ConstructionMethodCacheService();
  const constructionMethodService = new ConstructionMethodService(anthropicClient, constructionMethodCache);
  const priceApiService = new PriceApiService();
  const priceResearchService = new PriceResearchService(true, 86400, openAIClient);
  const apiUsageService = new ApiUsageService();

  // Crear el motor gestor de flujo
  const flowManager = new FlowManagerEngine(
    openAIClient,
    anthropicClient,
    priceApiService,
    priceResearchService,
    constructionMethodService,
    apiUsageService
  );

  console.log('Iniciando proceso de estimado en modo manual...');

  // Paso 1: Iniciar el proceso de estimado
  const startResult = await flowManager.startEstimateProcess('manual');
  console.log(`Sesión iniciada: ${startResult.sessionId}`);
  console.log(`Siguiente paso: ${startResult.nextStep}`);

  // Paso 2: Proporcionar información del cliente
  const clientInfo = {
    name: 'Cliente Demo',
    email: 'cliente@example.com',
    phone: '555-987-6543',
    address: {
      street: '123 Main Street',
      city: 'Richmond',
      state: 'CA',
      zipCode: '94801'
    }
  };

  const clientResult = await flowManager.processClientData(
    startResult.sessionId,
    clientInfo,
    'new'
  );
  console.log(`Cliente procesado, siguiente paso: ${clientResult.nextStep}`);

  // Paso 3: Proporcionar detalles del proyecto
  // Detalles específicos del proyecto solicitado: cercado de madera de 70 pies lineales con demolición
  const projectDetails = {
    type: 'fencing',
    subtype: 'wood',
    material: 'pressure treated wood',
    dimensions: {
      length: 70,  // 70 pies lineales
      height: 6    // 6 pies de altura (estándar)
    },
    style: 'privacy',
    demolition: true, // Incluye demolición
    demolitionDetails: {
      length: 70,  // 70 pies lineales a demoler
      disposal: true  // Incluye retirada de material
    },
    location: {
      city: 'Richmond',
      state: 'CA'
    },
    gates: [
      { width: 4, type: 'standard' }  // Puerta estándar de 4 pies
    ]
  };

  const projectResult = await flowManager.processProjectDetails(
    startResult.sessionId,
    projectDetails
  );
  
  console.log(`Proyecto procesado, siguiente paso: ${projectResult.nextStep}`);
  
  // Paso 4: Si el estimado preliminar está disponible, mostrarlo
  if (projectResult.preliminaryEstimate) {
    console.log('\n==== ESTIMADO PRELIMINAR ====');
    console.log(`Cliente: ${projectResult.preliminaryEstimate.clientName}`);
    console.log(`Proyecto: ${projectResult.preliminaryEstimate.projectType} (${projectResult.preliminaryEstimate.projectSubtype})`);
    console.log(`Costo de materiales: $${projectResult.preliminaryEstimate.materialCost.toFixed(2)}`);
    console.log(`Costo de mano de obra: $${projectResult.preliminaryEstimate.laborCost.toFixed(2)}`);
    
    // Verificar si hay costos de equipamiento (para demolición)
    if (projectResult.preliminaryEstimate.equipmentCost) {
      console.log(`Costo de equipamiento: $${projectResult.preliminaryEstimate.equipmentCost.toFixed(2)}`);
    }
    
    console.log(`TOTAL: $${projectResult.preliminaryEstimate.total.toFixed(2)}`);
    console.log(`Tiempo estimado: ${projectResult.preliminaryEstimate.timeEstimate.minDays}-${projectResult.preliminaryEstimate.timeEstimate.maxDays} días`);
  }

  // Paso 5: Finalizar el estimado
  console.log('\nFinalizando estimado...');

  const finalResult = await flowManager.finalizeEstimate(
    startResult.sessionId
  );

  console.log('\n==== ESTIMADO FINAL ====');
  console.log(`ID del estimado: ${finalResult.estimateId}`);
  console.log(`Cliente: ${finalResult.clientInfo.name}`);
  console.log(`Resumen del proyecto: ${finalResult.projectSummary}`);
  console.log(`Costo de materiales: $${finalResult.materialCost.toFixed(2)}`);
  console.log(`Costo de mano de obra: $${finalResult.laborCost.toFixed(2)}`);
  
  // Verificar si hay costos de equipamiento (para demolición)
  if (finalResult.equipmentCost) {
    console.log(`Costo de equipamiento: $${finalResult.equipmentCost.toFixed(2)}`);
  }
  
  console.log(`TOTAL: $${finalResult.totalCost.toFixed(2)}`);
  console.log(`PDF generado: ${finalResult.pdfUrl}`);
  console.log(`Fecha de creación: ${finalResult.createdAt}`);
  
  return finalResult;
}

// Ejecutar el generador de estimados
console.log('Iniciando generador de estimado personalizado...');
generateCustomFenceEstimate().then(result => {
  console.log('\n===== PROCESO COMPLETADO =====');
  console.log('Un PDF del estimado ha sido generado en:', result.pdfUrl);
  console.log('Para ver este PDF, deberías descargar el archivo desde esta ruta en el servidor.');
}).catch(error => {
  console.error('Error generando el estimado:', error);
});