import express from 'express';
import path from 'path';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { DeepSearchController } from './api/deepsearch.controller';
import { OpenAIClient } from './services/openai.client';
import { AnthropicClient } from './services/anthropic.client';
import { PriceApiService } from './services/price-api.service';
import { PriceResearchService } from './services/price-research.service';
import { ConstructionMethodService } from './services/construction-method.service';
import { ConstructionMethodCacheService } from './services/construction-method-cache.service';
import { PersistentCacheService } from './services/persistent-cache.service';
import { ApiUsageService } from './services/api-usage.service';
import { config } from './config/config';

// Configuración de Express con seguridad mejorada
const app = express();
const PORT = config.server.port;

// Middleware de seguridad
app.use(helmet()); // Protección básica de seguridad HTTP
app.use(express.json({ limit: '1mb' })); // Limitar tamaño de payload JSON
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Configuración de rate limiting para prevenir abusos
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: config.server.apiRateLimit, // Límite de peticiones por ventana
  standardHeaders: true, // Devolver info en headers X-RateLimit-*
  legacyHeaders: false,
  message: 'Demasiadas peticiones, por favor intenta más tarde'
});

// Aplicar rate limiting a rutas de API
app.use('/api/', apiLimiter);

// Configurar EJS para vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar servicio de monitoreo de API
const apiUsageService = new ApiUsageService();

// Inicializar servicios con sistema de monitoreo
const openAIClient = new OpenAIClient(config.openai.apiKey);
const anthropicClient = new AnthropicClient(config.anthropic.apiKey);
const constructionMethodCache = new ConstructionMethodCacheService();
const constructionMethodService = new ConstructionMethodService(anthropicClient, constructionMethodCache);
const priceApiService = new PriceApiService();
const priceResearchService = new PriceResearchService(openAIClient);

// Crear instancia del motor DeepSearch mejorado
const deepSearchEngine = new DeepSearchEngine(
  openAIClient,
  anthropicClient,
  priceApiService,
  priceResearchService,
  constructionMethodService
);

// Instanciar controlador
const deepSearchController = new DeepSearchController(deepSearchEngine);

// Middleware para registrar uso de API (logging)
app.use((req, res, next) => {
  // Loggear peticiones a rutas de API
  if (req.path.startsWith('/api/')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// Middleware para verificar estado de API keys antes de procesar peticiones
app.use('/api/deepsearch/', (req, res, next) => {
  const openaiSafe = apiUsageService.isSafeToUseOpenAI();
  const anthropicSafe = apiUsageService.isSafeToUseAnthropic();
  
  if (!openaiSafe || !anthropicSafe) {
    return res.status(503).json({
      error: 'Servicio temporalmente no disponible debido a límites de API',
      details: !openaiSafe ? 'Límite de OpenAI excedido' : 'Límite de Anthropic excedido',
      usageStats: apiUsageService.getUsageStats()
    });
  }
  
  next();
});

// Ruta principal
app.get('/', (req, res) => {
  res.render('deepsearch-test', {
    title: 'DeepSearch Engine - Interfaz de Pruebas'
  });
});

// Ruta para la página de configuración de precios
app.get('/config/prices', (req, res) => {
  res.render('price-configuration', {
    title: 'Configuración de Precios - Owl Fence Estimator'
  });
});

// Nueva ruta para estadísticas de uso de API
app.get('/admin/api-usage', (req, res) => {
  res.json(apiUsageService.getUsageStats());
});

// Rutas de API para DeepSearch Engine
app.post('/api/deepsearch/analyze', (req, res) => deepSearchController.analyzeProject(req, res));
app.get('/api/deepsearch/project-types', DeepSearchController.getProjectTypes);

// Rutas para gestión de precios por pie lineal
app.get('/api/deepsearch/prices', (req, res) => deepSearchController.getLinearFootPrices(req, res));
app.post('/api/deepsearch/prices', (req, res) => deepSearchController.updateLinearFootPrices(req, res));

// Middleware para manejar errores de forma centralizada
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error no controlado:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: config.server.env === 'development' ? err.message : 'Algo salió mal'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT} (${config.server.env})`);
  console.log(`Monitoreo de API: ${apiUsageService.getUsageStats().openai.calls} llamadas a OpenAI`);
});