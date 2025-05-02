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
 * Este archivo demuestra las capacidades avanzadas del Motor Gestor de Flujo
 * con la integración del Motor de Consulta Inteligente y el Motor de Aprendizaje Adaptativo
 */

async function runAdvancedFlowManagerExample() {
  console.log('===== DEMOSTRACIÓN DEL MOTOR GESTOR DE FLUJO AVANZADO =====');

  // Inicializar los servicios necesarios
  const openAIClient = new OpenAIClient(config.openai.apiKey);
  const anthropicClient = new AnthropicClient(config.anthropic.apiKey);
  const constructionMethodCache = new ConstructionMethodCacheService();
  const constructionMethodService = new ConstructionMethodService(anthropicClient, constructionMethodCache);
  const priceApiService = new PriceApiService();
  const priceResearchService = new PriceResearchService(openAIClient);
  const apiUsageService = new ApiUsageService();

  // Crear el motor gestor de flujo con ID de contratista específico
  const flowManager = new FlowManagerEngine(
    openAIClient,
    anthropicClient,
    priceApiService,
    priceResearchService,
    constructionMethodService,
    apiUsageService,
    'contractor_abc123' // ID único del contratista para aprendizaje personalizado
  );

  // ===== EJEMPLO 1: FLUJO CON CONSULTA INTELIGENTE Y APRENDIZAJE =====
  console.log('\n----- FLUJO CON CONSULTA INTELIGENTE Y APRENDIZAJE -----');
  
  // PASO 1: Iniciar sesión
  console.log('Iniciando proceso de estimado...');
  const startResult = await flowManager.startEstimateProcess('manual');
  console.log(`Sesión iniciada: ${startResult.sessionId}`);

  // PASO 2: Proporcionar información del cliente
  const clientData = {
    id: 'client_12345',
    name: 'Carlos Rodríguez',
    email: 'carlos@example.com',
    phone: '555-789-1234',
    address: {
      street: '789 Calle del Sol',
      city: 'Miami',
      state: 'FL',
      zipCode: '33101'
    }
  };

  console.log('\nProcesando datos del cliente...');
  const clientResult = await flowManager.processClientData(
    startResult.sessionId,
    clientData,
    'existing' // Cliente existente, útil para aprendizaje adaptativo
  );

  // PASO 3: Proporcionar detalles incompletos del proyecto para demostrar consultas inteligentes
  const incompleteProjectDetails = {
    type: 'roofing', // Tipo de proyecto: techos
    material: 'asphalt shingles', // Material: tejas asfálticas
    dimensions: {
      // Nota: No proporcionamos squareFeet intencionalmente para que
      // el motor de consulta inteligente lo identifique como faltante
    }
  };

  console.log('\nEnviando detalles incompletos del proyecto...');
  const projectResult = await flowManager.processProjectDetails(
    startResult.sessionId,
    incompleteProjectDetails
  );

  console.log(`\nSiguiente paso: ${projectResult.nextStep}`);
  
  // PASO 4: Mostrar las preguntas inteligentes generadas
  if (projectResult.intelligentQuestions && projectResult.intelligentQuestions.length > 0) {
    console.log('\n==== PREGUNTAS INTELIGENTES GENERADAS ====');
    projectResult.intelligentQuestions.forEach((question, index) => {
      console.log(`${index + 1}. ${question}`);
    });
  }
  
  if (projectResult.requiredInfo) {
    console.log('\n==== INFORMACIÓN REQUERIDA ====');
    console.log(projectResult.requiredInfo);
  }

  // PASO 5: Responder a las preguntas inteligentes
  console.log('\nRespondiendo a las preguntas inteligentes...');
  
  const responses = {
    dimensions: {
      squareFeet: 1800 // Proporcionar el área del techo en pies cuadrados
    },
    roofPitch: '6:12', // Inclinación del techo
    existingLayers: 1, // Capas existentes de tejas
    hasSkylights: true, // Tiene claraboyas
    currentDamage: 'leaks in two areas' // Daños actuales
  };

  const additionalInfoResult = await flowManager.processIntelligentQuestionResponse(
    startResult.sessionId,
    responses
  );

  // PASO 6: Verificar si ahora podemos generar un estimado
  if (additionalInfoResult.nextStep === 'review_estimate' && additionalInfoResult.preliminaryEstimate) {
    console.log('\n==== ESTIMADO PRELIMINAR GENERADO ====');
    const estimate = additionalInfoResult.preliminaryEstimate;
    
    console.log(`Proyecto: ${estimate.projectType} (${estimate.projectSubtype})`);
    console.log(`Costo de materiales: $${estimate.materialCost.toFixed(2)}`);
    console.log(`Costo de mano de obra: $${estimate.laborCost.toFixed(2)}`);
    console.log(`TOTAL: $${estimate.total.toFixed(2)}`);
    
    // PASO 7: Finalizar el estimado, lo que también desencadenará el aprendizaje adaptativo
    console.log('\nFinalizando estimado (con aprendizaje adaptativo)...');
    
    const finalEstimate = await flowManager.finalizeEstimate(
      startResult.sessionId,
      {}, // Sin ajustes adicionales
      true, // El cliente aceptó el estimado
      estimate.total // El precio final fue el mismo que el estimado
    );
    
    console.log('\n==== ESTIMADO FINAL ====');
    console.log(`ID: ${finalEstimate.estimateId}`);
    console.log(`Cliente: ${finalEstimate.clientInfo.name}`);
    console.log(`Proyecto: ${finalEstimate.projectSummary}`);
    console.log(`Costo total: $${finalEstimate.totalCost.toFixed(2)}`);
    console.log(`PDF: ${finalEstimate.pdfUrl}`);
  } else {
    console.log('\nTodavía se necesita más información para generar el estimado.');
    console.log('Siguiente paso:', additionalInfoResult.nextStep);
  }

  // EJEMPLO 2: DEMOSTRACIÓN DEL MODO CHAT CON INTELIGENCIA AVANZADA
  console.log('\n\n----- MODO CHAT INTELIGENTE (MERVIN) -----');
  
  // Iniciar una nueva sesión en modo chat
  const chatSession = await flowManager.startEstimateProcess('chat');
  console.log(`Sesión de chat iniciada: ${chatSession.sessionId}`);
  
  // Simular una conversación con preguntas inteligentes
  const userMessages = [
    "Hola, necesito un estimado para reemplazar mi techo",
    "Es un techo de tejas de unos 2000 pies cuadrados aproximadamente",
    "Sí, el techo tiene algunas goteras y tiene unos 15 años",
    "Creo que la pendiente es moderada, no es muy inclinado",
    "Prefiero usar tejas arquitectónicas de buena calidad, que duren mucho tiempo",
    "Sí, tengo dos claraboyas y una chimenea que necesitan sellado nuevo",
    "Mi nombre es Ana Martínez, mi email es ana@example.com y mi teléfono es 555-345-6789",
    "¿Cuánto costaría aproximadamente y cuánto tiempo tomaría?"
  ];
  
  // Procesar cada mensaje del usuario
  for (const [index, message] of userMessages.entries()) {
    console.log(`\nUSUARIO (${index + 1}): "${message}"`);
    
    const chatResponse = await flowManager.processChatMessage(
      chatSession.sessionId,
      message
    );
    
    console.log(`MERVIN: "${chatResponse.response}"`);
    
    // Mostrar preguntas inteligentes generadas por el sistema
    if (chatResponse.intelligentQuestions && chatResponse.intelligentQuestions.length > 0) {
      console.log('\nPreguntas inteligentes que Mervin podría hacer:');
      chatResponse.intelligentQuestions.forEach((question, idx) => {
        console.log(`  ${idx + 1}. ${question}`);
      });
    }
    
    // Si se requiere una acción, mostrarla
    if (chatResponse.isActionRequired) {
      console.log(`\n[Acción requerida: ${chatResponse.action}]`);
      
      if (chatResponse.action === 'finalize_estimate') {
        console.log('\nGenerando estimado final basado en la conversación...');
        
        const finalChatEstimate = await flowManager.finalizeEstimate(
          chatSession.sessionId,
          undefined,
          true // El cliente aceptó
        );
        
        console.log('\n==== ESTIMADO FINAL (GENERADO POR CHAT) ====');
        console.log(`ID: ${finalChatEstimate.estimateId}`);
        console.log(`Cliente: ${finalChatEstimate.clientInfo.name}`);
        console.log(`Proyecto: ${finalChatEstimate.projectSummary}`);
        console.log(`Costo total: $${finalChatEstimate.totalCost.toFixed(2)}`);
      }
    }
  }
  
  // PASO EXTRA: Demostrar cómo el sistema ha aprendido sobre el contratista
  console.log('\n\n----- ANÁLISIS DE APRENDIZAJE DEL CONTRATISTA -----');
  
  // Analizar especialidades y patrones aprendidos (este sería un método adicional a implementar)
  await analyzeContractorLearning(flowManager, 'contractor_abc123');
}

/**
 * Analiza lo que el sistema ha aprendido sobre el contratista
 * Nota: Esta función simula cómo se accedería al conocimiento aprendido
 */
async function analyzeContractorLearning(flowManager: FlowManagerEngine, contractorId: string) {
  // En una implementación real, esta función consultaría el adaptiveLearningEngine
  // y mostraría los patrones aprendidos, preferencias del contratista, etc.
  
  console.log(`Análisis del aprendizaje para el contratista ${contractorId}:`);
  console.log('- Especialidades principales: roofing, siding, gutters');
  console.log('- Materiales preferidos para techos: architectural shingles, metal, tile');
  console.log('- Markup típico para proyectos de techo: 25-30%');
  console.log('- Tiempo promedio de finalización: 3-5 días laborables');
  console.log('- Horario típico de trabajo: Lunes-Viernes, 7:30am - 4:00pm');
  
  console.log('\nPatrones de clientes detectados:');
  console.log('- Los clientes de zonas costeras prefieren materiales resistentes a la humedad');
  console.log('- Clientes comerciales tienden a elegir opciones de mantenimiento reducido');
  console.log('- Alta tasa de aceptación (85%) cuando el estimado incluye financiamiento');
}

// Ejecutar el ejemplo
console.log('Iniciando ejemplo avanzado de Flow Manager...');
runAdvancedFlowManagerExample().catch(error => {
  console.error('Error en el ejemplo:', error);
});