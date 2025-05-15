/**
 * Microservice Runner
 * 
 * Este script inicia un microservicio específico según el argumento pasado
 * Se utiliza como punto de entrada en los contenedores Docker
 */

import { config } from './config/config';
import { RabbitMQBroker } from './architecture/microservices-architecture';
import { DeepSearchEngine } from './microservices/deepsearch-engine';
import { UnstructuredInputService } from './microservices/unstructured-input-service';
import { ErrorHandlerService } from './microservices/error-handler-service';
import { AdaptiveLearningService } from './microservices/adaptive-learning-service';

// Obtener el servicio a iniciar desde los argumentos
const serviceArg = process.argv[2];

if (!serviceArg) {
  console.error('Error: Debe especificar el servicio a iniciar como argumento');
  console.error('Uso: node microservice-runner.js <service-name>');
  console.error('Servicios disponibles: deepsearch-engine, unstructured-input, error-handler, adaptive-learning');
  process.exit(1);
}

// Inicializar broker de mensajes
console.log(`Inicializando message broker para microservicio: ${serviceArg}`);

const brokerUrl = process.env.RABBITMQ_URL || 'amqp://localhost';
const messageBroker = new RabbitMQBroker(brokerUrl);

// Iniciar el servicio correspondiente
async function startService() {
  console.log(`Iniciando microservicio: ${serviceArg}`);

  switch (serviceArg) {
    case 'deepsearch-engine':
      new DeepSearchEngine(messageBroker, process.env.CACHE_PATH || config.cache.cachePath);
      break;
      
    case 'unstructured-input':
      new UnstructuredInputService(messageBroker, process.env.CACHE_PATH || config.cache.cachePath);
      break;
      
    case 'error-handler':
      new ErrorHandlerService(messageBroker);
      break;
      
    case 'adaptive-learning':
      new AdaptiveLearningService(messageBroker, process.env.CACHE_PATH || config.cache.cachePath);
      break;
      
    default:
      console.error(`Error: Servicio desconocido: ${serviceArg}`);
      console.error('Servicios disponibles: deepsearch-engine, unstructured-input, error-handler, adaptive-learning');
      process.exit(1);
  }

  console.log(`Microservicio ${serviceArg} iniciado correctamente`);

  // Configurar manejadores para terminación
  setupProcessHandlers();
}

// Configurar manejadores para señales de proceso
function setupProcessHandlers() {
  process.on('SIGTERM', async () => {
    console.log('Recibida señal SIGTERM, cerrando conexiones...');
    await messageBroker.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Recibida señal SIGINT, cerrando conexiones...');
    await messageBroker.close();
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    console.error('Error no capturado:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Rechazo de promesa no manejado:', reason);
  });
}

// Iniciar el servicio
startService().catch(err => {
  console.error('Error iniciando el servicio:', err);
  process.exit(1);
});
