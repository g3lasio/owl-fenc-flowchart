/**
 * Script de prueba rápida para el cliente Mistral OCR
 * Este script prueba la funcionalidad básica con una muestra
 */
import * as fs from 'fs';
import * as path from 'path';
import { config } from './src/config/config';
import { MistralAIClient } from './src/services/mistral.client';

async function runQuickMistralTest() {
  console.log('=== Prueba Rápida de Mistral AI OCR ===');
  
  // Verificar configuración
  console.log('\nVerificando configuración:');
  if (!config.mistral?.apiKey) {
    console.log('⚠️ No se encontró una API key de Mistral en la configuración.');
    console.log('Por favor, configura una API key temporal para las pruebas:');
    console.log('Puedes ingresarla a continuación:');
    
    // Método simple para leer entrada desde terminal
    const apiKey = await new Promise<string>((resolve) => {
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (data) => {
        resolve(data.toString().trim());
        process.stdin.pause();
      });
    });
    
    if (!apiKey) {
      console.log('❌ No se proporcionó una API key. Terminando prueba.');
      return;
    }
    
    config.mistral = { apiKey };
    console.log('✅ API key configurada temporalmente.');
  } else {
    console.log('✅ API key encontrada en la configuración.');
  }
  
  // Crear cliente
  const mistralClient = new MistralAIClient(config.mistral.apiKey);
  
  // Buscar una muestra para la prueba
  console.log('\nBuscando un archivo de muestra...');
  
  // Lista de posibles ubicaciones para encontrar archivos de muestra
  const possibleSampleDirs = [
    path.join(__dirname, '../samples estimates'),
    path.join(__dirname, 'tests/integration/test-plans'),
    path.join(__dirname, 'tests/samples')
  ];
  
  let sampleFile: string | null = null;
  
  for (const dir of possibleSampleDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.pdf'].includes(ext);
      });
      
      if (files.length > 0) {
        sampleFile = path.join(dir, files[0]);
        break;
      }
    }
  }
  
  // Si no encontramos ninguna muestra, creamos un archivo básico para pruebas
  if (!sampleFile) {
    console.log('⚠️ No se encontraron archivos de muestra.');
    console.log('Creando una imagen de prueba simple...');
    
    // Directorio para pruebas
    const testDir = path.join(__dirname, 'tests/samples');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Generamos un archivo de texto con contenido para pruebas
    const testFilePath = path.join(testDir, 'test-sample.txt');
    fs.writeFileSync(testFilePath, 'Este es un archivo de prueba para Mistral OCR.\nCon múltiples líneas de texto.\nPara validar la funcionalidad.');
    
    sampleFile = testFilePath;
    console.log(`✅ Archivo de prueba creado: ${sampleFile}`);
  } else {
    console.log(`✅ Archivo de muestra encontrado: ${sampleFile}`);
  }
  
  // Leer archivo
  const fileBuffer = fs.readFileSync(sampleFile);
  
  console.log('\n🔄 Ejecutando prueba de texto básico...');
  try {
    const result = await mistralClient.complete({
      prompt: 'Saluda en español y explica brevemente qué puede hacer el sistema de OCR para planos arquitectónicos.',
      maxTokens: 200
    });
    
    console.log('\n=== Resultado de prueba de texto ===');
    console.log(result);
    console.log('==================================');
  } catch (error: any) {
    console.error('❌ Error en prueba de texto:', error.message);
  }
  
  // Si es un archivo compatible, probar OCR
  const ext = path.extname(sampleFile).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.pdf'].includes(ext)) {
    console.log('\n🔄 Ejecutando prueba de OCR básico...');
    try {
      const ocrResult = await mistralClient.performOCR({
        imageBuffer: fileBuffer,
        detailed: false
      });
      
      console.log('\n=== Resultado de OCR básico ===');
      console.log(ocrResult.substring(0, 500) + (ocrResult.length > 500 ? '...(truncado)' : ''));
      console.log('=============================');
      
      console.log('\n🔄 Ejecutando prueba de OCR detallado...');
      const detailedResult = await mistralClient.performOCR({
        imageBuffer: fileBuffer,
        detailed: true
      });
      
      console.log('\n=== Resultado de OCR detallado ===');
      console.log(detailedResult.substring(0, 500) + (detailedResult.length > 500 ? '...(truncado)' : ''));
      console.log('================================');
      
      console.log('\n🔄 Ejecutando análisis de plano...');
      const blueprintResult = await mistralClient.analyzeBlueprintImage({
        imageBuffer: fileBuffer,
        projectType: 'fencing',
        outputFormat: 'json'
      });
      
      console.log('\n=== Resultado de análisis de plano ===');
      console.log(typeof blueprintResult === 'object' 
        ? JSON.stringify(blueprintResult, null, 2) 
        : blueprintResult.substring(0, 500) + (blueprintResult.length > 500 ? '...(truncado)' : ''));
      console.log('====================================');
    } catch (error: any) {
      console.error('❌ Error en prueba de OCR:', error.message);
    }
  } else {
    console.log(`\n⚠️ El archivo ${sampleFile} no es una imagen o PDF. No se realizará prueba de OCR.`);
  }
  
  console.log('\n✅ Prueba completada.');
}

// Ejecutar la prueba
runQuickMistralTest()
  .then(() => {
    console.log('\nPrueba finalizada con éxito.');
  })
  .catch(error => {
    console.error('Error durante la prueba:', error);
  });