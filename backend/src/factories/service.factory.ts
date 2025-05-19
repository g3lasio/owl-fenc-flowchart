import { RabbitMQBroker, MessageBroker } from '../architecture/microservices-architecture';
import { DeepSearchEngine } from '../microservices/deepsearch-engine';
impor  /**
   * Get or create a TieredCacheService
   */
  public static getTieredCacheService(): TieredCacheService {
    // Lazy initialize a TieredCacheService if it doesn't exist yet
    if (!ServiceFactory.tieredCacheService) {
      // Create a new instance of TieredCacheService
      ServiceFactory.tieredCacheService = new TieredCacheService();
      
      // Configure the cache with default settings
      (ServiceFactory.tieredCacheService as any).memoryCacheDefaultTTL = config.cache.memoryCacheDefaultTTL || 300;
      (ServiceFactory.tieredCacheService as any).persistentCachePath = config.cache.cachePath;
      (ServiceFactory.tieredCacheService as any).persistentCacheDefaultTTL = config.cache.persistentCacheDefaultTTL || 86400;
      (ServiceFactory.tieredCacheService as any).distributedCacheEnabled = false;
    }
    
    return ServiceFactory.tieredCacheService;
  }gineV2 } from '../microservices/deepsearch-engine-v2';
import { UnstructuredInputService } from '../microservices/unstructured-input-service';
import { UnstructuredInputServiceV2 } from '../microservices/unstructured-input-service-v2';
import { ErrorHandlerService } from '../microservices/error-handler-service';
import { AdaptiveLearningService } from '../microservices/adaptive-learning-service';
import { AdaptiveLearningServiceV2 } from '../microservices/adaptive-learning-service-v2';
import { OpenAIClient } from '../services/openai.client';
import { AnthropicClient } from '../services/anthropic.client';
import { PersistentCacheService } from '../services/persistent-cache.service';
import { TieredCacheService } from '../services/tiered-cache.service';
import { ApiUsageService } from '../services/api-usage.service';
import { AIService } from '../services/ai-service';
import { AIServiceV2 } from '../services/ai-service-v2';
import { ContractorProfileService } from '../services/contractor-profile.service';
import { MaterialCalculatorV2 } from '../services/material-calculator-v2';
import { config } from '../config/config';

/**
 * Service Factory - Centralizes dependency injection and service initialization
 * This pattern simplifies service creation and ensures consistent dependency management
 */
export class ServiceFactory {
  private static instance: ServiceFactory;
  private messageBroker: MessageBroker;
  private openAIClient: OpenAIClient;
  private anthropicClient: AnthropicClient;
  private apiUsageService: ApiUsageService;
  private aiService: AIService;
  private aiServiceV2: AIServiceV2;

  // Singleton instance of TieredCacheService
  private static tieredCacheService: TieredCacheService;

  // Private constructor for singleton pattern
  private constructor(brokerUrl: string) {
    // Initialize core services
    this.messageBroker = new RabbitMQBroker(brokerUrl);
    this.apiUsageService = new ApiUsageService();
    
    // Initialize AI clients
    this.openAIClient = new OpenAIClient(config.openai.apiKey);
    this.anthropicClient = new AnthropicClient(config.anthropic.apiKey);
    
    // Initialize centralized AI service
    this.aiService = new AIService(
      this.openAIClient, 
      this.anthropicClient, 
      this.apiUsageService
    );
    
    // Initialize new AIServiceV2
    this.aiServiceV2 = new AIServiceV2(this.apiUsageService);
  }

  /**
   * Get singleton instance of ServiceFactory
   */
  public static getInstance(brokerUrl: string = process.env.RABBITMQ_URL || 'amqp://localhost'): ServiceFactory {
    if (!ServiceFactory.instance) {
      ServiceFactory.instance = new ServiceFactory(brokerUrl);
    }
    return ServiceFactory.instance;
  }

  /**
   * Get the message broker instance
   */
  public getMessageBroker(): MessageBroker {
    return this.messageBroker;
  }

  /**
   * Get the centralized AI service
   */
  public getAIService(): AIService {
    return this.aiService;
  }
  
  /**
   * Get the new centralized AI service based on providers
   */
  public getAIServiceV2(): AIServiceV2 {
    return this.aiServiceV2;
  }

  /**
   * Create DeepSearch Engine microservice with all dependencies
   */
  public createDeepSearchEngine(cachePath: string = process.env.CACHE_PATH || config.cache.cachePath): DeepSearchEngine {
    return new DeepSearchEngine(
      this.messageBroker,
      cachePath
    );
  }
  
  /**
   * Create DeepSearchEngineV2 with all dependencies
   * This version uses the AIServiceV2 with provider abstractions
   */
  public createDeepSearchEngineV2(): DeepSearchEngineV2 {
    // Get tiered cache service
    const cacheService = ServiceFactory.getTieredCacheService();
    
    return new DeepSearchEngineV2(
      this.messageBroker
    );
  }

  /**
   * Create Unstructured Input Service microservice with all dependencies
   */
  public createUnstructuredInputService(cachePath: string = process.env.CACHE_PATH || config.cache.cachePath): UnstructuredInputService {
    return new UnstructuredInputService(
      this.messageBroker,
      cachePath
    );
  }

  /**
   * Create UnstructuredInputServiceV2 with AIServiceV2 and TieredCacheService
   */
  public createUnstructuredInputServiceV2(): UnstructuredInputServiceV2 {
    return new UnstructuredInputServiceV2(
      this.messageBroker
    );
  }

  /**
   * Create Error Handler Service microservice
   */
  public createErrorHandlerService(): ErrorHandlerService {
    return new ErrorHandlerService(
      this.messageBroker
    );
  }

  /**
   * Create Adaptive Learning Service microservice with all dependencies
   */
  public createAdaptiveLearningService(cachePath: string = process.env.CACHE_PATH || config.cache.cachePath): AdaptiveLearningService {
    return new AdaptiveLearningService(
      this.messageBroker,
      cachePath
    );
  }
  
  /**
   * Create AdaptiveLearningServiceV2 with AIServiceV2 and TieredCacheService
   */
  public createAdaptiveLearningServiceV2(dataPath: string = process.env.DATA_PATH || './data/learning'): AdaptiveLearningServiceV2 {
    // Get tiered cache service
    const cacheService = ServiceFactory.getTieredCacheService();
    
    return new AdaptiveLearningServiceV2(
      this.messageBroker,
      dataPath
    );
  }

  /**
   * Create a persistent cache service
   */
  public createCacheService(cachePath: string = config.cache.cachePath): PersistentCacheService {
    return new PersistentCacheService(cachePath);
  }

  /**
   * Get or create a TieredCacheService
   */
  public static getTieredCacheService(): TieredCacheService {
    // Lazy initialize a TieredCacheService if it doesn't exist yet
    if (!ServiceFactory.tieredCacheService) {
      ServiceFactory.tieredCacheService = TieredCacheService.getInstance({
        memoryTTL: config.cache.memoryCacheDefaultTTL || 300,  // 5 minutes default
        persistentCachePath: config.cache.cachePath,
        persistentTTL: config.cache.persistentCacheDefaultTTL || 86400,  // 24 hours default
        distributedCacheEnabled: false // Not currently enabled
      });
    }
    
    return ServiceFactory.tieredCacheService;
  }

  /**
   * Create a contractor profile service
   */
  public createContractorProfileService(): ContractorProfileService {
    return new ContractorProfileService(this.openAIClient);
  }
}
