/**
 * Defines the standard interface for all AI model providers
 * This abstraction allows for easy swapping of AI providers and simplifies testing
 */
export interface AIModelProvider {
  /**
   * Complete a text prompt with the AI model
   */
  complete(options: AICompletionOptions): Promise<string>;
  
  /**
   * Generate embeddings for a text
   */
  generateEmbeddings(text: string, model?: string): Promise<number[]>;
  
  /**
   * Analyze an image with AI vision capabilities
   */
  analyzeImage(options: AIImageAnalysisOptions): Promise<string>;
  
  /**
   * Get the maximum context length for a specific model
   */
  getModelContextLength(model: string): number;
  
  /**
   * Check if the provider supports a specific capability
   */
  supportsCapability(capability: AICapability): boolean;
}

/**
 * Options for AI text completion
 */
export interface AICompletionOptions {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  responseFormat?: 'text' | 'json_object';
  systemMessage?: string;
  
  // Resilience options
  timeout?: number;
  retry?: {
    maxRetries?: number;
    baseDelayMs?: number;
    backoffFactor?: number;
    retryableErrorTypes?: AIErrorType[];
  };
  useFallback?: boolean;
}

/**
 * Options for AI image analysis
 */
export interface AIImageAnalysisOptions {
  image: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  isBase64?: boolean;
  
  // Resilience options
  timeout?: number;
  retry?: {
    maxRetries?: number;
    baseDelayMs?: number;
    backoffFactor?: number;
    retryableErrorTypes?: AIErrorType[];
  };
  useFallback?: boolean;
}

/**
 * AI capabilities that may vary by provider
 */
export enum AICapability {
  VISION = 'vision',
  EMBEDDINGS = 'embeddings',
  FUNCTION_CALLING = 'function_calling',
  JSON_MODE = 'json_mode',
  STREAMING = 'streaming',
  MULTI_MODAL = 'multi_modal',
}

/**
 * Error types for AI provider errors
 * These are standardized across providers to simplify error handling
 */
export enum AIErrorType {
  /**
   * Errors related to authentication, like invalid API keys
   */
  AUTHENTICATION = 'authentication',
  
  /**
   * Errors related to rate limiting or quotas
   */
  RATE_LIMIT = 'rate-limit',
  
  /**
   * Errors from the AI provider's servers
   */
  SERVER_ERROR = 'server-error',
  
  /**
   * Errors related to the model (e.g., deprecated, not available)
   */
  MODEL_ERROR = 'model-error',
  
  /**
   * Errors related to context length or token limits
   */
  CONTEXT_LENGTH = 'context-length',
  
  /**
   * Errors in the content (e.g., moderation, harmful content)
   */
  CONTENT_ERROR = 'content-error',
  
  /**
   * Network-related errors (timeouts, connection issues)
   */
  NETWORK = 'network',
  
  /**
   * Unknown or unclassified errors
   */
  UNKNOWN = 'unknown'
}

/**
 * Standard AI provider error
 */
export class AIProviderError extends Error {
  constructor(
    public readonly type: AIErrorType,
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number,
    public readonly rawError?: any
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
  
  /**
   * Determines if the error is retryable based on its type
   */
  isRetryable(retryableTypes?: AIErrorType[]): boolean {
    if (!retryableTypes || retryableTypes.length === 0) {
      // Default retryable error types
      retryableTypes = [
        AIErrorType.RATE_LIMIT,
        AIErrorType.SERVER_ERROR,
        AIErrorType.NETWORK
      ];
    }
    
    return retryableTypes.includes(this.type);
  }
}
