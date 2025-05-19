// Example file: /workspaces/owl-fenc-flowchart/backend/examples/v2-services-example.ts

import { ServiceFactory } from '../src/factories/service.factory';
import { ResilienceStrategies } from '../src/utils/resilience';
import { ModelSelectionStrategy, TaskType, ModelPriority } from '../src/utils/model-selection';
import { CacheTier } from '../src/interfaces/cache.interfaces';

/**
 * This example demonstrates how to use the new V2 services with
 * caching, resilience strategies, and model selection.
 */
async function runExample() {
  try {
    console.log('Starting V2 services example...');
    
    // Get ServiceFactory instance
    const serviceFactory = ServiceFactory.getInstance();
    
    // Create V2 microservices
    const unstructuredService = serviceFactory.createUnstructuredInputServiceV2();
    const deepSearchService = serviceFactory.createDeepSearchEngineV2();
    const adaptiveLearningService = serviceFactory.createAdaptiveLearningServiceV2();
    
    // Get the tiered cache service
    const cacheService = ServiceFactory.getTieredCacheService();
    
    // 1. Example: Using the cache service
    console.log('\n--- Caching Example ---');
    
    // Cache item with different tiers
    const cacheKey = 'example-cache-key';
    const cacheValue = { data: 'This is cached data', timestamp: Date.now() };
    
    // Store in both memory and persistent cache
    await cacheService.set(cacheKey, cacheValue, 3600, [CacheTier.MEMORY, CacheTier.PERSISTENT]);
    console.log('Data stored in cache');
    
    // Retrieve from cache
    const cachedData = await cacheService.get(cacheKey);
    console.log('Retrieved from cache:', cachedData);
    
    // Get cache statistics
    const cacheStats = cacheService.getStats();
    console.log('Cache stats:', {
      memoryHits: cacheStats.memoryHits,
      memoryMisses: cacheStats.memoryMisses,
      hitRate: cacheStats.memoryHitRate
    });
    
    // 2. Example: Using resilience strategies
    console.log('\n--- Resilience Strategies Example ---');
    
    // Using the retry strategy
    const retryResult = await ResilienceStrategies.withRetry(
      async () => {
        console.log('Executing operation with retry...');
        // Simulate an operation that might fail
        if (Math.random() < 0.3) {
          throw new Error('Random transient failure');
        }
        return 'Operation succeeded';
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000
      }
    );
    console.log('Retry result:', retryResult);
    
    // Using the circuit breaker pattern
    try {
      const circuitResult = await ResilienceStrategies.withCircuitBreaker(
        async () => {
          console.log('Executing operation with circuit breaker...');
          // This operation should succeed
          return 'Circuit protected operation succeeded';
        },
        {
          circuitName: 'example-circuit',
          failureThreshold: 3,
          resetTimeoutMs: 30000
        }
      );
      console.log('Circuit result:', circuitResult);
    } catch (error) {
      console.error('Circuit operation failed:', error.message);
    }
    
    // 3. Example: Using model selection
    console.log('\n--- Model Selection Example ---');
    
    // Simple text task
    const simpleModelSelection = ModelSelectionStrategy.selectModel({
      taskType: TaskType.TEXT_COMPLETION,
      priority: ModelPriority.COST
    });
    console.log('Simple model selection:', {
      provider: simpleModelSelection.provider,
      model: simpleModelSelection.model,
      temperature: simpleModelSelection.temperature
    });
    
    // Complex task with JSON output
    const complexModelSelection = ModelSelectionStrategy.selectModel({
      taskType: TaskType.COMPLEX_REASONING,
      priority: ModelPriority.QUALITY,
      requiresJsonOutput: true,
      inputTokens: 10000
    });
    console.log('Complex model selection:', {
      provider: complexModelSelection.provider,
      model: complexModelSelection.model,
      temperature: complexModelSelection.temperature,
      hasFallback: !!complexModelSelection.fallbackModel
    });
    
    // 4. Example: AI Service
    console.log('\n--- AI Service Example ---');
    
    // Get the AIServiceV2 instance
    const aiService = serviceFactory.getAIServiceV2();
    
    // Get available models
    const providers = aiService.getAvailableProviders();
    console.log('Available providers:', providers);
    
    console.log('Example completed successfully');
  } catch (error) {
    console.error('Example failed with error:', error);
  }
}

// Run the example
runExample().then(() => console.log('Done')).catch(error => console.error(error));
