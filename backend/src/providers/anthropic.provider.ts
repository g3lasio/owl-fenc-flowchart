import axios from 'axios';
import { config } from '../config/config';
import { ApiUsageService } from '../services/api-usage.service';
import {
  AICapability,
  AICompletionOptions,
  AIErrorCode,
  AIImageAnalysisOptions,
  AIModelProvider,
  AIProviderError
} from '../interfaces/ai-provider.interfaces';

/**
 * Anthropic provider implementation
 * Provides a standardized interface for interacting with Anthropic Claude models
 */
export class AnthropicProvider implements AIModelProvider {
  private apiKey: string;
  private baseUrl = 'https://api.anthropic.com/v1';
  private maxRetries: number;
  private retryDelay: number;
  private apiUsageService: ApiUsageService;
  
  // Map for Anthropic model context lengths
  private readonly modelContextLengths: Record<string, number> = {
    'claude-instant-1': 100000,
    'claude-2': 100000,
    'claude-3-opus-20240229': 200000,
    'claude-3-sonnet-20240229': 180000,
    'claude-3-haiku-20240307': 150000
  };
  
  constructor(apiKey?: string, apiUsageService?: ApiUsageService) {
    this.apiKey = apiKey || config.anthropic.apiKey || '';
    this.maxRetries = config.anthropic.maxRetries || 3;
    this.retryDelay = config.anthropic.retryDelay || 1000;
    
    // Initialize or use provided monitoring service
    this.apiUsageService = apiUsageService || new ApiUsageService();
    
    if (!this.apiKey) {
      console.warn('AnthropicProvider initialized without API key. Requests will fail.');
    }
  }

  /**
   * Complete a text prompt with an Anthropic model
   */
  async complete(options: AICompletionOptions): Promise<string> {
    const {
      prompt,
      model = config.anthropic.model,
      maxTokens = 2000,
      temperature = 0.7,
      stopSequences,
      systemMessage = 'You are Claude, a helpful AI assistant specialized in construction and estimation for contractors. Be concise and direct with your answers.'
    } = options;
    
    // Validate API key
    if (!this.apiKey) {
      throw new AIProviderError(
        AIErrorCode.AUTHENTICATION_ERROR,
        'Anthropic API key not configured',
        'anthropic'
      );
    }
    
    // Check usage limits before making the call
    if (!this.apiUsageService.isSafeToUseAnthropic()) {
      throw new AIProviderError(
        AIErrorCode.QUOTA_EXCEEDED,
        'Anthropic usage limit exceeded. Please try again later.',
        'anthropic'
      );
    }
    
    // Detect if we're using Claude-3 (API v2) or legacy models
    const isClaudeThree = model.includes('claude-3');
    
    // Format the payload according to the API version
    let payload;
    let endpoint;
    
    if (isClaudeThree) {
      // Format for Claude-3 (API v2)
      endpoint = '/messages';
      payload = {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt }
        ]
      };
      
      // Add stop sequences if specified
      if (stopSequences && stopSequences.length > 0) {
        payload.stop_sequences = stopSequences;
      }
    } else {
      // Format for legacy models (API v1)
      endpoint = '/completions';
      payload = {
        model,
        prompt: `\n\nHuman: ${prompt}\n\nAssistant:`,
        max_tokens_to_sample: maxTokens,
        temperature,
        stop_sequences: stopSequences || ["\n\nHuman:"]
      };
    }
    
    try {
      // Execute with automatic retries
      const response = await this.executeWithRetry(async () => {
        const apiResponse = await this.makeApiRequest(endpoint, payload);
        
        // Extract the text according to the API version
        if (isClaudeThree) {
          return apiResponse.content[0].text;
        } else {
          return apiResponse.completion.trim();
        }
      });
      
      // Estimate tokens for monitoring (simple approximation)
      const promptTokens = Math.ceil((systemMessage.length + prompt.length) / 4);
      const completionTokens = Math.ceil(response.length / 4);
      
      // Log API usage
      this.apiUsageService.logAnthropicUsage(promptTokens, completionTokens);
      
      return response;
    } catch (error: any) {
      // Convert to standardized error
      throw this.normalizeError(error);
    }
  }

  /**
   * Generate embeddings for a text
   * Note: Anthropic doesn't natively support embeddings, so we throw an error
   */
  async generateEmbeddings(text: string, model?: string): Promise<number[]> {
    throw new AIProviderError(
      AIErrorCode.INVALID_REQUEST,
      'Anthropic does not support embeddings generation',
      'anthropic'
    );
  }

  /**
   * Analyze an image with AI vision capabilities
   */
  async analyzeImage(options: AIImageAnalysisOptions): Promise<string> {
    const {
      image,
      prompt,
      model = 'claude-3-opus-20240229',
      maxTokens = 2000,
      temperature = 0.7,
      isBase64 = false
    } = options;
    
    // Validate API key
    if (!this.apiKey) {
      throw new AIProviderError(
        AIErrorCode.AUTHENTICATION_ERROR,
        'Anthropic API key not configured',
        'anthropic'
      );
    }
    
    // Check if model supports vision (only Claude 3 models do)
    if (!model.includes('claude-3')) {
      throw new AIProviderError(
        AIErrorCode.INVALID_REQUEST,
        `Model ${model} does not support vision capabilities`,
        'anthropic'
      );
    }
    
    const endpoint = '/messages';
    
    // Format the content with the image
    const content = [
      {
        type: 'text',
        text: prompt
      },
      {
        type: 'image',
        source: {
          type: isBase64 ? 'base64' : 'url',
          data: image
        }
      }
    ];
    
    const payload = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        {
          role: 'user',
          content
        }
      ]
    };
    
    try {
      // Execute with automatic retries
      const response = await this.executeWithRetry(async () => {
        const apiResponse = await this.makeApiRequest(endpoint, payload);
        return apiResponse.content[0].text;
      });
      
      // Log API usage (approximate)
      this.apiUsageService.logAPIUsage('anthropic', 'image-analysis', { model });
      
      return response;
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Get the maximum context length for a specific model
   */
  getModelContextLength(model: string): number {
    return this.modelContextLengths[model] || 100000; // Default safe value
  }

  /**
   * Check if the provider supports a specific capability
   */
  supportsCapability(capability: AICapability): boolean {
    switch (capability) {
      case AICapability.VISION:
        return true; // Claude 3 models support vision
      case AICapability.EMBEDDINGS:
        return false; // Anthropic doesn't support embeddings natively
      case AICapability.FUNCTION_CALLING:
        return false; // Anthropic doesn't support function calling as of now
      case AICapability.JSON_MODE:
        return true; // Claude 3 models can output structured JSON
      case AICapability.STREAMING:
        return true; // Anthropic supports streaming
      case AICapability.MULTI_MODAL:
        return true; // Claude 3 models support multi-modal inputs
      default:
        return false;
    }
  }

  /**
   * Make a request to the Anthropic API
   */
  private async makeApiRequest(endpoint: string, payload: any): Promise<any> {
    try {
      // Determine the API version by the endpoint
      const apiVersion = endpoint === '/messages' ? '2023-06-01' : '2023-01-01';
      
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'Anthropic-Version': apiVersion
        },
        data: payload
      });
      
      return response.data;
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Execute a function with automatic retries
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    
    // Exponential backoff implementation for retries
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        // If not a rate limit or server error, don't retry
        if (error.response?.status !== 429 && error.response?.status !== 500) {
          throw error;
        }
        
        // Calculate exponential delay (2^attempt * retryDelay)
        const delay = this.retryDelay * Math.pow(2, attempt);
        console.warn(`Retry ${attempt + 1}/${this.maxRetries} after ${delay}ms`);
        
        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If we get here, all retries failed
    throw lastError || new Error('Unknown error in Anthropic provider');
  }

  /**
   * Normalize error to standardized AIProviderError
   */
  private normalizeError(error: any): AIProviderError {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;
    
    let code = AIErrorCode.UNKNOWN_ERROR;
    let message = 'Error calling Anthropic API';
    let isRetryable = false;
    
    // Map common error codes
    if (statusCode === 401) {
      code = AIErrorCode.AUTHENTICATION_ERROR;
      message = 'Invalid or expired Anthropic API key';
    } else if (statusCode === 429) {
      code = AIErrorCode.RATE_LIMIT_ERROR;
      message = 'Anthropic API rate limit exceeded. Try again later.';
      isRetryable = true;
    } else if (statusCode === 500) {
      code = AIErrorCode.API_ERROR;
      message = 'Anthropic server error. Try again later.';
      isRetryable = true;
    } else if (errorData?.error?.message) {
      message = `Anthropic API: ${errorData.error.message}`;
      
      // Detect specific error types
      if (message.includes('token') && message.includes('limit')) {
        code = AIErrorCode.CONTEXT_LENGTH_EXCEEDED;
      } else if (message.includes('rate limit')) {
        code = AIErrorCode.RATE_LIMIT_ERROR;
        isRetryable = true;
      } else if (message.includes('invalid')) {
        code = AIErrorCode.INVALID_REQUEST;
      }
    }
    
    return new AIProviderError(
      code,
      message,
      'anthropic',
      error,
      isRetryable
    );
  }
}
