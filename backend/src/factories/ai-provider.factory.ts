import { config } from '../config/config';
import { ApiUsageService } from '../services/api-usage.service';
import { AICapability, AIModelProvider } from '../interfaces/ai-provider.interfaces';
import { OpenAIProvider } from '../providers/openai.provider';
import { AnthropicProvider } from '../providers/anthropic.provider';

/**
 * Factory for creating AI providers
 * Centralizes the creation and management of AI providers
 */
export class AIProviderFactory {
  private static instance: AIProviderFactory;
  private providers: Map<string, AIModelProvider> = new Map();
  private apiUsageService: ApiUsageService;
  
  private constructor() {
    this.apiUsageService = new ApiUsageService();
    this.initializeProviders();
  }
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): AIProviderFactory {
    if (!AIProviderFactory.instance) {
      AIProviderFactory.instance = new AIProviderFactory();
    }
    return AIProviderFactory.instance;
  }
  
  /**
   * Initialize the available AI providers
   */
  private initializeProviders(): void {
    // Initialize OpenAI provider if configured
    if (config.openai?.apiKey) {
      this.providers.set('openai', new OpenAIProvider(config.openai.apiKey, this.apiUsageService));
    }
    
    // Initialize Anthropic provider if configured
    if (config.anthropic?.apiKey) {
      this.providers.set('anthropic', new AnthropicProvider(config.anthropic.apiKey, this.apiUsageService));
    }
    
    // More providers can be added here in the future
  }
  
  /**
   * Get a provider by name
   */
  public getProvider(name: string): AIModelProvider | undefined {
    return this.providers.get(name);
  }
  
  /**
   * Get all available providers
   */
  public getAllProviders(): Map<string, AIModelProvider> {
    return this.providers;
  }
  
  /**
   * Get the default provider
   */
  public getDefaultProvider(): AIModelProvider {
    // Default to OpenAI if available, otherwise use the first available provider
    if (this.providers.has('openai')) {
      return this.providers.get('openai')!;
    }
    
    const firstProvider = this.providers.values().next().value;
    if (!firstProvider) {
      throw new Error('No AI providers are configured');
    }
    
    return firstProvider;
  }
  
  /**
   * Get a provider that supports a specific capability
   */
  public getProviderWithCapability(capability: AICapability): AIModelProvider | undefined {
    for (const provider of this.providers.values()) {
      if (provider.supportsCapability(capability)) {
        return provider;
      }
    }
    return undefined;
  }
  
  /**
   * Get the best provider for a specific task based on requirements
   */
  public getBestProviderForTask(options: {
    complexity: 'low' | 'medium' | 'high';
    promptLength: number;
    requiresVision?: boolean;
    requiresEmbeddings?: boolean;
    requiresCreativity?: boolean;
    requiresFactualAccuracy?: boolean;
  }): AIModelProvider {
    const {
      complexity,
      promptLength,
      requiresVision,
      requiresEmbeddings,
      requiresCreativity,
      requiresFactualAccuracy
    } = options;
    
    // If vision is required, get a provider with vision capabilities
    if (requiresVision) {
      const visionProvider = this.getProviderWithCapability(AICapability.VISION);
      if (visionProvider) return visionProvider;
    }
    
    // If embeddings are required, get a provider with embedding capabilities
    if (requiresEmbeddings) {
      const embeddingsProvider = this.getProviderWithCapability(AICapability.EMBEDDINGS);
      if (embeddingsProvider) return embeddingsProvider;
    }
    
    // For complex tasks or long prompts, prefer Anthropic
    if (complexity === 'high' || promptLength > 8000) {
      const anthropicProvider = this.getProvider('anthropic');
      if (anthropicProvider) return anthropicProvider;
    }
    
    // For tasks requiring factual accuracy, prefer OpenAI
    if (requiresFactualAccuracy) {
      const openaiProvider = this.getProvider('openai');
      if (openaiProvider) return openaiProvider;
    }
    
    // Default to the default provider
    return this.getDefaultProvider();
  }
}
