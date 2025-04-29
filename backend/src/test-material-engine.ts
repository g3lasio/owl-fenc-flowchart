import { MaterialCacheService } from './services/cache.service';
import { MockPriceAPIClient } from './services/price-api.service';
import { MaterialEngine } from './engines/materials/material.engine';
import { FenceProjectDetails } from './interfaces/fence.interfaces';

/**
 * Script para probar el motor de materiales
 */
async function testMaterialEngine() {
  console.log('Iniciando prueba del Motor DeepSearch para materiales...');
  
  // Crear servicios
  const materialCache = new MaterialCacheService();
  const priceClients = [new MockPriceAPIClient()];
  const materialEngine = new MaterialEngine(materialCache, priceClients);
  
  // Proyectos de prueba para diferentes tipos de cercas
  const testProjects: FenceProjectDetails[] = [
    {
      fenceType: 'wood',
      dimensions: { length: 100, height: 6, gates: 1 },
      options: { style: 'privacy' },
      location: { city: 'Miami', state: 'FL', zipCode: '33130' }
    },
    {
      fenceType: 'vinyl',
      dimensions: { length: 80, height: 5, gates: 2 },
      options: { style: 'picket', color: 'white' },
      location: { city: 'Orlando', state: 'FL', zipCode: '32801' }
    },
    {
      fenceType: 'chain-link',
      dimensions: { length: 150, height: 4 },
      options: { gauge: '9', coating: 'galvanized' },
      location: { city: 'Tampa', state: 'FL', zipCode: '33602' }
    }
  ];
  
  // Probar cada tipo de proyecto
  for (const project of testProjects) {
    console.log(`\n----- Calculando materiales para cerca de ${project.fenceType} -----`);
    console.log(`Dimensiones: ${project.dimensions.length}' x ${project.dimensions.height}'`);
    
    try {
      const result = await materialEngine.calculateMaterials(project);
      
      console.log('\nMateriales requeridos:');
      result.materials.forEach(material => {
        console.log(`- ${material.quantity} ${material.unit} de ${material.name} a $${material.unitPrice} = $${material.totalPrice.toFixed(2)}`);
      });
      
      console.log(`\nCosto total de materiales: $${result.totalMaterialCost.toFixed(2)}`);
    } catch (error) {
      console.error(`Error al calcular materiales para cerca de ${project.fenceType}:`, error);
    }
  }
  
  console.log('\nPrueba finalizada.');
}

// Ejecutar la prueba
testMaterialEngine()
  .catch(error => console.error('Error en la prueba:', error));