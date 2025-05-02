import { DeepSearchEngine } from '../../src/engines/deepsearch.engine';
import { OpenAIClient } from '../../src/services/openai.client';
import { AnthropicClient } from '../../src/services/anthropic.client';
import { config } from '../../src/config/config';

/**
 * Este archivo demuestra cómo el motor DeepSearch unificado puede manejar
 * diferentes tipos de proyectos de construcción sin necesidad de crear
 * calculadoras individuales para cada variante.
 */

// Inicializar clientes de IA
const openAIClient = new OpenAIClient(config.openai.apiKey);
const anthropicClient = new AnthropicClient(config.anthropic.apiKey);

// Crear motor DeepSearch unificado
const deepSearchEngine = new DeepSearchEngine(openAIClient, anthropicClient);

async function runDeepSearchExamples() {
  console.log('===== EJEMPLOS DE USO DEL MOTOR DEEPSEARCH UNIFICADO =====');
  
  // Ejemplo 1: Proyecto de cerca de vinilo
  console.log('\n----- EJEMPLO 1: CERCA DE VINILO -----');
  const vinylFenceResult = await deepSearchEngine.calculateMaterials(
    'fencing',
    'vinyl',
    { 
      length: 100,  // pies
      height: 6,    // pies
      gates: 1      // cantidad
    },
    {
      style: 'privacy',
      color: 'white'
    },
    {
      city: 'Miami',
      state: 'FL',
      zipCode: '33101'
    }
  );
  
  console.log('Materiales para cerca de vinilo:');
  console.log(JSON.stringify(vinylFenceResult.materials, null, 2));
  console.log('Costo total: $' + vinylFenceResult.totalCost.toFixed(2));
  
  // Ejemplo 2: Proyecto de techo (roofing)
  console.log('\n----- EJEMPLO 2: TECHO DE TEJAS (ROOFING) -----');
  const roofingResult = await deepSearchEngine.calculateMaterials(
    'roofing',
    'asphalt_shingles',
    { 
      area: 2000,       // pies cuadrados
      pitch: '6:12',    // inclinación
      valleys: 2,       // cantidad de valles
      chimneys: 1       // cantidad de chimeneas
    },
    {
      shingleType: 'architectural',
      underlayment: 'synthetic',
      ridgeVent: true
    },
    {
      city: 'Phoenix',
      state: 'AZ',
      zipCode: '85001'
    }
  );
  
  console.log('Materiales para techo de tejas:');
  console.log(JSON.stringify(roofingResult.materials, null, 2));
  console.log('Costo total: $' + roofingResult.totalCost.toFixed(2));
  
  // Ejemplo 3: Proyecto de terraza (decking)
  console.log('\n----- EJEMPLO 3: TERRAZA DE COMPUESTO (DECKING) -----');
  const deckingResult = await deepSearchEngine.calculateMaterials(
    'decking',
    'composite',
    { 
      length: 16,    // pies
      width: 12,     // pies
      height: 3,     // pies desde el suelo
      stairs: true,  // incluye escaleras
      railings: true // incluye barandillas
    },
    {
      deckMaterial: 'trex',
      pattern: 'horizontal',
      color: 'brown'
    },
    {
      city: 'Seattle',
      state: 'WA',
      zipCode: '98101'
    }
  );
  
  console.log('Materiales para terraza de compuesto:');
  console.log(JSON.stringify(deckingResult.materials, null, 2));
  console.log('Costo total: $' + deckingResult.totalCost.toFixed(2));
}

// Ejecutar ejemplos
runDeepSearchExamples().catch(error => {
  console.error('Error en los ejemplos:', error);
});