import { DeepSearchEngine } from './engines/deepsearch.engine';
import { OpenAIClient } from './services/openai.client';
import { AnthropicClient } from './services/anthropic.client';
import { PriceApiService } from './services/price-api.service';
import { PriceResearchService } from './services/price-research.service';
import { ConstructionMethodService } from './services/construction-method.service';
import { ConstructionMethodCacheService } from './services/construction-method-cache.service';
import { config } from './config/config';
import { FenceDimensions, FenceOptions, Location } from './interfaces/fence.interfaces';

/**
 * Script para obtener un estimado de una cerca de madera
 * Este script genera un estimado específico para una cerca de madera de 43 pies de longitud
 * y 6 pies de altura con dos entradas e instalación para un hogar en Sacramento.
 */

// Inicializar los servicios necesarios
const openAIClient = new OpenAIClient(config.apis.openai.key || '');
const anthropicClient = new AnthropicClient(config.apis.anthropic.key || '');
const constructionMethodCache = new ConstructionMethodCacheService();
const constructionMethodService = new ConstructionMethodService(anthropicClient, constructionMethodCache);
const priceApiService = new PriceApiService();
const priceResearchService = new PriceResearchService(
  config.research.enableAI,
  config.cache.ttlSeconds
);

// Crear el motor DeepSearch
const deepSearchEngine = new DeepSearchEngine(
  openAIClient,
  anthropicClient,
  priceApiService,
  priceResearchService,
  constructionMethodService
);

// Definir el proyecto de cerca de madera
const woodFenceProject = {
  projectType: 'fencing',
  projectSubtype: 'wood',
  dimensions: {
    length: 43, // 43 pies de longitud
    height: 6   // 6 pies de altura
  } as FenceDimensions,
  options: {
    type: 'wood',
    style: 'privacy',
    posts: 'pressure-treated',
    gates: [
      { width: 3, height: 6, type: 'standard' },
      { width: 4, height: 6, type: 'standard' }
    ]
  } as FenceOptions,
  location: {
    city: 'Sacramento',
    state: 'CA',
    zipCode: '95814'
  } as Location
};

/**
 * Función para formatear un número como moneda
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

/**
 * Función para generar el estimado
 */
async function generateWoodFenceEstimate() {
  console.log('=========================================');
  console.log('ESTIMADO PARA CERCA DE MADERA');
  console.log('=========================================');
  console.log(`Fecha: ${new Date().toLocaleDateString()}`);
  console.log('\nDETALLES DEL PROYECTO:');
  console.log(`- Tipo: Cerca de madera (estilo privacidad)`);
  console.log(`- Longitud: ${woodFenceProject.dimensions.length} pies`);
  console.log(`- Altura: ${woodFenceProject.dimensions.height} pies`);
  console.log(`- Ubicación: ${woodFenceProject.location.city}, ${woodFenceProject.location.state}`);
  console.log(`- Entradas: 2 (una de 3' y una de 4')`);
  
  try {
    console.log('\nGenerando estimado detallado...');
    console.time('Tiempo de procesamiento');
    
    // Llamar al motor DeepSearch para analizar el proyecto
    const result = await deepSearchEngine.analyzeProject(
      woodFenceProject.projectType,
      woodFenceProject.projectSubtype,
      woodFenceProject.dimensions,
      woodFenceProject.options,
      woodFenceProject.location
    );
    
    console.timeEnd('Tiempo de procesamiento');
    
    // Mostrar resultados
    console.log('\n=========================================');
    console.log('ESTIMADO DETALLADO');
    console.log('=========================================');
    
    // Materiales
    console.log('\nMATERIALES REQUERIDOS:');
    let totalMaterialCost = 0;
    
    result.materials.forEach((material, index) => {
      // Calcular el costo total para este material (asumimos que el precio está integrado)
      let materialCost = 0;
      if ('totalPrice' in material) {
        materialCost = (material as any).totalPrice;
      } else {
        // Si no hay totalPrice, intentamos calcularlo nosotros
        const qty = material.quantity || 0;
        materialCost = qty * ((material as any).price || 0);
      }
      totalMaterialCost += materialCost;
      
      console.log(`${index + 1}. ${material.name}`);
      console.log(`   - Cantidad: ${material.quantity} ${material.unit}`);
      if ('price' in material) {
        console.log(`   - Costo unitario: ${formatCurrency((material as any).price)}`);
      }
      console.log(`   - Costo total: ${formatCurrency(materialCost)}`);
    });
    
    // Servicios
    console.log('\nSERVICIOS REQUERIDOS:');
    let totalServiceCost = 0;
    
    result.services.forEach((service, index) => {
      const cost = service.hourlyRate * service.hours;
      totalServiceCost += cost;
      console.log(`${index + 1}. ${service.name}`);
      console.log(`   - Descripción: ${service.description}`);
      console.log(`   - Horas: ${service.hours}`);
      console.log(`   - Tarifa por hora: ${formatCurrency(service.hourlyRate)}`);
      console.log(`   - Costo total: ${formatCurrency(cost)}`);
    });
    
    // Metodología de construcción
    console.log('\nMETODOLOGÍA DE CONSTRUCCIÓN:');
    console.log(result.constructionMethod);
    
    // Resumen de costos
    console.log('\n=========================================');
    console.log('RESUMEN DE COSTOS');
    console.log('=========================================');
    console.log(`Subtotal de Materiales: ${formatCurrency(result.materialCost)}`);
    console.log(`Subtotal de Mano de Obra: ${formatCurrency(result.laborCost)}`);
    console.log(`Subtotal de Equipamiento: ${formatCurrency(result.equipmentCost)}`);
    console.log(`Margen recomendado: ${(result.recommendedMarkup * 100).toFixed(1)}%`);
    console.log(`COSTO TOTAL DEL PROYECTO: ${formatCurrency(result.totalCost)}`);
    console.log(`Precio por pie lineal: ${formatCurrency(result.pricePerUnit)}`);
    
    // Estimado de tiempo
    if (result.timeEstimate) {
      console.log('\nESTIMADO DE TIEMPO:');
      console.log(`- Días de trabajo mínimos: ${result.timeEstimate.minDays}`);
      console.log(`- Días de trabajo máximos: ${result.timeEstimate.maxDays}`);
    }
    
    console.log('\n=========================================');
    console.log('Estimado generado correctamente');
    console.log('=========================================');
    
  } catch (error) {
    console.error('\nERROR AL GENERAR ESTIMADO:');
    console.error(error);
  }
}

// Ejecutar la función para generar el estimado
console.log('Iniciando generación de estimado...');
generateWoodFenceEstimate().catch(error => {
  console.error('Error crítico:', error);
});