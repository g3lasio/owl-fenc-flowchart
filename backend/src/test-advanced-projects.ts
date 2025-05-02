import { DeepSearchEngine } from './engines/deepsearch.engine';
import { OpenAIClient } from './services/openai.client';
import { AnthropicClient } from './services/anthropic.client';
import { PriceApiService } from './services/price-api.service';
import { PriceResearchService } from './services/price-research.service';
import { ConstructionMethodService } from './services/construction-method.service';
import { ConstructionMethodCacheService } from './services/construction-method-cache.service';
import { config } from './config/config';

/**
 * Este archivo demuestra el uso del motor DeepSearch mejorado
 * para los casos de uso específicos mencionados:
 * 1. Un proyecto de deck/terraza de madera tratada a presión
 * 2. Un proyecto de entrada (driveway) de concreto
 */

// Inicializar clientes y servicios necesarios
const openAIClient = new OpenAIClient(config.openai.apiKey);
const anthropicClient = new AnthropicClient(config.anthropic.apiKey);
const constructionMethodCache = new ConstructionMethodCacheService();
const constructionMethodService = new ConstructionMethodService(anthropicClient, constructionMethodCache);
const priceApiService = new PriceApiService();
const priceResearchService = new PriceResearchService(openAIClient);

// Crear el motor DeepSearch avanzado
const deepSearchEngine = new DeepSearchEngine(
  openAIClient,
  anthropicClient,
  priceApiService,
  priceResearchService,
  constructionMethodService
);

async function runDeepSearchExamples() {
  console.log('===== ANÁLISIS AVANZADO DE PROYECTOS DE CONSTRUCCIÓN =====');
  
  // Ejemplo 1: Proyecto de deck/terraza con madera tratada a presión
  console.log('\n----- EJEMPLO 1: DECK DE MADERA TRATADA A PRESIÓN -----');
  console.log('Iniciando análisis profundo para proyecto de deck...');
  
  const deckResult = await deepSearchEngine.analyzeProject(
    'decking',
    'pressure_treated_wood',
    { 
      squareFeet: 350,  // 350 pie cuadrados
      shape: 'rectangular',
      height: 2         // 2 pies de altura desde el suelo
    },
    {
      material: 'pressure treated wood',
      railingType: 'matching wood',
      stairs: true
    },
    {
      city: 'Vacaville',
      state: 'CA',
      zipCode: '95688'
    }
  );
  
  // Mostrar resultados detallados del proyecto de deck
  console.log('\n==== RESULTADOS DEL ANÁLISIS DE DECK ====');
  console.log('\n1. MATERIALES NECESARIOS:');
  deckResult.materials.forEach(material => {
    console.log(`- ${material.name}: ${material.quantity} ${material.unit} x $${material.unitPrice.toFixed(2)} = $${(material.quantity * material.unitPrice).toFixed(2)}`);
  });
  
  console.log('\n2. SERVICIOS NECESARIOS:');
  deckResult.services.forEach(service => {
    console.log(`- ${service.name}: ${service.hours} horas x $${service.hourlyRate.toFixed(2)}/hora = $${(service.hours * service.hourlyRate).toFixed(2)}`);
  });
  
  console.log('\n3. MÉTODO DE CONSTRUCCIÓN RECOMENDADO:');
  console.log(deckResult.constructionMethod);
  
  console.log('\n4. RESUMEN DE COSTOS:');
  console.log(`- Costo de materiales: $${deckResult.materialCost.toFixed(2)}`);
  console.log(`- Costo de mano de obra: $${deckResult.laborCost.toFixed(2)}`);
  console.log(`- Costo de equipos: $${deckResult.equipmentCost.toFixed(2)}`);
  console.log(`- Margen recomendado: $${deckResult.recommendedMarkup.toFixed(2)}`);
  console.log(`- COSTO TOTAL: $${deckResult.totalCost.toFixed(2)}`);
  console.log(`- Precio recomendado por pie cuadrado: $${deckResult.pricePerUnit.toFixed(2)}/sqft`);
  
  console.log('\n5. TIEMPO ESTIMADO:');
  console.log(`- ${deckResult.timeEstimate.minDays}-${deckResult.timeEstimate.maxDays} días laborables`);
  
  // Ejemplo 2: Proyecto de entrada de concreto
  console.log('\n\n----- EJEMPLO 2: ENTRADA DE CONCRETO (DRIVEWAY) -----');
  console.log('Iniciando análisis profundo para proyecto de entrada de concreto...');
  
  const drivewayResult = await deepSearchEngine.analyzeProject(
    'concrete',
    'driveway',
    { 
      squareFeet: 100,  // 100 pies cuadrados
      thickness: 8      // 8 pulgadas de espesor
    },
    {
      finish: 'broom finish',
      reinforcement: 'wire mesh',
      edging: 'squared'
    },
    {
      city: 'Vacaville',
      state: 'CA',
      zipCode: '95688'
    }
  );
  
  // Mostrar resultados detallados del proyecto de entrada de concreto
  console.log('\n==== RESULTADOS DEL ANÁLISIS DE ENTRADA DE CONCRETO ====');
  console.log('\n1. MATERIALES NECESARIOS:');
  drivewayResult.materials.forEach(material => {
    console.log(`- ${material.name}: ${material.quantity} ${material.unit} x $${material.unitPrice.toFixed(2)} = $${(material.quantity * material.unitPrice).toFixed(2)}`);
  });
  
  console.log('\n2. SERVICIOS NECESARIOS:');
  drivewayResult.services.forEach(service => {
    console.log(`- ${service.name}: ${service.hours} horas x $${service.hourlyRate.toFixed(2)}/hora = $${(service.hours * service.hourlyRate).toFixed(2)}`);
  });
  
  console.log('\n3. MÉTODO DE CONSTRUCCIÓN RECOMENDADO:');
  console.log(drivewayResult.constructionMethod);
  
  console.log('\n4. RESUMEN DE COSTOS:');
  console.log(`- Costo de materiales: $${drivewayResult.materialCost.toFixed(2)}`);
  console.log(`- Costo de mano de obra: $${drivewayResult.laborCost.toFixed(2)}`);
  console.log(`- Costo de equipos: $${drivewayResult.equipmentCost.toFixed(2)}`);
  console.log(`- Margen recomendado: $${drivewayResult.recommendedMarkup.toFixed(2)}`);
  console.log(`- COSTO TOTAL: $${drivewayResult.totalCost.toFixed(2)}`);
  console.log(`- Precio recomendado por pie cuadrado: $${drivewayResult.pricePerUnit.toFixed(2)}/sqft`);
  
  console.log('\n5. TIEMPO ESTIMADO:');
  console.log(`- ${drivewayResult.timeEstimate.minDays}-${drivewayResult.timeEstimate.maxDays} días laborables`);
}

// Ejecutar ejemplos
console.log('Iniciando ejemplos de DeepSearch avanzado...');
runDeepSearchExamples().catch(error => {
  console.error('Error en los ejemplos:', error);
});