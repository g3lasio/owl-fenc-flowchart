import * as fs from 'fs';
import * as path from 'path';
import { FlowManagerEngine } from '../../src/engines/flow-manager.engine';
import { DeepSearchEngine } from '../../src/engines/deepsearch.engine';
import { IntelligentQueryEngine } from '../../src/engines/intelligent-query.engine';
import { AdaptiveLearningEngine } from '../../src/engines/adaptive-learning.engine';
import { MaterialEngine } from '../../src/engines/materials/material.engine';
import { PersistentCacheService } from '../../src/services/persistent-cache.service';
import { ConstructionMethodService } from '../../src/services/construction-method.service';
import { PriceResearchService } from '../../src/services/price-research.service';

/**
 * Pruebas integrales de los tres motores trabajando juntos.
 * 
 * Este script evalúa de manera exhaustiva el sistema completo probando diferentes
 * escenarios para medir la robustez, consistencia y potencial del sistema.
 */

// Configuración
const RESULTS_DIR = path.join(__dirname, 'results');
const DEBUG = true;

// Crear directorio de resultados si no existe
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// Contratistas de prueba
const testContractors = [
  {
    contractorId: "CTR001",
    contractorName: "Valley Fencing Solutions",
    specialty: "fencing",
    location: "Phoenix, AZ",
    previousEstimates: [
      { id: "EST001", projectType: "wood-fence", markup: 0.35, materials: ["cedar", "pressure-treated"] },
      { id: "EST002", projectType: "chain-link", markup: 0.28, materials: ["galvanized", "vinyl-coated"] },
      { id: "EST003", projectType: "vinyl-fence", markup: 0.40, materials: ["white-vinyl", "privacy"] }
    ]
  },
  {
    contractorId: "CTR002",
    contractorName: "Premier Deck Builders",
    specialty: "decking",
    location: "Seattle, WA",
    previousEstimates: [
      { id: "EST004", projectType: "wood-deck", markup: 0.38, materials: ["redwood", "composite"] },
      { id: "EST005", projectType: "composite-deck", markup: 0.42, materials: ["trex", "timbertech"] },
      { id: "EST006", projectType: "pergola", markup: 0.45, materials: ["cedar", "pressure-treated"] }
    ]
  },
  {
    contractorId: "CTR003",
    contractorName: "Elite Custom Fencing",
    specialty: "fencing",
    location: "Dallas, TX",
    previousEstimates: [
      { id: "EST007", projectType: "iron-fence", markup: 0.50, materials: ["wrought-iron", "powder-coated"] },
      { id: "EST008", projectType: "aluminum-fence", markup: 0.45, materials: ["black-aluminum", "bronze-aluminum"] },
      { id: "EST009", projectType: "wood-fence", markup: 0.38, materials: ["cedar", "treated-pine"] }
    ]
  }
];

// Proyectos de prueba
const testProjects = {
  fencing: [
    {
      id: "PROJ001",
      description: "Cerca de madera estándar",
      details: {
        lengthFt: 100,
        heightFt: 6,
        material: "cedar",
        gateCount: 1,
        postSpacing: 8,
        style: "privacy"
      },
      isComplete: true
    },
    {
      id: "PROJ002",
      description: "Cerca perimetral de eslabones de cadena",
      details: {
        lengthFt: 200,
        material: "chain-link",
        gateCount: 2,
        // Falta la altura - información incompleta
        postSpacing: 10
      },
      isComplete: false,
      missingFields: ["heightFt"]
    },
    {
      id: "PROJ003",
      description: "Cerca ornamental de hierro forjado",
      details: {
        lengthFt: 80,
        heightFt: 5,
        material: "wrought-iron",
        // Falta cantidad de puertas - información incompleta
        style: "ornamental"
      },
      isComplete: false,
      missingFields: ["gateCount"]
    }
  ],
  decking: [
    {
      id: "PROJ004",
      description: "Terraza de madera básica",
      details: {
        lengthFt: 16,
        widthFt: 12,
        material: "pressure-treated",
        railingType: "matching",
        stairs: true,
        stairSteps: 3
      },
      isComplete: true
    },
    {
      id: "PROJ005",
      description: "Terraza de compuesto premium",
      details: {
        lengthFt: 20,
        widthFt: 15,
        material: "trex-transcend",
        // Falta tipo de barandilla - información incompleta
        stairs: true,
        stairSteps: 4
      },
      isComplete: false,
      missingFields: ["railingType"]
    }
  ]
};

// Escenarios de chat (para probar el flujo conversacional)
const chatScenarios = [
  {
    id: "CHAT001",
    description: "Cliente con información completa y clara",
    specialty: "fencing",
    conversation: [
      { role: "user", content: "Necesito un presupuesto para una cerca de madera de cedro de 6 pies de altura y 80 pies de longitud con una puerta." },
      { role: "assistant", content: "..." },
      { role: "user", content: "Quiero que los postes estén espaciados cada 8 pies y que sea estilo privacidad." },
      { role: "assistant", content: "..." },
      { role: "user", content: "Mi presupuesto es de aproximadamente $3500." }
    ]
  },
  {
    id: "CHAT002",
    description: "Cliente con información incompleta e imprecisa",
    specialty: "decking",
    conversation: [
      { role: "user", content: "Estoy pensando en construir una terraza en mi patio trasero." },
      { role: "assistant", content: "..." },
      { role: "user", content: "Probablemente quiero algo resistente que dure muchos años." },
      { role: "assistant", content: "..." },
      { role: "user", content: "No estoy seguro del tamaño exacto, pero tengo un espacio de unos 15 pies al lado de mi casa." }
    ]
  },
  {
    id: "CHAT003",
    description: "Cliente indeciso que cambia los requisitos",
    specialty: "fencing",
    conversation: [
      { role: "user", content: "Necesito una cerca para mi patio delantero, estaba pensando en madera." },
      { role: "assistant", content: "..." },
      { role: "user", content: "Aunque pensándolo bien, tal vez el vinilo sea mejor para el mantenimiento." },
      { role: "assistant", content: "..." },
      { role: "user", content: "¿Qué me recomendarías para algo que dure al menos 10 años con poco mantenimiento?" },
      { role: "assistant", content: "..." },
      { role: "user", content: "Creo que iré con el vinilo entonces, necesito unos 120 pies de cerca." }
    ]
  }
];

// Interfaces para resultados
interface TestResult {
  success: boolean;
  error?: string;
  [key: string]: any;
}

interface ContractorResults {
  contractorId: string;
  contractorName: string;
  specialty: string;
  testResults: {
    manualFlowTests: Array<{
      projectDescription: string;
      result: TestResult;
    }>;
    intelligentQueryTests: Array<{
      projectDescription: string;
      result: TestResult;
    }>;
    chatTests: Array<{
      scenarioDescription: string;
      result: TestResult;
    }>;
    adaptiveLearningTests: Array<{
      result: TestResult;
    }>;
  };
}

// Función principal de pruebas
async function runComprehensiveTests() {
  console.log("Iniciando pruebas integrales de los tres motores...");
  
  const allResults: ContractorResults[] = [];
  
  for (const contractor of testContractors) {
    console.log(`\nProbando contratista: ${contractor.contractorName} (${contractor.specialty})`);
    
    // Inicializar motores para este contratista
    const engines = initializeEngines(contractor);
    
    // Resultados para este contratista
    const contractorResults: ContractorResults = {
      contractorId: contractor.contractorId,
      contractorName: contractor.contractorName,
      specialty: contractor.specialty,
      testResults: {
        manualFlowTests: [],
        intelligentQueryTests: [],
        chatTests: [],
        adaptiveLearningTests: []
      }
    };
    
    // 1. Pruebas de flujo manual (completo)
    console.log("  Ejecutando pruebas de flujo manual...");
    const projectsToTest = testProjects[contractor.specialty as keyof typeof testProjects] || [];
    
    for (const project of projectsToTest.filter(p => p.isComplete)) {
      console.log(`    Probando proyecto: ${project.description}`);
      
      try {
        const result = await testManualFlow(engines, contractor, project);
        contractorResults.testResults.manualFlowTests.push({
          projectDescription: project.description,
          result
        });
        console.log(`      Resultado: ${result.success ? 'Éxito' : 'Falló'}`);
      } catch (error) {
        console.error(`      Error inesperado: ${error instanceof Error ? error.message : String(error)}`);
        contractorResults.testResults.manualFlowTests.push({
          projectDescription: project.description,
          result: { success: false, error: String(error) }
        });
      }
    }
    
    // 2. Pruebas de consulta inteligente (proyectos incompletos)
    console.log("  Ejecutando pruebas de consulta inteligente...");
    const incompleteProjects = testProjects[contractor.specialty as keyof typeof testProjects]?.filter(p => !p.isComplete) || [];
    
    for (const project of incompleteProjects) {
      console.log(`    Probando proyecto incompleto: ${project.description}`);
      
      try {
        const result = await testIntelligentQuery(engines, contractor, project);
        contractorResults.testResults.intelligentQueryTests.push({
          projectDescription: project.description,
          result
        });
        console.log(`      Resultado: ${result.success ? 'Éxito' : 'Falló'}`);
        if (result.detectedMissingInfo) {
          console.log(`      Campos faltantes detectados: ${project.missingFields?.join(', ')}`);
          console.log(`      Preguntas generadas: ${result.questionsGenerated?.length || 0}`);
        }
      } catch (error) {
        console.error(`      Error inesperado: ${error instanceof Error ? error.message : String(error)}`);
        contractorResults.testResults.intelligentQueryTests.push({
          projectDescription: project.description,
          result: { success: false, error: String(error) }
        });
      }
    }
    
    // 3. Pruebas de chat
    console.log("  Ejecutando pruebas de conversación (chat)...");
    const relevantChatScenarios = chatScenarios.filter(s => s.specialty === contractor.specialty);
    
    for (const scenario of relevantChatScenarios) {
      console.log(`    Probando escenario: ${scenario.description}`);
      
      try {
        const result = await testChatFlow(engines, contractor, scenario);
        contractorResults.testResults.chatTests.push({
          scenarioDescription: scenario.description,
          result
        });
        console.log(`      Resultado: ${result.success ? 'Éxito' : 'Falló'}`);
        if (result.entitiesExtracted) {
          console.log(`      Entidades extraídas: ${Object.keys(result.entitiesExtracted).length}`);
        }
      } catch (error) {
        console.error(`      Error inesperado: ${error instanceof Error ? error.message : String(error)}`);
        contractorResults.testResults.chatTests.push({
          scenarioDescription: scenario.description,
          result: { success: false, error: String(error) }
        });
      }
    }
    
    // 4. Pruebas de aprendizaje adaptativo
    console.log("  Ejecutando pruebas de aprendizaje adaptativo...");
    
    try {
      const result = await testAdaptiveLearning(engines, contractor);
      contractorResults.testResults.adaptiveLearningTests.push({ result });
      console.log(`    Resultado: ${result.success ? 'Éxito' : 'Falló'}`);
      if (result.adaptiveLearningDetected) {
        console.log(`    Markup aprendido: ${result.learnedMarkup ? (result.learnedMarkup * 100).toFixed(0) + '%' : 'N/A'}`);
        console.log(`    Materiales preferidos: ${result.learnedMaterials?.join(', ') || 'Ninguno'}`);
      }
    } catch (error) {
      console.error(`    Error inesperado: ${error instanceof Error ? error.message : String(error)}`);
      contractorResults.testResults.adaptiveLearningTests.push({
        result: { success: false, error: String(error) }
      });
    }
    
    // Guardar resultados de este contratista
    allResults.push(contractorResults);
    
    // Guardar resultados en archivo para análisis posterior
    const resultFilePath = path.join(RESULTS_DIR, `${contractor.contractorId}_results.json`);
    fs.writeFileSync(resultFilePath, JSON.stringify(contractorResults, null, 2));
    console.log(`\nResultados guardados en: ${resultFilePath}`);
  }
  
  console.log("\nPruebas integrales completadas.");
  console.log(`Se han guardado los resultados en: ${RESULTS_DIR}`);
  
  return allResults;
}

// Funciones de prueba específicas

function initializeEngines(contractor: any) {
  // Simulación de inicialización de motores
  const cacheService = new PersistentCacheService();
  const constructionService = new ConstructionMethodService(cacheService);
  const priceService = new PriceResearchService();
  
  const materialEngine = new MaterialEngine(constructionService, priceService);
  const deepSearchEngine = new DeepSearchEngine();
  const intelligentQueryEngine = new IntelligentQueryEngine();
  const adaptiveLearningEngine = new AdaptiveLearningEngine(cacheService);
  const flowManagerEngine = new FlowManagerEngine(
    materialEngine,
    deepSearchEngine,
    intelligentQueryEngine,
    adaptiveLearningEngine
  );
  
  // Precargar datos del contratista
  cacheService.setItem(`contractor:${contractor.contractorId}`, contractor);
  
  // Precargar estimados previos
  contractor.previousEstimates.forEach((estimate: any) => {
    cacheService.setItem(`estimate:${estimate.id}`, {
      ...estimate,
      contractorId: contractor.contractorId
    });
  });
  
  return {
    materialEngine,
    deepSearchEngine,
    intelligentQueryEngine,
    adaptiveLearningEngine,
    flowManagerEngine
  };
}

async function testManualFlow(engines: any, contractor: any, project: any): Promise<TestResult> {
  // Simulación de prueba de flujo manual con proyectos completos
  const { flowManagerEngine } = engines;
  
  // Crear sesión para este proyecto
  const sessionId = `session-${contractor.contractorId}-${project.id}`;
  
  try {
    // Iniciar sesión
    await flowManagerEngine.startSession(sessionId, contractor.contractorId);
    
    // Establecer tipo de proyecto
    await flowManagerEngine.setProjectType(sessionId, project.details.material + '-' + (
      contractor.specialty === 'fencing' ? 'fence' : 'deck'
    ));
    
    // Configurar proyecto con todos los detalles
    await flowManagerEngine.setProjectDetails(sessionId, project.details);
    
    // Generar estimado
    const estimate = await flowManagerEngine.generateEstimate(sessionId);
    
    // Validar resultado
    if (!estimate || !estimate.totalCost || !estimate.materials) {
      return {
        success: false,
        error: "El estimado generado no contiene la información esperada",
        estimate
      };
    }
    
    // Simular finalización de sesión
    await flowManagerEngine.finalizeSession(sessionId);
    
    return {
      success: true,
      estimate,
      nextStep: estimate.nextStep,
      flow: "complete"
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      flow: "failed"
    };
  }
}

async function testIntelligentQuery(engines: any, contractor: any, project: any): Promise<TestResult> {
  // Simulación de prueba de consulta inteligente con proyectos incompletos
  const { flowManagerEngine, intelligentQueryEngine } = engines;
  
  // Crear sesión para este proyecto
  const sessionId = `session-iq-${contractor.contractorId}-${project.id}`;
  
  try {
    // Iniciar sesión
    await flowManagerEngine.startSession(sessionId, contractor.contractorId);
    
    // Establecer tipo de proyecto
    await flowManagerEngine.setProjectType(sessionId, project.details.material + '-' + (
      contractor.specialty === 'fencing' ? 'fence' : 'deck'
    ));
    
    // Configurar proyecto con detalles incompletos
    await flowManagerEngine.setProjectDetails(sessionId, project.details);
    
    // Detectar información faltante
    const missingInfoAnalysis = await intelligentQueryEngine.analyzeMissingInformation(
      sessionId,
      contractor.specialty,
      project.details
    );
    
    const detectedMissingInfo = 
      missingInfoAnalysis.missingFields && 
      missingInfoAnalysis.missingFields.length > 0;
    
    // Si se detectó información faltante, generar preguntas
    let questionsGenerated = [];
    if (detectedMissingInfo) {
      questionsGenerated = await intelligentQueryEngine.generateQuestionsForMissingInfo(
        sessionId,
        contractor.specialty,
        missingInfoAnalysis.missingFields
      );
    }
    
    // Simular que proporcionamos las respuestas a las preguntas
    if (detectedMissingInfo && questionsGenerated.length > 0) {
      const completedDetails = { ...project.details };
      
      // Añadir los campos que faltaban
      project.missingFields?.forEach((field: string) => {
        switch (field) {
          case 'heightFt':
            completedDetails.heightFt = 4;
            break;
          case 'gateCount':
            completedDetails.gateCount = 1;
            break;
          case 'railingType':
            completedDetails.railingType = 'metal';
            break;
          default:
            completedDetails[field] = 'defaultValue';
        }
      });
      
      // Actualizar los detalles del proyecto
      await flowManagerEngine.setProjectDetails(sessionId, completedDetails);
    }
    
    // Generar estimado con la información completa
    const estimate = await flowManagerEngine.generateEstimate(sessionId);
    
    // Simular finalización de sesión
    await flowManagerEngine.finalizeSession(sessionId);
    
    return {
      success: true,
      detectedMissingInfo,
      missingFields: missingInfoAnalysis.missingFields || [],
      questionsGenerated,
      estimate
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      detectedMissingInfo: false
    };
  }
}

async function testChatFlow(engines: any, contractor: any, scenario: any): Promise<TestResult> {
  // Simulación de prueba de conversación de chat
  const { flowManagerEngine } = engines;
  
  // Crear sesión para este escenario
  const sessionId = `session-chat-${contractor.contractorId}-${scenario.id}`;
  
  try {
    // Iniciar sesión
    await flowManagerEngine.startSession(sessionId, contractor.contractorId);
    
    // Procesar cada mensaje de la conversación
    const extractedEntities: any = {};
    const intelligentQuestionsGenerated: string[] = [];
    
    for (let i = 0; i < scenario.conversation.length; i++) {
      const message = scenario.conversation[i];
      
      if (message.role === 'user') {
        // Simular que el motor procesa el mensaje del usuario
        const responseData = await flowManagerEngine.processUserMessage(sessionId, message.content);
        
        // Si es el primer mensaje, intentamos detectar el tipo de proyecto
        if (i === 0) {
          const projectType = detectProjectType(message.content, contractor.specialty);
          if (projectType) {
            await flowManagerEngine.setProjectType(sessionId, projectType);
          }
        }
        
        // Simular extracción de entidades
        const entities = extractEntitiesFromMessage(message.content, contractor.specialty);
        
        // Acumular entidades extraídas
        Object.assign(extractedEntities, entities);
        
        // Actualizar proyecto con las entidades extraídas
        if (Object.keys(entities).length > 0) {
          await flowManagerEngine.updateProjectDetails(sessionId, entities);
        }
        
        // Para el segundo mensaje, simular preguntas inteligentes
        if (i === 2 && shouldAskIntelligentQuestions(extractedEntities, contractor.specialty)) {
          const questions = generateIntelligentQuestionsForChat(extractedEntities, contractor.specialty);
          intelligentQuestionsGenerated.push(...questions);
        }
      }
    }
    
    // Verificar si tenemos suficiente información para un estimado
    let estimateGenerated = false;
    let estimate = null;
    
    if (hasMinimumRequiredInformation(extractedEntities, contractor.specialty)) {
      estimate = await flowManagerEngine.generateEstimate(sessionId);
      estimateGenerated = !!estimate;
    }
    
    // Simular finalización de sesión
    await flowManagerEngine.finalizeSession(sessionId);
    
    return {
      success: true,
      entitiesExtracted: extractedEntities,
      intelligentQuestionsGenerated,
      estimateGenerated,
      estimate
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      entitiesExtracted: null
    };
  }
}

async function testAdaptiveLearning(engines: any, contractor: any): Promise<TestResult> {
  // Simulación de prueba de aprendizaje adaptativo
  const { adaptiveLearningEngine } = engines;
  
  try {
    // Analizar los patrones del contratista basados en estimados previos
    const contractorPatterns = await adaptiveLearningEngine.analyzeContractorPatterns(contractor.contractorId);
    
    // Verifique si se detectó aprendizaje adaptativo
    const adaptiveLearningDetected = 
      contractorPatterns && 
      (
        contractorPatterns.averageMarkup || 
        (contractorPatterns.preferredMaterials && contractorPatterns.preferredMaterials.length > 0)
      );
    
    // Crear un nuevo proyecto hipotético
    const projectType = contractor.specialty === 'fencing' ? 'wood-fence' : 'wood-deck';
    const projectDetails = contractor.specialty === 'fencing' 
      ? { lengthFt: 120, heightFt: 6, material: "wood", gateCount: 1 }
      : { lengthFt: 16, widthFt: 12, material: "wood", stairs: true, stairSteps: 3 };
    
    // Generar recomendaciones basadas en patrones aprendidos
    const recommendations = await adaptiveLearningEngine.generateRecommendations(
      contractor.contractorId,
      projectType,
      projectDetails
    );
    
    return {
      success: true,
      adaptiveLearningDetected,
      learnedMarkup: contractorPatterns.averageMarkup,
      learnedMaterials: contractorPatterns.preferredMaterials,
      recommendations
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      adaptiveLearningDetected: false
    };
  }
}

// Funciones auxiliares para la simulación

function detectProjectType(message: string, specialty: string): string | null {
  // Simular detección de tipo de proyecto a partir del mensaje
  const lowerMessage = message.toLowerCase();
  
  if (specialty === 'fencing') {
    if (lowerMessage.includes('cedar') || lowerMessage.includes('madera')) {
      return 'wood-fence';
    } else if (lowerMessage.includes('chain') || lowerMessage.includes('cadena')) {
      return 'chain-link-fence';
    } else if (lowerMessage.includes('vinyl') || lowerMessage.includes('vinilo')) {
      return 'vinyl-fence';
    } else if (lowerMessage.includes('iron') || lowerMessage.includes('hierro')) {
      return 'iron-fence';
    }
    return 'wood-fence'; // Fallback
  } else if (specialty === 'decking') {
    if (lowerMessage.includes('composite') || lowerMessage.includes('compuesto')) {
      return 'composite-deck';
    } else if (lowerMessage.includes('pergola')) {
      return 'pergola';
    }
    return 'wood-deck'; // Fallback
  }
  
  return null;
}

function extractEntitiesFromMessage(message: string, specialty: string): any {
  // Simular extracción de entidades del mensaje
  const entities: any = {};
  const lowerMessage = message.toLowerCase();
  
  // Extraer dimensiones
  const heightMatch = message.match(/(\d+)\s*(?:pies|feet|ft|')\s*(?:de\s*)?(?:altura|alto|height|tall)/i);
  if (heightMatch) {
    entities.heightFt = parseInt(heightMatch[1], 10);
  }
  
  const lengthMatch = message.match(/(\d+)\s*(?:pies|feet|ft|')\s*(?:de\s*)?(?:longitud|largo|length)/i);
  if (lengthMatch) {
    entities.lengthFt = parseInt(lengthMatch[1], 10);
  }
  
  const widthMatch = message.match(/(\d+)\s*(?:pies|feet|ft|')\s*(?:de\s*)?(?:ancho|anchura|width)/i);
  if (widthMatch) {
    entities.widthFt = parseInt(widthMatch[1], 10);
  }
  
  // Extraer materiales
  if (specialty === 'fencing') {
    if (lowerMessage.includes('cedar') || lowerMessage.includes('cedro')) {
      entities.material = 'cedar';
    } else if (lowerMessage.includes('pine') || lowerMessage.includes('pino')) {
      entities.material = 'pine';
    } else if (lowerMessage.includes('vinyl') || lowerMessage.includes('vinilo')) {
      entities.material = 'vinyl';
    } else if (lowerMessage.includes('chain') || lowerMessage.includes('cadena')) {
      entities.material = 'chain-link';
    }
    
    // Extraer puertas
    const gateMatch = message.match(/(\d+)\s*(?:puerta|puertas|gate|gates)/i);
    if (gateMatch) {
      entities.gateCount = parseInt(gateMatch[1], 10);
    } else if (lowerMessage.includes('puerta') || lowerMessage.includes('gate')) {
      entities.gateCount = 1;
    }
    
    // Extraer estilo
    if (lowerMessage.includes('privacy') || lowerMessage.includes('privacidad')) {
      entities.style = 'privacy';
    } else if (lowerMessage.includes('decorative') || lowerMessage.includes('decorativo')) {
      entities.style = 'decorative';
    } else if (lowerMessage.includes('picket') || lowerMessage.includes('estacas')) {
      entities.style = 'picket';
    }
    
    // Extraer espaciado de postes
    const postSpacingMatch = message.match(/(?:postes|posts)\s*(?:cada|every|espacio|spacing)\s*(\d+)/i);
    if (postSpacingMatch) {
      entities.postSpacing = parseInt(postSpacingMatch[1], 10);
    }
  } else if (specialty === 'decking') {
    if (lowerMessage.includes('trex') || lowerMessage.includes('composite') || lowerMessage.includes('compuesto')) {
      entities.material = 'composite';
    } else if (lowerMessage.includes('treated') || lowerMessage.includes('tratada')) {
      entities.material = 'pressure-treated';
    } else if (lowerMessage.includes('cedar') || lowerMessage.includes('cedro')) {
      entities.material = 'cedar';
    }
    
    // Extraer detalles de escaleras
    if (lowerMessage.includes('stair') || lowerMessage.includes('escalon') || lowerMessage.includes('escalera')) {
      entities.stairs = true;
      
      const stepsMatch = message.match(/(\d+)\s*(?:escalones|escalón|escalon|steps|step)/i);
      if (stepsMatch) {
        entities.stairSteps = parseInt(stepsMatch[1], 10);
      }
    }
    
    // Extraer tipo de barandilla
    if (lowerMessage.includes('metal') || lowerMessage.includes('metálica')) {
      entities.railingType = 'metal';
    } else if (lowerMessage.includes('glass') || lowerMessage.includes('vidrio')) {
      entities.railingType = 'glass';
    } else if (lowerMessage.includes('wood') || lowerMessage.includes('madera')) {
      entities.railingType = 'wood';
    }
  }
  
  // Extraer presupuesto
  const budgetMatch = message.match(/\$\s*(\d+[,.]\d+|\d+)|\d+\s*(?:dólares|dolares|dollars)/i);
  if (budgetMatch) {
    const budgetStr = budgetMatch[1] || budgetMatch[0].replace(/[^\d.]/g, '');
    entities.budget = parseFloat(budgetStr);
  }
  
  return entities;
}

function shouldAskIntelligentQuestions(extractedEntities: any, specialty: string): boolean {
  // Determinar si deberíamos hacer preguntas inteligentes basadas en las entidades extraídas
  if (specialty === 'fencing') {
    return !extractedEntities.lengthFt || !extractedEntities.material || !extractedEntities.heightFt;
  } else if (specialty === 'decking') {
    return !extractedEntities.lengthFt || !extractedEntities.widthFt || !extractedEntities.material;
  }
  return true;
}

function generateIntelligentQuestionsForChat(extractedEntities: any, specialty: string): string[] {
  // Generar preguntas inteligentes basadas en las entidades extraídas hasta ahora
  const questions: string[] = [];
  
  if (specialty === 'fencing') {
    if (!extractedEntities.lengthFt) {
      questions.push("¿Cuál es la longitud aproximada de la cerca que necesita?");
    }
    if (!extractedEntities.heightFt) {
      questions.push("¿Qué altura le gustaría que tenga su cerca?");
    }
    if (!extractedEntities.material) {
      questions.push("¿Qué material prefiere para su cerca: madera, vinilo, cadena o hierro?");
    }
    if (!extractedEntities.gateCount && questions.length < 3) {
      questions.push("¿Necesitará alguna puerta en su cerca? Si es así, ¿cuántas?");
    }
    if (!extractedEntities.style && questions.length < 3) {
      questions.push("¿Prefiere un estilo de privacidad completa o algo más decorativo?");
    }
  } else if (specialty === 'decking') {
    if (!extractedEntities.lengthFt) {
      questions.push("¿Cuál es la longitud que desea para su terraza?");
    }
    if (!extractedEntities.widthFt) {
      questions.push("¿Qué ancho tiene planeado para la terraza?");
    }
    if (!extractedEntities.material) {
      questions.push("¿Prefiere una terraza de madera tratada, cedro o material compuesto?");
    }
    if (!extractedEntities.stairs && questions.length < 3) {
      questions.push("¿Necesitará escalones para acceder a la terraza? Si es así, ¿cuántos escalones aproximadamente?");
    }
    if (!extractedEntities.railingType && questions.length < 3) {
      questions.push("¿Qué tipo de barandilla le gustaría: madera a juego, metal o vidrio?");
    }
  }
  
  // Limitar a máximo 3 preguntas por interacción
  return questions.slice(0, 3);
}

function hasMinimumRequiredInformation(extractedEntities: any, specialty: string): boolean {
  // Verificar si tenemos la información mínima necesaria para generar un estimado
  if (specialty === 'fencing') {
    return !!extractedEntities.lengthFt && !!extractedEntities.material;
  } else if (specialty === 'decking') {
    return !!extractedEntities.lengthFt && !!extractedEntities.widthFt && !!extractedEntities.material;
  }
  return false;
}

function formatMaterialsList(materials: string[] | null | undefined): string {
  if (!materials || materials.length === 0) {
    return "ninguno";
  }
  return materials.join(', ');
}

// Ejecutar pruebas e iniciar el análisis
(async function main() {
  try {
    console.log("=== INICIANDO PRUEBAS INTEGRALES DE TRES MOTORES ===");
    
    // Ejecutar las pruebas
    const results = await runComprehensiveTests();
    
    console.log("\n=== PRUEBAS COMPLETADAS ===");
    console.log(`Se probaron ${results.length} contratistas`);
    
    // Iniciar análisis de resultados
    console.log("\n=== INICIANDO ANÁLISIS DE RESULTADOS ===");
    
    const { exec } = require('child_process');
    exec('node ./tests/integration/analyze-test-results.js', (error: any, stdout: any, stderr: any) => {
      if (error) {
        console.error(`Error al ejecutar el análisis: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Errores en el análisis: ${stderr}`);
        return;
      }
      console.log(stdout);
      console.log("\n=== ANÁLISIS DE RESULTADOS COMPLETADO ===");
    });
    
  } catch (error) {
    console.error("Error durante la ejecución de pruebas:", error);
  }
})();