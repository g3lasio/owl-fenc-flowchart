import { AICapability, AICompletionOptions, AIImageAnalysisOptions, AIModelProvider } from '../interfaces/ai-provider.interfaces';
import { AIProviderFactory } from '../factories/ai-provider.factory';
import { ApiUsageService } from './api-usage.service';
import { config } from '../config/config';

/**
 * Centralized service for all AI interactions
 * Uses the AI provider interfaces for standardized interactions
 */
export class AIServiceV2 {
  private providerFactory: AIProviderFactory;
  private apiUsageService: ApiUsageService;
  
  constructor(apiUsageService?: ApiUsageService) {
    this.providerFactory = AIProviderFactory.getInstance();
    this.apiUsageService = apiUsageService || new ApiUsageService();
  }
  
  /**
   * Complete a text prompt using the specified provider
   */
  async complete(options: AICompletionOptions & { provider?: string }): Promise<string> {
    const { provider, ...completionOptions } = options;
    
    // Get the specified provider or the default one
    let aiProvider: AIModelProvider;
    if (provider) {
      const specificProvider = this.providerFactory.getProvider(provider);
      if (!specificProvider) {
        throw new Error(`AI provider '${provider}' not found or not configured`);
      }
      aiProvider = specificProvider;
    } else {
      aiProvider = this.providerFactory.getDefaultProvider();
    }
    
    // Log API usage intent
    this.apiUsageService.logAPIUsage(
      provider || 'default',
      'completion',
      { model: options.model, promptLength: options.prompt.length }
    );
    
    // Execute the completion
    return aiProvider.complete(completionOptions);
  }
  
  /**
   * Complete a text prompt using OpenAI
   */
  async completeWithOpenAI(options: AICompletionOptions): Promise<string> {
    const openaiProvider = this.providerFactory.getProvider('openai');
    if (!openaiProvider) {
      throw new Error('OpenAI provider not configured');
    }
    
    // Log API usage intent
    this.apiUsageService.logAPIUsage(
      'openai',
      'completion',
      { model: options.model, promptLength: options.prompt.length }
    );
    
    return openaiProvider.complete(options);
  }
  
  /**
   * Complete a text prompt using Anthropic
   */
  async completeWithAnthropic(options: AICompletionOptions): Promise<string> {
    const anthropicProvider = this.providerFactory.getProvider('anthropic');
    if (!anthropicProvider) {
      throw new Error('Anthropic provider not configured');
    }
    
    // Log API usage intent
    this.apiUsageService.logAPIUsage(
      'anthropic',
      'completion',
      { model: options.model, promptLength: options.prompt.length }
    );
    
    return anthropicProvider.complete(options);
  }
  
  /**
   * Analyze an image using AI vision capabilities
   */
  async analyzeImage(options: AIImageAnalysisOptions & { provider?: string }): Promise<string> {
    const { provider, ...analysisOptions } = options;
    
    // Get a provider that supports vision capabilities
    let aiProvider: AIModelProvider;
    if (provider) {
      const specificProvider = this.providerFactory.getProvider(provider);
      if (!specificProvider) {
        throw new Error(`AI provider '${provider}' not found or not configured`);
      }
      
      if (!specificProvider.supportsCapability(AICapability.VISION)) {
        throw new Error(`Provider '${provider}' does not support vision capabilities`);
      }
      
      aiProvider = specificProvider;
    } else {
      const visionProvider = this.providerFactory.getProviderWithCapability(AICapability.VISION);
      if (!visionProvider) {
        throw new Error('No provider with vision capabilities is configured');
      }
      aiProvider = visionProvider;
    }
    
    // Log API usage intent
    this.apiUsageService.logAPIUsage(
      provider || 'default',
      'image-analysis',
      { model: options.model }
    );
    
    return aiProvider.analyzeImage(analysisOptions);
  }
  
  /**
   * Generate embeddings for a text
   */
  async generateEmbeddings(text: string, model?: string, provider?: string): Promise<number[]> {
    // Get a provider that supports embeddings
    let aiProvider: AIModelProvider;
    if (provider) {
      const specificProvider = this.providerFactory.getProvider(provider);
      if (!specificProvider) {
        throw new Error(`AI provider '${provider}' not found or not configured`);
      }
      
      if (!specificProvider.supportsCapability(AICapability.EMBEDDINGS)) {
        throw new Error(`Provider '${provider}' does not support embeddings`);
      }
      
      aiProvider = specificProvider;
    } else {
      const embeddingsProvider = this.providerFactory.getProviderWithCapability(AICapability.EMBEDDINGS);
      if (!embeddingsProvider) {
        throw new Error('No provider with embeddings capabilities is configured');
      }
      aiProvider = embeddingsProvider;
    }
    
    // Log API usage intent
    this.apiUsageService.logAPIUsage(
      provider || 'default',
      'embeddings',
      { model }
    );
    
    return aiProvider.generateEmbeddings(text, model);
  }
  
  /**
   * Automatically select the best model for a specific task
   */
  async smartComplete(options: {
    prompt: string;
    complexity: 'low' | 'medium' | 'high';
    promptLength: number;
    requiresCreativity?: boolean;
    requiresFactualAccuracy?: boolean;
    systemMessage?: string;
  }): Promise<string> {
    const {
      prompt,
      complexity,
      promptLength,
      requiresCreativity,
      requiresFactualAccuracy,
      systemMessage
    } = options;
    
    // Get the best provider for the task
    const bestProvider = this.providerFactory.getBestProviderForTask({
      complexity,
      promptLength,
      requiresCreativity,
      requiresFactualAccuracy
    });
    
    // Determine temperature based on requirements
    let temperature = 0.7; // Default
    if (requiresFactualAccuracy) {
      temperature = 0.3; // Lower temperature for factual accuracy
    } else if (requiresCreativity) {
      temperature = 0.9; // Higher temperature for creativity
    }
    
    // Execute the completion with the selected provider
    return bestProvider.complete({
      prompt,
      temperature,
      systemMessage
    });
  }
  
  /**
   * Get the capacity of a model (in tokens)
   */
  getModelCapacity(model: string, provider?: string): number {
    // Get the specified provider or the default one
    let aiProvider: AIModelProvider;
    if (provider) {
      const specificProvider = this.providerFactory.getProvider(provider);
      if (!specificProvider) {
        throw new Error(`AI provider '${provider}' not found or not configured`);
      }
      aiProvider = specificProvider;
    } else {
      aiProvider = this.providerFactory.getDefaultProvider();
    }
    
    return aiProvider.getModelContextLength(model);
  }
  
  /**
   * Check if a specific capability is supported by any provider
   */
  hasCapability(capability: AICapability): boolean {
    const provider = this.providerFactory.getProviderWithCapability(capability);
    return !!provider;
  }
  
  /**
   * Get all available AI providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providerFactory.getAllProviders().keys());
  }
}
