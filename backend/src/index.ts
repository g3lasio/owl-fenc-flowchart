import express from 'express';
import cors from 'cors';
import { config } from './config/config';
import { MaterialCacheService } from './services/cache.service';
import { MockPriceAPIClient } from './services/price-api.service';
import { MaterialEngine } from './engines/materials/material.engine';

// Crear instancia de Express
const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Inicializar servicios
const materialCache = new MaterialCacheService(config.cache.ttl.materials);

// En ambiente de desarrollo, usamos un mock de API de precios
const priceClients = [new MockPriceAPIClient()];

// Inicializar motor de materiales
const materialEngine = new MaterialEngine(materialCache, priceClients);

// Rutas
app.get('/', (req, res) => {
  res.send('API del Motor DeepSearch para Owl Fence Estimator');
});

// Ruta para probar el motor de materiales
app.post('/api/materials/calculate', async (req, res) => {
  try {
    const projectDetails = req.body;
    
    // Validar entrada
    if (!projectDetails.fenceType || !projectDetails.dimensions || !projectDetails.location) {
      return res.status(400).json({
        error: 'Datos de proyecto incompletos. Se requiere fenceType, dimensions y location.'
      });
    }
    
    // Calcular materiales
    const materialsResult = await materialEngine.calculateMaterials(projectDetails);
    
    res.json(materialsResult);
  } catch (error) {
    console.error('Error al calcular materiales:', error);
    res.status(500).json({
      error: 'Error al calcular materiales',
      message: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
});

// Iniciar servidor
const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`Servidor DeepSearch iniciado en http://localhost:${PORT}`);
  console.log(`Ambiente: ${config.server.env}`);
});

// Manejar señales de terminación
process.on('SIGINT', () => {
  console.log('Servidor terminado.');
  process.exit(0);
});

export default app;