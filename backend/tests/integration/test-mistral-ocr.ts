/**
 * Prueba dedicada al cliente de Mistral AI y su capacidad OCR
 * Este test evalúa sistemáticamente las capacidades de OCR y análisis
 * de planos arquitectónicos usando Mistral AI.
 */
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../../src/config/config';
import { MistralAIClient } from '../../src/services/mistral.client';

// Configuración del test
const TEST_PLAN_DIRECTORY = path.join(__dirname, 'test-plans');
const TEST_OUTPUT_DIRECTORY = path.join(__dirname, 'results');
const SAMPLES_DIRECTORY = path.join(__dirname, '../../../samples estimates');

// Estructura para resultados de pruebas
interface TestResult {
  fileName: string;
  success: boolean;
  processingTimeMs: number;
  ocrTextLength?: number;
  detailedOcrTextLength?: number;
  blueprintAnalysisValid?: boolean;
  error?: string;
}

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
async function testMistralAIOCR() {
  console.log('=== Iniciando prueba de Mistral AI OCR ===');
  
  // Verificar API key
  console.log(`\nVerificando configuración de API de Mistral:`);
  console.log(`- Mistral API Key: ${config.mistral?.apiKey ? 'Configurada ✅' : 'No configurada ❌'}`);
  
  if (!config.mistral?.apiKey) {
    console.error('Error: No se ha configurado la API key de Mistral. Por favor configúrala en el archivo .env');
    return;
  }

  // Verificar si debemos copiar muestras automáticamente
  await setupTestSamples();
  
  // Verificar archivos de prueba
  const testFiles = getTestFiles();
  if (testFiles.length === 0) {
    console.log('\n⚠️ No se encontraron archivos de prueba en:', TEST_PLAN_DIRECTORY);
    console.log('Por favor, coloca archivos de planos arquitectónicos (.pdf, .jpg, .png) en el directorio de pruebas.');
    return;
  }
  
  console.log(`\nEncontrados ${testFiles.length} archivos de prueba:`);
  testFiles.forEach(file => console.log(`- ${file}`));
  
  // Inicializar cliente de Mistral
  const mistralClient = new MistralAIClient(config.mistral.apiKey);
  
  // Array para almacenar resultados
  const results: TestResult[] = [];
  let successCount = 0;
  let failureCount = 0;
  let totalProcessingTime = 0;
  
  // Procesar cada archivo
  for (const file of testFiles) {
    const filePath = path.join(TEST_PLAN_DIRECTORY, file);
    const fileExt = path.extname(file).toLowerCase();
    
    // Solo probamos imágenes y PDFs
    if (!['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.pdf'].includes(fileExt)) {
      console.log(`\nSaltando archivo ${file} - formato no soportado.`);
      continue;
    }
    
    if (fileExt === '.pdf') {
      console.log(`\nNota: El archivo ${file} es un PDF. Para procesamiento completo, considera convertirlo a imagen.`);
      // Aquí podrías añadir código para convertir PDFs a imágenes
    }
    
    console.log(`\n📄 Analizando: ${file}`);
    
    try {
      // Leer imagen
      const imageBuffer = fs.readFileSync(filePath);
      const startTime = Date.now();
      const testResult: TestResult = {
        fileName: file,
        success: false,
        processingTimeMs: 0
      };
      
      // 1. Prueba de extracción de texto OCR básico
      console.log('⏳ Ejecutando OCR básico...');
      const ocrResult = await mistralClient.performOCR({
        imageBuffer,
        detailed: false
      });
      testResult.ocrTextLength = ocrResult.length;
      
      // 2. Prueba de OCR detallado para planos arquitectónicos
      console.log('⏳ Ejecutando OCR especializado para planos...');
      const detailedOcrResult = await mistralClient.performOCR({
        imageBuffer,
        detailed: true
      });
      testResult.detailedOcrTextLength = detailedOcrResult.length;
      
      // 3. Prueba de análisis completo de plano
      console.log('⏳ Ejecutando análisis completo de plano...');
      const blueprintAnalysis = await mistralClient.analyzeBlueprintImage({
        imageBuffer,
        projectType: 'fencing',
        outputFormat: 'json'
      });
      
      testResult.blueprintAnalysisValid = !!blueprintAnalysis && 
                                         typeof blueprintAnalysis === 'object' &&
                                         Object.keys(blueprintAnalysis).length > 0;
      
      const processingTime = Date.now() - startTime;
      testResult.processingTimeMs = processingTime;
      testResult.success = true;
      totalProcessingTime += processingTime;
      
      // Guardar resultados
      const outputBasePath = path.join(TEST_OUTPUT_DIRECTORY, path.basename(file, fileExt));
      
      fs.writeFileSync(`${outputBasePath}_ocr.txt`, ocrResult);
      fs.writeFileSync(`${outputBasePath}_detailed_ocr.txt`, detailedOcrResult);
      fs.writeFileSync(`${outputBasePath}_analysis.json`, JSON.stringify(blueprintAnalysis, null, 2));
      
      // Evaluar calidad de los resultados
      const ocrQuality = evaluateOcrQuality(ocrResult, detailedOcrResult);
      
      // Resumen
      console.log(`✅ Análisis completado en ${(processingTime / 1000).toFixed(2)} segundos`);
      console.log(`   - Texto OCR básico: ${ocrResult.length} caracteres (${ocrQuality.basicScore}/10)`);
      console.log(`   - Texto OCR detallado: ${detailedOcrResult.length} caracteres (${ocrQuality.detailedScore}/10)`);
      console.log(`   - Análisis JSON: ${testResult.blueprintAnalysisValid ? 'Válido ✅' : 'Inválido ❌'}`);
      
      successCount++;
      results.push(testResult);
      
    } catch (error: any) {
      console.error(`❌ Error al analizar ${file}:`, error.message || 'Error desconocido');
      results.push({
        fileName: file,
        success: false,
        processingTimeMs: 0,
        error: error.message || 'Error desconocido'
      });
      failureCount++;
    }
  }
  
  // Generar reporte de pruebas
  generateTestReport(results, successCount, failureCount, totalProcessingTime);
  
  console.log('\n=== Prueba de Mistral AI OCR completada ===');
}

/**
 * Configura muestras de prueba copiando desde el directorio de muestras si está disponible
 */
async function setupTestSamples() {
  // Verificar si hay PDFs de muestra
  if (fs.existsSync(SAMPLES_DIRECTORY)) {
    const sampleFiles = fs.readdirSync(SAMPLES_DIRECTORY).filter(file => {
      return path.extname(file).toLowerCase() === '.pdf';
    });
    
    // Si no hay archivos en el directorio de pruebas, copiar algunos
    const existingTestFiles = getTestFiles();
    if (existingTestFiles.length === 0 && sampleFiles.length > 0) {
      console.log('\nCopiando PDFs de muestra al directorio de pruebas...');
      
      // Copiar hasta 3 PDFs de muestra
      const filesToCopy = sampleFiles.slice(0, 3);
      for (const file of filesToCopy) {
        const sourcePath = path.join(SAMPLES_DIRECTORY, file);
        const destPath = path.join(TEST_PLAN_DIRECTORY, file);
        fs.copyFileSync(sourcePath, destPath);
        console.log(`- Copiado: ${file}`);
      }
    }
  }
}

/**
 * Evalúa la calidad del OCR basándose en heurísticas simples
 */
function evaluateOcrQuality(basicOcr: string, detailedOcr: string) {
  // Estas son heurísticas simples, se podrían mejorar
  const basicScore = Math.min(10, Math.max(1, Math.floor(basicOcr.length / 100)));
  
  // El OCR detallado debería ser más completo
  const detailedScore = Math.min(10, Math.max(1, Math.floor(detailedOcr.length / 150)));
  
  return {
    basicScore,
    detailedScore
  };
}

/**
 * Genera un reporte HTML con los resultados de las pruebas
 */
function generateTestReport(
  results: TestResult[], 
  successCount: number, 
  failureCount: number,
  totalProcessingTime: number
) {
  const reportPath = path.join(TEST_OUTPUT_DIRECTORY, 'test-report.html');
  const jsonReportPath = path.join(TEST_OUTPUT_DIRECTORY, 'test-report.json');
  
  // Guardar resultados en JSON
  fs.writeFileSync(jsonReportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      success: successCount,
      failure: failureCount,
      successRate: results.length > 0 ? (successCount / results.length * 100).toFixed(2) + '%' : '0%',
      averageProcessingTime: results.length > 0 ? (totalProcessingTime / results.length / 1000).toFixed(2) + 's' : '0s'
    },
    results
  }, null, 2));
  
  // Crear reporte HTML
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Reporte de Pruebas Mistral AI OCR</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
      h1 { color: #333; }
      .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
      .success { color: green; }
      .failure { color: red; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
      th { background-color: #f2f2f2; }
      tr:hover { background-color: #f5f5f5; }
    </style>
  </head>
  <body>
    <h1>Reporte de Pruebas Mistral AI OCR</h1>
    <div class="summary">
      <p>Fecha: ${new Date().toLocaleString()}</p>
      <p>Total de pruebas: ${results.length}</p>
      <p>Exitosas: <span class="success">${successCount}</span></p>
      <p>Fallidas: <span class="failure">${failureCount}</span></p>
      <p>Tasa de éxito: ${results.length > 0 ? (successCount / results.length * 100).toFixed(2) + '%' : '0%'}</p>
      <p>Tiempo promedio de procesamiento: ${results.length > 0 ? (totalProcessingTime / results.length / 1000).toFixed(2) + 's' : '0s'}</p>
    </div>
    
    <h2>Resultados detallados</h2>
    <table>
      <tr>
        <th>Archivo</th>
        <th>Estado</th>
        <th>Tiempo (ms)</th>
        <th>Carac. OCR</th>
        <th>Carac. OCR detallado</th>
        <th>JSON Válido</th>
        <th>Error</th>
      </tr>
      ${results.map(r => `
      <tr>
        <td>${r.fileName}</td>
        <td>${r.success ? '<span class="success">✓</span>' : '<span class="failure">✗</span>'}</td>
        <td>${r.processingTimeMs}</td>
        <td>${r.ocrTextLength || 'N/A'}</td>
        <td>${r.detailedOcrTextLength || 'N/A'}</td>
        <td>${r.blueprintAnalysisValid === undefined ? 'N/A' : (r.blueprintAnalysisValid ? '<span class="success">✓</span>' : '<span class="failure">✗</span>')}</td>
        <td>${r.error || ''}</td>
      </tr>
      `).join('')}
    </table>
  </body>
  </html>
  `;
  
  fs.writeFileSync(reportPath, html);
  console.log(`\n📊 Reporte de pruebas generado: ${reportPath}`);
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
testMistralAIOCR()
  .then(() => {
    console.log('\nPrueba completada correctamente');
  })
  .catch(error => {
    console.error('Error durante la prueba:', error);
    process.exit(1);
  });