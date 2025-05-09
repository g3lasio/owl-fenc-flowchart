#!/usr/bin/env node

/**
 * Script mejorado para ejecutar el servidor de pruebas interactivo
 * Este script asegura que todos los directorios necesarios existan
 * y que el servidor se inicie correctamente
 */

const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

// Directorios necesarios
const rootDir = path.resolve(__dirname);
const toolsDir = path.join(rootDir, 'tools');
const uploadsDir = path.join(toolsDir, 'uploads');
const viewsDir = path.join(toolsDir, 'views');
const publicDir = path.join(toolsDir, 'public');

// Asegurar que existan los directorios
console.log('Verificando directorios necesarios...');
[uploadsDir, viewsDir, publicDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    console.log(`Creando directorio: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Verificar que el archivo de vista exista
const indexViewPath = path.join(viewsDir, 'index.ejs');
if (!fs.existsSync(indexViewPath)) {
  console.error('Error: No se encontró el archivo de vista EJS necesario.');
  console.error(`El archivo debería estar en: ${indexViewPath}`);
  console.error('Por favor, asegúrate de que el archivo exista antes de ejecutar el servidor.');
  process.exit(1);
}

// Instalar dependencias si es necesario
console.log('Verificando dependencias...');
try {
  require.resolve('express');
  require.resolve('ejs');
  require.resolve('multer');
} catch (e) {
  console.log('Instalando dependencias faltantes...');
  execSync('npm install express ejs multer', { stdio: 'inherit' });
}

// Ejecutar el servidor
console.log('\n=== Iniciando servidor de pruebas interactivo ===');
console.log('Esto abrirá una interfaz web donde podrás subir imágenes y PDFs');
console.log('para probar la funcionalidad OCR de Mistral AI\n');

const serverProcess = spawn('npx', ['ts-node', path.join(toolsDir, 'test-mistral-interactive.ts')], {
  stdio: 'inherit',
  detached: false
});

console.log(`\nServidor iniciado en http://localhost:3001`);
console.log('Presiona Ctrl+C para detener el servidor cuando hayas terminado');

// Manejar terminación limpia
process.on('SIGINT', () => {
  console.log('\nDeteniendo el servidor...');
  serverProcess.kill();
  process.exit(0);
});

serverProcess.on('error', (err) => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});

serverProcess.on('exit', (code) => {
  console.log(`El servidor se ha detenido con código: ${code}`);
  process.exit(code);
});