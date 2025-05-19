import axios from 'axios';
import { config } from '../config/config';
import { ApiUsageService } from '../services/api-usage.service';
import {
  AICapability,
  AICompletionOptions,
  AIErrorType,
  AIImageAnalysisOptions,
  AIModelProvider,
  AIProviderError
} from '../interfaces/ai-provider.interfaces';
import { ResilienceStrategies } from '../utils/resilience';

/**
 * OpenAI provider implementation
 * Provides a standardized interface for interacting with OpenAI models
 */
export class OpenAIProvider implements AIModelProvider {
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';
  private apiUsageService: ApiUsageService;
  
  // Map for OpenAI model context lengths
  private readonly modelContextLengths: Record<string, number> = {
    'gpt-3.5-turbo': 16384,
    'gpt-3.5-turbo-16k': 16384,
    'gpt-4': 8192,
    'gpt-4-turbo': 128000,
    'gpt-4o': 128000,
    'text-embedding-ada-002': 8191,
    'text-embedding-3-small': 8191,
    'text-embedding-3-large': 8191
  };
  
  constructor(apiKey?: string, apiUsageService?: ApiUsageService) {
    this.apiKey = apiKey || config.openai.apiKey || '';
    
    // Initialize or use provided monitoring service
    this.apiUsageService = apiUsageService || new ApiUsageService();
    
    if (!this.apiKey) {
      console.warn('OpenAIProvider initialized without API key. Requests will fail.');
    }
  }

  /**
   * Complete a text prompt with an OpenAI model
   */
  async complete(options: AICompletionOptions): Promise<string> {
    const {
      prompt,
      model = config.openai.completionModel,
      maxTokens = 1000,
      temperature = 0.7,
      stopSequences,
      responseFormat,
      systemMessage = 'You are a helpful assistant specialized in construction and material estimation.',
      // Resilience options with defaults
      timeout = 30000,
      retry = {
        maxRetries: config.openai.maxRetries || 3,
        baseDelayMs: config.openai.retryDelay || 1000,
        backoffFactor: 2
      },
      useFallback = false
    } = options;
    
    // Validate API key
    if (!this.apiKey) {
      throw new AIProviderError(
        AIErrorType.AUTHENTICATION,
        'OpenAI API key not configured',
        'openai'
      );
    }
    
    // Check usage limits before making the call
    if (!this.apiUsageService.isSafeToUseOpenAI()) {
      throw new AIProviderError(
        AIErrorType.RATE_LIMIT,
        'OpenAI usage limit exceeded. Please try again later.',
        'openai'
      );
    }
    
    const endpoint = '/chat/completions';
    
    // Prepare messages according to OpenAI API format
    const messages = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: prompt }
    ];
    
    const payload: any = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    };
    
    // Add response format if specified
    if (responseFormat === 'json_object') {
      payload.response_format = { type: 'json_object' };
    }
    
    // Add stop sequences if specified
    if (stopSequences && stopSequences.length > 0) {
      payload.stop = stopSequences;
    }
    
    try {
      // Apply resilience strategies
      const response = await ResilienceStrategies.withTimeout(
        async () => {
          return await ResilienceStrategies.withRetry(
            async () => {
              const result = await this.makeApiRequest(endpoint, payload);
              
              // Estimate tokens for monitoring (simple approximation)
              const promptTokens = Math.ceil((systemMessage.length + prompt.length) / 4);
              const completionTokens = Math.ceil(result.length / 4);
              
              // Log API usage
              this.apiUsageService.logOpenAIUsage(promptTokens, completionTokens);
              
              return result;
            },
            {
              maxRetries: retry.maxRetries,
              baseDelayMs: retry.baseDelayMs,
              backoffFactor: retry.backoffFactor,
              retryableErrorTypes: retry.retryableErrorTypes
            }
          );
        }, 
        timeout
      );
      
      return response;
    } catch (error: any) {
      // Convert to standardized error
      const normalizedError = this.normalizeError(error);
      
      // If fallback is enabled and we have a fallback model, try it
      if (useFallback && model !== 'gpt-3.5-turbo') {
        console.warn(`Falling back to gpt-3.5-turbo due to error with ${model}: ${normalizedError.message}`);
        
        // Try with fallback model
        return this.complete({
          ...options,
          model: 'gpt-3.5-turbo',
          useFallback: false // Prevent endless fallback loops
        });
      }
      
      throw normalizedError;
    }
  }

  /**
   * Generate embeddings for a text
   */
  async generateEmbeddings(text: string, model?: string): Promise<number[]> {
    // Validate API key
    if (!this.apiKey) {
      throw new AIProviderError(
        AIErrorType.AUTHENTICATION,
        'OpenAI API key not configured',
        'openai'
      );
    }
    
    const endpoint = '/embeddings';
    const payload = {
      model: model || config.openai.embeddingModel || 'text-embedding-ada-002',
      input: text
    };
    
    try {
      return await ResilienceStrategies.withRetry(async () => {
        const response = await this.makeApiRequest(endpoint, payload);
        return response.data[0].embedding;
      });
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Analyze an image with AI vision capabilities
   */
  async analyzeImage(options: AIImageAnalysisOptions): Promise<string> {
    const {
      image,
      prompt,
      model = 'gpt-4o',
      maxTokens = 1000,
      temperature = 0.7,
      isBase64 = false,
      // Resilience options with defaults
      timeout = 60000, // Vision APIs may take longer
      retry = {
        maxRetries: config.openai.maxRetries || 3,
        baseDelayMs: config.openai.retryDelay || 1000,
        backoffFactor: 2
      },
      useFallback = false
    } = options;
    
    // Validate API key
    if (!this.apiKey) {
      throw new AIProviderError(
        AIErrorType.AUTHENTICATION,
        'OpenAI API key not configured',
        'openai'
      );
    }
    
    // Check if model supports vision
    if (!this.supportsCapability(AICapability.VISION)) {
      throw new AIProviderError(
        AIErrorType.MODEL_ERROR,
        `Model ${model} does not support vision capabilities`,
        'openai'
      );
    }
    
    const endpoint = '/chat/completions';
    
    // Format the content with the image
    const content = [
      {
        type: 'text',
        text: prompt
      },
      {
        type: 'image_url',
        image_url: {
          url: isBase64 ? `data:image/jpeg;base64,${image}` : image
        }
      }
    ];
    
    const payload = {
      model,
      messages: [
        {
          role: 'user',
          content
        }
      ],
      max_tokens: maxTokens,
      temperature
    };
    
    try {
      // Apply resilience strategies
      const response = await ResilienceStrategies.withTimeout(
        async () => {
          return await ResilienceStrategies.withRetry(
            async () => {
              const result = await this.makeApiRequest(endpoint, payload);
              
              // Log API usage (approximate)
              this.apiUsageService.logAPIUsage('openai', 'image-analysis', { model });
              
              return result;
            },
            {
              maxRetries: retry.maxRetries,
              baseDelayMs: retry.baseDelayMs,
              backoffFactor: retry.backoffFactor,
              retryableErrorTypes: retry.retryableErrorTypes
            }
          );
        },
        timeout
      );
      
      return response;
    } catch (error: any) {
      const normalizedError = this.normalizeError(error);
      
      // If fallback is enabled and we have a fallback model, try it
      if (useFallback && model !== 'gpt-4-vision-preview') {
        console.warn(`Falling back to gpt-4-vision-preview due to error with ${model}: ${normalizedError.message}`);
        
        // Try with fallback model
        return this.analyzeImage({
          ...options,
          model: 'gpt-4-vision-preview',
          useFallback: false // Prevent endless fallback loops
        });
      }
      
      throw normalizedError;
    }
  }

  /**
   * Get the maximum context length for a specific model
   */
  getModelContextLength(model: string): number {
    return this.modelContextLengths[model] || 4096; // Default safe value
  }

  /**
   * Check if the provider supports a specific capability
   */
  supportsCapability(capability: AICapability): boolean {
    switch (capability) {
      case AICapability.VISION:
        return true; // OpenAI supports vision with gpt-4-vision and gpt-4o
      case AICapability.EMBEDDINGS:
        return true; // OpenAI supports embeddings
      case AICapability.FUNCTION_CALLING:
        return true; // OpenAI supports function calling
      case AICapability.JSON_MODE:
        return true; // OpenAI supports JSON mode
      case AICapability.STREAMING:
        return true; // OpenAI supports streaming
      case AICapability.MULTI_MODAL:
        return true; // OpenAI supports multi-modal inputs
      default:
        return false;
    }
  }

  /**
   * Make a request to the OpenAI API
   */
  private async makeApiRequest(endpoint: string, payload: any): Promise<any> {
    try {
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        data: payload
      });
      
      // For completions, extract the response text
      if (endpoint === '/chat/completions') {
        return response.data.choices[0].message.content;
      }
      
      // For other endpoints, return the complete response
      return response.data;
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Normalize error to standardized AIProviderError
   */
  private normalizeError(error: any): AIProviderError {
    // If already an AIProviderError, return it
    if (error instanceof AIProviderError) {
      return error;
    }
    
    const statusCode = error.response?.status;
    const errorData = error.response?.data;
    
    let errorType = AIErrorType.UNKNOWN;
    let message = 'Error calling OpenAI API';
    
    // Map common error codes
    if (statusCode === 401 || statusCode === 403) {
      errorType = AIErrorType.AUTHENTICATION;
      message = 'Invalid or expired OpenAI API key';
    } else if (statusCode === 429) {
      errorType = AIErrorType.RATE_LIMIT;
      message = 'OpenAI API rate limit exceeded. Try again later.';
    } else if (statusCode >= 500) {
      errorType = AIErrorType.SERVER_ERROR;
      message = `OpenAI server error (${statusCode}). Try again later.`;
    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || 
               error.message?.includes('timeout')) {
      errorType = AIErrorType.NETWORK;
      message = 'Network timeout calling OpenAI API';
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      errorType = AIErrorType.NETWORK;
      message = `Network error calling OpenAI API: ${error.code}`;
    }
    
    // Try to extract more specific error information from response data
    if (errorData?.error) {
      if (typeof errorData.error === 'string') {
        message = `OpenAI API error: ${errorData.error}`;
      } else if (errorData.error.message) {
        message = `OpenAI API: ${errorData.error.message}`;
        
        // Context length errors
        if (errorData.error.message.includes('maximum context length') || 
            errorData.error.message.includes('token limit')) {
          errorType = AIErrorType.CONTEXT_LENGTH;
        } 
        // Content filtering
        else if (errorData.error.code === 'content_filter') {
          errorType = AIErrorType.CONTENT_ERROR;
        } 
        // Model errors
        else if (errorData.error.code === 'model_not_found' || 
                errorData.error.type === 'invalid_request_error') {
          errorType = AIErrorType.MODEL_ERROR;
        }
      }
    }
    
    return new AIProviderError(
      errorType,
      message,
      'openai',
      statusCode,
      errorData
    );
  }
    
    return new AIProviderError(
      errorType,
      message,
      'openai',
      statusCode,
      errorData
    );
  }
}
