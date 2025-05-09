/**
 * Prueba de integración para el motor de análisis de planos arquitectónicos
 * con soporte para Mistral AI OCR y fallback a Tesseract
 */
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../../src/config/config';
import { OpenAIClient } from '../../src/services/openai.client';
import { AnthropicClient } from '../../src/services/anthropic.client';
import { MistralAIClient } from '../../src/services/mistral.client';
import { ArchitecturalPlanEngine } from '../../src/engines/architectural-plan.engine';

// Configuración del test
const TEST_PLAN_DIRECTORY = path.join(__dirname, 'test-plans');
const TEST_OUTPUT_DIRECTORY = path.join(__dirname, 'results');

// Asegurar que existan los directorios
if (!fs.existsSync(TEST_PLAN_DIRECTORY)) {
  fs.mkdirSync(TEST_PLAN_DIRECTORY, { recursive: true });
  console.log(`Creado directorio de prueba: ${TEST_PLAN_DIRECTORY}`);
}

if (!fs.existsSync(TEST_OUTPUT_DIRECTORY)) {
  fs.mkdirSync(TEST_OUTPUT_DIRECTORY, { recursive: true });
  console.log(`Creado directorio de resultados: ${TEST_OUTPUT_DIRECTORY}`);
}

/**
 * Función principal de prueba
 */
async function testArchitecturalPlanEngine() {
  console.log('=== Iniciando prueba de ArchitecturalPlanEngine con integración Mistral AI ===');
  
  // Verificar API keys
  console.log('\nVerificando configuración de APIs:');
  console.log(`- OpenAI API Key:    ${config.openai.apiKey ? 'Configurada ✅' : 'No configurada ❌'}`);
  console.log(`- Anthropic API Key: ${config.anthropic.apiKey ? 'Configurada ✅' : 'No configurada ❌'}`);
  console.log(`- Mistral API Key:   ${config.mistral?.apiKey ? 'Configurada ✅' : 'No configurada ❌'}`);
  
  // Verificar archivos de prueba
  const testFiles = getTestFiles();
  if (testFiles.length === 0) {
    console.log('\n⚠️ No se encontraron archivos de prueba en:', TEST_PLAN_DIRECTORY);
    console.log('Por favor, coloca archivos de planos arquitectónicos (.pdf, .jpg, .png) en el directorio de pruebas.');
    return;
  }
  
  console.log(`\nEncontrados ${testFiles.length} archivos de prueba:`);
  testFiles.forEach(file => console.log(`- ${file}`));
  
  // Inicializar clientes
  const openAIClient = new OpenAIClient(config.openai.apiKey || '');
  const anthropicClient = new AnthropicClient(config.anthropic.apiKey || '');
  
  // Probar con y sin Mistral AI para comparar resultados
  await runTestsWithMistral(testFiles, openAIClient, anthropicClient);
  await runTestsWithoutMistral(testFiles, openAIClient, anthropicClient);
  
  console.log('\n=== Prueba de ArchitecturalPlanEngine completada ===');
}

/**
 * Ejecuta pruebas utilizando Mistral AI
 */
async function runTestsWithMistral(
  testFiles: string[],
  openAIClient: OpenAIClient,
  anthropicClient: AnthropicClient
) {
  console.log('\n=== Ejecutando pruebas CON Mistral AI ===');
  
  // Inicializar cliente de Mistral
  const mistralClient = new MistralAIClient(config.mistral?.apiKey || '');
  
  // Inicializar motor con Mistral
  const architecturalPlanEngine = new ArchitecturalPlanEngine(
    openAIClient,
    anthropicClient,
    mistralClient
  );
  
  // Procesar cada archivo
  for (const file of testFiles) {
    const filePath = path.join(TEST_PLAN_DIRECTORY, file);
    const fileExt = path.extname(file).toLowerCase();
    
    console.log(`\nAnalizando plano arquitectónico (con Mistral): ${file}`);
    
    try {
      const startTime = Date.now();
      
      // Ejecutar análisis
      const result = await architecturalPlanEngine.analyzePlan(
        filePath,
        { zipCode: '90210', country: 'US' }, // Ubicación de ejemplo
        {
          projectType: 'general',
          processingId: `test_mistral_${Date.now()}`,
          forceReprocess: true
        }
      );
      
      const processingTime = Date.now() - startTime;
      
      // Guardar resultado
      const outputPath = path.join(TEST_OUTPUT_DIRECTORY, `mistral_${file.replace(/\.[^/.]+$/, '.json')}`);
      fs.writeFileSync(outputPath, JSON.stringify({
        source: file,
        processingTime,
        usedMistral: true,
        result
      }, null, 2));
      
      console.log(`✅ Análisis completado en ${processingTime / 1000} segundos`);
      console.log(`   Confianza: ${(result.metadata.confidenceScore * 100).toFixed(2)}%`);
      console.log(`   Elementos detectados: ${result.metadata.detectedFeatures.join(', ')}`);
      console.log(`   Resultado guardado en: ${outputPath}`);
    } catch (error: any) {
      console.error(`❌ Error al analizar ${file} con Mistral: ${error.message || 'Error desconocido'}`);
    }
  }
  
  // Limpieza
  await architecturalPlanEngine.terminate();
}

/**
 * Ejecuta pruebas sin utilizar Mistral AI (solo Tesseract)
 */
async function runTestsWithoutMistral(
  testFiles: string[],
  openAIClient: OpenAIClient,
  anthropicClient: AnthropicClient
) {
  console.log('\n=== Ejecutando pruebas SIN Mistral AI (solo Tesseract) ===');
  
  // Inicializar motor sin Mistral
  const architecturalPlanEngine = new ArchitecturalPlanEngine(
    openAIClient,
    anthropicClient
  );
  
  // Procesar cada archivo
  for (const file of testFiles) {
    const filePath = path.join(TEST_PLAN_DIRECTORY, file);
    const fileExt = path.extname(file).toLowerCase();
    
    console.log(`\nAnalizando plano arquitectónico (sin Mistral): ${file}`);
    
    try {
      const startTime = Date.now();
      
      // Ejecutar análisis
      const result = await architecturalPlanEngine.analyzePlan(
        filePath,
        { zipCode: '90210', country: 'US' }, // Ubicación de ejemplo
        {
          projectType: 'general',
          processingId: `test_tesseract_${Date.now()}`,
          forceReprocess: true
        }
      );
      
      const processingTime = Date.now() - startTime;
      
      // Guardar resultado
      const outputPath = path.join(TEST_OUTPUT_DIRECTORY, `tesseract_${file.replace(/\.[^/.]+$/, '.json')}`);
      fs.writeFileSync(outputPath, JSON.stringify({
        source: file,
        processingTime,
        usedMistral: false,
        result
      }, null, 2));
      
      console.log(`✅ Análisis completado en ${processingTime / 1000} segundos`);
      console.log(`   Confianza: ${(result.metadata.confidenceScore * 100).toFixed(2)}%`);
      console.log(`   Elementos detectados: ${result.metadata.detectedFeatures.join(', ')}`);
      console.log(`   Resultado guardado en: ${outputPath}`);
    } catch (error: any) {
      console.error(`❌ Error al analizar ${file} sin Mistral: ${error.message || 'Error desconocido'}`);
    }
  }
  
  // Limpieza
  await architecturalPlanEngine.terminate();
}

/**
 * Obtiene la lista de archivos de prueba
 */
function getTestFiles(): string[] {
  try {
    return fs.readdirSync(TEST_PLAN_DIRECTORY).filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff'].includes(ext);
    });
  } catch (error) {
    console.error('Error al leer directorio de pruebas:', error);
    return [];
  }
}

// Ejecutar la función principal
testArchitecturalPlanEngine()
  .then(() => {
    console.log('\nPrueba completada correctamente');
  })
  .catch(error => {
    console.error('Error durante la prueba:', error);
    process.exit(1);
  });