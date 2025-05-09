import express from 'express';
import path from 'path';
import { OpenAIClient } from './services/openai.client';
import { AnthropicClient } from './services/anthropic.client';
import { ChatController } from './api/chat.controller';
import { ManualEstimateController } from './api/manual-estimate.controller';
import { SimpleMervinEngine } from './engines/simple-mervin.engine';
import { config } from './config/config';

// Configuración de Express
const app = express();
const PORT = config.server.port || 3000;

// Middleware básicos
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Configurar EJS para vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar clientes de IA (opcionales)
const openAIClient = new OpenAIClient(config.openai?.apiKey || '');
const anthropicClient = new AnthropicClient(config.anthropic?.apiKey || '');

// Crear una instancia del motor simplificado de Mervin
const simpleMervinEngine = new SimpleMervinEngine(openAIClient, anthropicClient);

// Instanciar los controladores
const chatController = new ChatController(simpleMervinEngine);
const manualEstimateController = new ManualEstimateController(simpleMervinEngine);

// Middleware de logging
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/estimate/')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// Ruta principal - Redirigir a la interfaz de chat
app.get('/', (req, res) => {
  res.render('home', {
    title: 'Generador de Estimados',
    options: [
      { 
        title: 'Chat Asistido', 
        description: 'Hable con nuestro asistente para obtener un estimado personalizado',
        url: '/chat-dashboard',
        icon: 'chat'
      },
      { 
        title: 'Estimado Paso a Paso', 
        description: 'Cree un estimado guiado con un proceso simple de onboarding',
        url: '/estimate/start',
        icon: 'steps'
      }
    ]
  });
});

// Configurar rutas para los controladores
chatController.setupRoutes(app);
manualEstimateController.setupRoutes(app);

// Middleware para manejar errores
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error no controlado:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: config.server.env === 'development' ? err.message : 'Algo salió mal'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Dashboard de Chat con Mervin disponible en: http://localhost:${PORT}/chat-dashboard`);
  console.log(`Generador de estimados paso a paso disponible en: http://localhost:${PORT}/estimate/start`);
});