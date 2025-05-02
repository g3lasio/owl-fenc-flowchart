import { FlowManagerEngine } from '../engines/flow-manager.engine';
import { OpenAIClient } from '../services/openai.client';
import { AnthropicClient } from '../services/anthropic.client';
import { PriceApiService } from '../services/price-api.service';
import { PriceResearchService } from '../services/price-research.service';
import { ConstructionMethodService } from '../services/construction-method.service';
import { ConstructionMethodCacheService } from '../services/construction-method-cache.service';
import { ApiUsageService } from '../services/api-usage.service';
import { config } from '../config/config';

/**
 * Este archivo demuestra el uso del Motor Gestor de Flujo para coordinar
 * el proceso completo de generación de estimados, ya sea en modo manual
 * o en modo chat (Mervin).
 */

async function runFlowManagerExamples() {
  console.log('===== DEMOSTRACIÓN DEL MOTOR GESTOR DE FLUJO =====');

  // Inicializar los servicios necesarios
  const openAIClient = new OpenAIClient(config.openai.apiKey);
  const anthropicClient = new AnthropicClient(config.anthropic.apiKey);
  const constructionMethodCache = new ConstructionMethodCacheService();
  const constructionMethodService = new ConstructionMethodService(anthropicClient, constructionMethodCache);
  const priceApiService = new PriceApiService();
  const priceResearchService = new PriceResearchService(openAIClient);
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

  // ===== EJEMPLO 1: MODO MANUAL =====
  console.log('\n----- EJEMPLO 1: FLUJO MANUAL DE ESTIMADO -----');
  await demoManualFlow(flowManager);

  // ===== EJEMPLO 2: MODO CHAT (MERVIN) =====
  console.log('\n----- EJEMPLO 2: FLUJO CONVERSACIONAL CON MERVIN -----');
  await demoChatFlow(flowManager);
}

async function demoManualFlow(flowManager: FlowManagerEngine) {
  console.log('Iniciando proceso de estimado en modo manual...');

  // Paso 1: Iniciar el proceso de estimado
  const startResult = await flowManager.startEstimateProcess('manual');
  console.log(`Sesión iniciada: ${startResult.sessionId}`);
  console.log(`Siguiente paso: ${startResult.nextStep}`);

  // Paso 2: Proporcionar información del cliente
  const clientInfo = {
    name: 'Juan Pérez',
    email: 'juan@example.com',
    phone: '555-123-4567',
    address: {
      street: '123 Calle Principal',
      city: 'Vacaville',
      state: 'CA',
      zipCode: '95688'
    }
  };

  const clientResult = await flowManager.processClientData(
    startResult.sessionId,
    clientInfo,
    'new'
  );
  console.log(`Cliente procesado, siguiente paso: ${clientResult.nextStep}`);

  // Paso 3: Proporcionar detalles del proyecto
  const projectDetails = {
    type: 'fencing',
    subtype: 'wood',
    material: 'pressure treated wood',
    dimensions: {
      length: 100,  // 100 pies lineales
      height: 6     // 6 pies de altura
    },
    style: 'privacy',
    gates: [
      { width: 4, type: 'standard' }
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
    console.log(`TOTAL: $${projectResult.preliminaryEstimate.total.toFixed(2)}`);
    console.log(`Tiempo estimado: ${projectResult.preliminaryEstimate.timeEstimate.minDays}-${projectResult.preliminaryEstimate.timeEstimate.maxDays} días`);
  }

  // Paso 5: Finalizar el estimado
  console.log('\nFinalizando estimado...');
  
  // Opcionalmente, aplicar ajustes antes de finalizar
  const adjustments = {
    materialAdjustments: [
      { id: 'wood-post', quantity: 15 }  // Ajustar cantidad de postes
    ],
    markupAdjustment: 0.30  // Ajustar margen al 30%
  };

  const finalResult = await flowManager.finalizeEstimate(
    startResult.sessionId,
    adjustments
  );

  console.log('\n==== ESTIMADO FINAL ====');
  console.log(`ID del estimado: ${finalResult.estimateId}`);
  console.log(`Cliente: ${finalResult.clientInfo.name}`);
  console.log(`Resumen del proyecto: ${finalResult.projectSummary}`);
  console.log(`Costo de materiales: $${finalResult.materialCost.toFixed(2)}`);
  console.log(`Costo de mano de obra: $${finalResult.laborCost.toFixed(2)}`);
  console.log(`TOTAL: $${finalResult.totalCost.toFixed(2)}`);
  console.log(`PDF generado: ${finalResult.pdfUrl}`);
  console.log(`Fecha de creación: ${finalResult.createdAt}`);
}

async function demoChatFlow(flowManager: FlowManagerEngine) {
  console.log('Iniciando proceso de estimado en modo chat con Mervin...');

  // Paso 1: Iniciar el proceso de estimado en modo chat
  const startResult = await flowManager.startEstimateProcess('chat');
  console.log(`Sesión de chat iniciada: ${startResult.sessionId}`);

  // Paso 2: Simular una conversación con mensajes del usuario
  const userMessages = [
    "Hola, necesito un estimado para una cerca de madera",
    "La cerca será de 75 pies de largo y 6 pies de altura",
    "Sí, necesito una puerta de 4 pies de ancho",
    "Mi nombre es María González, mi teléfono es 555-987-6543 y mi email es maria@example.com",
    "Mi dirección es 456 Avenida Central, Vacaville, CA 95688",
    "¿Cuánto costaría aproximadamente este proyecto?"
  ];

  // Procesar cada mensaje y mostrar las respuestas
  for (const message of userMessages) {
    console.log(`\nUSUARIO: "${message}"`);
    
    const response = await flowManager.processChatMessage(
      startResult.sessionId,
      message
    );
    
    console.log(`MERVIN: "${response.response}"`);
    
    // Si se requiere alguna acción, mostrarla
    if (response.isActionRequired) {
      console.log(`[Acción requerida: ${response.action}]`);
      
      // Si la acción es generar un estimado, hacerlo
      if (response.action === 'start_estimate') {
        console.log('\nGenerando estimado preliminar basado en la conversación...');
        
        // Aquí se podría llamar a generatePreliminaryEstimate, pero ya está
        // siendo manejado internamente por el motor cuando se detecta información suficiente
      }
      
      // Si la acción es finalizar el estimado, hacerlo
      if (response.action === 'finalize_estimate') {
        console.log('\nFinalizando estimado basado en la conversación...');
        
        const finalResult = await flowManager.finalizeEstimate(startResult.sessionId);
        
        console.log('\n==== ESTIMADO FINAL (GENERADO POR CHAT) ====');
        console.log(`ID del estimado: ${finalResult.estimateId}`);
        console.log(`Cliente: ${finalResult.clientInfo.name}`);
        console.log(`Resumen del proyecto: ${finalResult.projectSummary}`);
        console.log(`Costo de materiales: $${finalResult.materialCost.toFixed(2)}`);
        console.log(`Costo de mano de obra: $${finalResult.laborCost.toFixed(2)}`);
        console.log(`TOTAL: $${finalResult.totalCost.toFixed(2)}`);
        console.log(`PDF generado: ${finalResult.pdfUrl}`);
      }
    }
  }
}

// Ejecutar ejemplos
console.log('Iniciando ejemplos del Motor Gestor de Flujo...');
runFlowManagerExamples().catch(error => {
  console.error('Error en los ejemplos:', error);
});