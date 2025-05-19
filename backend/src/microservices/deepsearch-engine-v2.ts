import { MicroserviceBase, MessageBroker } from '../architecture/microservices-architecture';
import { AIServiceV2 } from '../services/ai-service-v2';
import { TieredCacheService } from '../services/tiered-cache.service';
import { ServiceFactory } from '../factories/service.factory';
import { ModelPriority, ModelSelectionStrategy, TaskType } from '../utils/model-selection';
import { ResilienceStrategies } from '../utils/resilience';
import { Logger } from '../utils/logger';
import { AICompletionOptions } from '../interfaces/ai-provider.interfaces';
import { CacheTier } from '../interfaces/cache.interfaces';
import * as crypto from 'crypto';

/**
 * DeepSearchEngine V2 - Enhanced with caching, resilience strategies, and new AI provider structure
 * This is an improved version of the original DeepSearchEngine with better performance and reliability
 */
export class DeepSearchEngineV2 extends MicroserviceBase {
  private aiService: AIServiceV2;
  private cacheService: TieredCacheService;
  private logger: Logger;
  
  constructor(
    private readonly messageBroker: MessageBroker
  ) {
    super('DeepSearchEngineV2', '2.0.0');
    
    // Get services from factory
    this.aiService = ServiceFactory.getAIServiceV2();
    this.cacheService = ServiceFactory.getTieredCacheService();
    this.logger = new Logger('DeepSearchEngineV2');
    
    // Configure message handlers
    this.configureBrokerSubscriptions();
  }
  
  /**
   * Configure message broker subscriptions
   */
  private configureBrokerSubscriptions(): void {
    this.messageBroker.subscribe('deepsearch.search', this.handleDeepSearch.bind(this));
    this.messageBroker.subscribe('deepsearch.generate-estimate', this.handleGenerateEstimate.bind(this));
    this.messageBroker.subscribe('deepsearch.validate-dimensions', this.handleValidateDimensions.bind(this));
    this.messageBroker.subscribe('deepsearch.suggest-materials', this.handleSuggestMaterials.bind(this));
    this.messageBroker.subscribe('deepsearch.optimize-costs', this.handleOptimizeCosts.bind(this));
  }
  
  /**
   * Handle deep search requests
   */
  private async handleDeepSearch(message: any): Promise<void> {
    const { requestId, searchQuery, options } = message;
    
    this.logger.info(`Processing deep search: ${searchQuery}`);
    
    try {
      // Generate cache key
      const cacheKey = `deepsearch:${this.generateCacheKey(searchQuery, options)}`;
      
      // Try to get from cache first
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.logger.info(`Using cached deep search results for query`);
        
        // Publish cached results
        await this.messageBroker.publish('deepsearch.results', {
          requestId,
          results: cachedResult,
          success: true,
          fromCache: true
        });
        
        return;
      }
      
      // Execute the deep search with resilience strategies
      const results = await ResilienceStrategies.withCircuitBreaker(
        async () => this.performDeepSearch(searchQuery, options),
        {
          circuitName: 'deepsearch-engine',
          failureThreshold: 3,
          resetTimeoutMs: 30000
        }
      );
      
      // Cache the results
      await this.cacheService.set(cacheKey, results, 3600, [CacheTier.MEMORY, CacheTier.PERSISTENT]); // Cache for 1 hour
      
      // Publish results
      await this.messageBroker.publish('deepsearch.results', {
        requestId,
        results,
        success: true
      });
    } catch (error) {
      this.logger.error(`Error in deep search: ${error instanceof Error ? error.message : String(error)}`);
      
      // Publish error
      await this.messageBroker.publish('deepsearch.error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Perform a deep search using AI
   */
  private async performDeepSearch(searchQuery: string, options: any = {}): Promise<any> {
    // Prepare search prompt
    const prompt = `
    Execute a deep search for the following query related to a construction project:
    ${searchQuery}
    
    ${options.context ? `Additional context: ${JSON.stringify(options.context)}` : ''}
    
    Please include in your search:
    1. Relevant materials for this construction need
    2. Recommended approaches or techniques
    3. Cost considerations and factors
    4. Common challenges and solutions
    5. Regulatory or compliance aspects to consider
    
    Return a comprehensive, structured JSON response containing detailed search results.
    `;
    
    // Select appropriate model based on query complexity
    const modelSelection = ModelSelectionStrategy.selectModel({
      taskType: TaskType.COMPLEX_REASONING,
      priority: ModelPriority.QUALITY,
      requiresJsonOutput: true,
      requiresHighAccuracy: true,
      inputTokens: ModelSelectionStrategy.estimateTokenCount(prompt)
    });
    
    // Configure AI completion options
    const completionOptions: AICompletionOptions = {
      prompt,
      model: modelSelection.model,
      temperature: modelSelection.temperature,
      responseFormat: 'json_object',
      systemMessage: 'You are a specialized construction search engine that provides detailed, accurate information about construction materials, methods, and costs.',
      useFallback: true,
      retry: {
        maxRetries: 2,
        baseDelayMs: 1000
      }
    };
    
    // Use retry strategy for the AI call
    const response = await ResilienceStrategies.withRetry(
      () => this.aiService.completeText(completionOptions),
      {
        maxRetries: 3,
        baseDelayMs: 1000
      }
    );
    
    // Parse the response
    try {
      return JSON.parse(response);
    } catch (parseError) {
      this.logger.error('Error parsing JSON response from AI', parseError);
      
      // Try to extract JSON if it's within code blocks
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || 
                        response.match(/```\n([\s\S]*?)\n```/);
      
      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1]);
      }
      
      throw new Error('Could not get a valid JSON response');
    }
  }
  
  /**
   * Handle estimate generation requests
   */
  private async handleGenerateEstimate(message: any): Promise<void> {
    const { requestId, projectSpec, options } = message;
    
    this.logger.info(`Generating estimate for project`);
    
    try {
      // Generate cache key
      const cacheKey = `estimate:${this.generateCacheKey(JSON.stringify(projectSpec), options)}`;
      
      // Try to get from cache first
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.logger.info(`Using cached estimate for project`);
        
        // Publish cached results
        await this.messageBroker.publish('deepsearch.estimate-generated', {
          requestId,
          estimate: cachedResult,
          success: true,
          fromCache: true
        });
        
        return;
      }
      
      // Generate the estimate with resilience strategies
      const estimate = await ResilienceStrategies.withCircuitBreaker(
        async () => this.generateProjectEstimate(projectSpec, options),
        {
          circuitName: 'estimate-generator',
          failureThreshold: 3,
          resetTimeoutMs: 30000
        }
      );
      
      // Cache the estimate
      await this.cacheService.set(cacheKey, estimate, 86400, [CacheTier.MEMORY, CacheTier.PERSISTENT]); // Cache for 24 hours
      
      // Publish results
      await this.messageBroker.publish('deepsearch.estimate-generated', {
        requestId,
        estimate,
        success: true
      });
    } catch (error) {
      this.logger.error(`Error generating estimate: ${error instanceof Error ? error.message : String(error)}`);
      
      // Publish error
      await this.messageBroker.publish('deepsearch.estimate-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Generate a project estimate using AI
   */
  private async generateProjectEstimate(projectSpec: any, options: any = {}): Promise<any> {
    // Implementation would be similar to performDeepSearch but focused on estimate generation
    // This would involve model selection, AI completion, and parsing with resilience strategies
    
    // This is a placeholder implementation - in a real system this would be more comprehensive
    return {
      totalCost: 0,
      materials: [],
      labor: [],
      timeline: {}
    };
  }
  
  /**
   * Handle dimension validation requests
   */
  private async handleValidateDimensions(message: any): Promise<void> {
    // Implementation similar to other handlers with caching and resilience
  }
  
  /**
   * Handle material suggestions requests
   */
  private async handleSuggestMaterials(message: any): Promise<void> {
    // Implementation similar to other handlers with caching and resilience
  }
  
  /**
   * Handle cost optimization requests
   */
  private async handleOptimizeCosts(message: any): Promise<void> {
    // Implementation similar to other handlers with caching and resilience
  }
  
  /**
   * Generate a unique cache key based on input and options
   */
  private generateCacheKey(input: string, options?: any): string {
    const dataToHash = {
      input: input.length > 100 ? input.substring(0, 100) : input,
      options
    };
    
    return crypto
      .createHash('md5')
      .update(JSON.stringify(dataToHash))
      .digest('hex');
  }
}
