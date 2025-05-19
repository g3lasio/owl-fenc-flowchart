import { TieredCacheService } from '../services/tiered-cache.service';
import { CacheTier, CachePolicy } from '../interfaces/cache.interfaces';
import { config } from '../config/config';

/**
 * Helper class to standardize AI response caching across the application
 */
export class CacheUtils {
  private static cacheService = TieredCacheService.getInstance();
  
  /**
   * Generate a standardized cache key for AI completions
   * @param provider The AI provider (e.g., 'openai', 'anthropic')
   * @param model The model name
   * @param prompt The prompt or messages sent to the AI
   * @param options Any additional options that affect the response
   */
  public static generateCompletionCacheKey(
    provider: string, 
    model: string, 
    prompt: string | any[], 
    options?: Record<string, any>
  ): string {
    // For array prompts (like chat messages), stringify them
    const promptStr = typeof prompt === 'string' 
      ? prompt 
      : JSON.stringify(prompt);
    
    // Create a string representation of options that affect the output
    const optionsStr = options 
      ? JSON.stringify({
          temperature: options.temperature,
          topP: options.topP,
          maxTokens: options.maxTokens,
          // Add other parameters that affect the result
        }) 
      : '';
    
    // Combine all elements that make this request unique
    const key = `ai:${provider}:${model}:${promptStr}:${optionsStr}`;
    
    return key;
  }
  
  /**
   * Get cached AI completion or fetch a new one
   * @param cacheKey The cache key
   * @param fetcher Function to call the AI API if cache miss
   * @param policyName Name of the cache policy to use
   */
  public static async getCachedOrFetch<T>(
    cacheKey: string,
    fetcher: () => Promise<T>,
    policyName: 'ai_response' | 'embeddings' | 'project_analysis' | 'material_prices' = 'ai_response'
  ): Promise<T> {
    // Get cache policy from config
    const policy = config.cache.policies[policyName];
    
    if (!policy) {
      // If no policy found, just fetch without caching
      return await fetcher();
    }
    
    // Convert string tiers to enum values
    const tiers = policy.tiers.map(tier => {
      switch (tier.toLowerCase()) {
        case 'memory': return CacheTier.MEMORY;
        case 'persistent': return CacheTier.PERSISTENT;
        case 'distributed': return CacheTier.DISTRIBUTED;
        default: return CacheTier.MEMORY;
      }
    });
    
    return await this.cacheService.warm(
      cacheKey,
      fetcher,
      policy.ttl,
      tiers
    );
  }
  
  /**
   * Invalidate cached AI response
   * @param cacheKey The cache key to invalidate
   * @param policyName Name of the cache policy that was used
   */
  public static async invalidateCache(
    cacheKey: string,
    policyName: 'ai_response' | 'embeddings' | 'project_analysis' | 'material_prices' = 'ai_response'
  ): Promise<void> {
    // Get cache policy from config to know which tiers to invalidate
    const policy = config.cache.policies[policyName];
    
    if (!policy) {
      // No policy, invalidate all tiers
      await this.cacheService.invalidate(cacheKey);
      return;
    }
    
    // Convert string tiers to enum values
    const tiers = policy.tiers.map(tier => {
      switch (tier.toLowerCase()) {
        case 'memory': return CacheTier.MEMORY;
        case 'persistent': return CacheTier.PERSISTENT;
        case 'distributed': return CacheTier.DISTRIBUTED;
        default: return CacheTier.MEMORY;
      }
    });
    
    await this.cacheService.invalidate(cacheKey, tiers);
  }
}
