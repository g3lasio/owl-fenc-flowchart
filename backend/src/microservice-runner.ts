/**
 * Microservice Runner
 * 
 * This script starts a specific microservice based on the passed argument
 * Used as the entry point in Docker containers
 * 
 * Refactored to use the ServiceFactory for proper dependency injection
 */

import { config } from './config/config';
import { MessageBroker } from './architecture/microservices-architecture';
import { ServiceFactory } from './factories/service.factory';

// Get the service to start from arguments
const serviceArg = process.argv[2];

if (!serviceArg) {
  console.error('Error: You must specify the service to start as an argument');
  console.error('Usage: node microservice-runner.js <service-name>');
  console.error('Available services: deepsearch-engine, unstructured-input, error-handler, adaptive-learning');
  process.exit(1);
}

// Initialize service factory
console.log(`Initializing service factory for microservice: ${serviceArg}`);
const serviceFactory = ServiceFactory.getInstance();
const messageBroker = serviceFactory.getMessageBroker();

// Start the corresponding service
async function startService() {
  console.log(`Starting microservice: ${serviceArg}`);

  switch (serviceArg) {
    case 'deepsearch-engine':
      serviceFactory.createDeepSearchEngine();
      break;
      
    case 'unstructured-input':
      serviceFactory.createUnstructuredInputService();
      break;
      
    case 'error-handler':
      serviceFactory.createErrorHandlerService();
      break;
      
    case 'adaptive-learning':
      serviceFactory.createAdaptiveLearningService();
      break;
      
    default:
      console.error(`Error: Unknown service: ${serviceArg}`);
      console.error('Available services: deepsearch-engine, unstructured-input, error-handler, adaptive-learning');
      process.exit(1);
  }

  console.log(`Microservice ${serviceArg} started successfully`);

  // Configure process handlers for graceful shutdown
  setupProcessHandlers(messageBroker);
}

// Configure handlers for process signals
function setupProcessHandlers(messageBroker: MessageBroker) {
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM signal, closing connections...');
    await messageBroker.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Received SIGINT signal, closing connections...');
    await messageBroker.close();
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    // Log to error tracking service in production
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled promise rejection:', reason);
    // In production, we should log these to an error tracking service
  });
}

// Start the service
startService().catch(err => {
  console.error('Error starting the service:', err);
  process.exit(1);
});
