import { config } from '../config/config';

/**
 * Types of errors that can occur in AI provider calls
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
 * Options for retry strategies
 */
export interface RetryOptions {
  /**
   * Maximum number of retries
   */
  maxRetries: number;
  
  /**
   * Base delay between retries in milliseconds
   */
  baseDelayMs: number;
  
  /**
   * Factor to increase delay with each retry attempt
   */
  backoffFactor: number;
  
  /**
   * Whether to add jitter to retry delays to prevent synchronized retries
   */
  jitter: boolean;
  
  /**
   * Maximum delay in milliseconds
   */
  maxDelayMs: number;
  
  /**
   * Retry only these error types, retry all if empty
   */
  retryableErrorTypes?: AIErrorType[];
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  backoffFactor: 2,
  jitter: true,
  maxDelayMs: 30000,
  retryableErrorTypes: [
    AIErrorType.RATE_LIMIT,
    AIErrorType.SERVER_ERROR,
    AIErrorType.NETWORK
  ]
};

/**
 * Error class for AI provider errors 
 */
export class AIProviderError extends Error {
  /**
   * Type of error that occurred
   */
  public readonly type: AIErrorType;
  
  /**
   * HTTP status code if applicable
   */
  public readonly statusCode?: number;
  
  /**
   * Raw error response from the provider
   */
  public readonly rawError?: any;
  
  /**
   * Provider that threw the error
   */
  public readonly provider: string;
  
  constructor(message: string, provider: string, type: AIErrorType = AIErrorType.UNKNOWN, statusCode?: number, rawError?: any) {
    super(message);
    this.type = type;
    this.statusCode = statusCode;
    this.rawError = rawError;
    this.provider = provider;
    this.name = 'AIProviderError';
  }
  
  /**
   * Determines if the error is retryable based on its type
   */
  isRetryable(retryableTypes: AIErrorType[] = DEFAULT_RETRY_OPTIONS.retryableErrorTypes || []): boolean {
    return retryableTypes.includes(this.type);
  }
  
  /**
   * Creates an error from an axios/fetch error response
   */
  static fromApiError(error: any, provider: string): AIProviderError {
    const statusCode = error.response?.status;
    const data = error.response?.data;
    let message = `${provider} API error`;
    let type = AIErrorType.UNKNOWN;
    
    // Determine error type based on status code and response
    if (statusCode === 401 || statusCode === 403) {
      type = AIErrorType.AUTHENTICATION;
      message = `${provider} authentication error: Invalid API key or unauthorized`;
    } else if (statusCode === 429) {
      type = AIErrorType.RATE_LIMIT;
      message = `${provider} rate limit exceeded`;
    } else if (statusCode >= 500) {
      type = AIErrorType.SERVER_ERROR;
      message = `${provider} server error (${statusCode})`;
    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      type = AIErrorType.NETWORK;
      message = `Network timeout connecting to ${provider} API`;
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      type = AIErrorType.NETWORK;
      message = `Network error connecting to ${provider} API: ${error.code}`;
    }
    
    // Try to extract more specific error info from response data
    if (data?.error) {
      if (typeof data.error === 'string') {
        message = `${provider} API error: ${data.error}`;
      } else if (data.error.message) {
        message = `${provider} API error: ${data.error.message}`;
        
        // Content filtering / moderation
        if (data.error.code === 'content_filter') {
          type = AIErrorType.CONTENT_ERROR;
        } 
        // Model errors
        else if (data.error.code === 'model_not_found' || data.error.type === 'invalid_request_error') {
          type = AIErrorType.MODEL_ERROR;
        } 
        // Context length
        else if (data.error.message.includes('maximum context length') || 
                data.error.message.includes('token limit')) {
          type = AIErrorType.CONTEXT_LENGTH;
        }
      }
    }
    
    return new AIProviderError(message, provider, type, statusCode, data);
  }
}

/**
 * A utility class for resilience strategies
 */
export class ResilienceStrategies {
  /**
   * Executes a function with retries based on the provided options
   * 
   * @param fn The async function to execute with retries
   * @param options Retry configuration options
   * @returns The result of the function if successful
   * @throws The last error encountered if all retries fail
   */
  static async withRetry<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<T> {
    // Merge with default options
    const retryOptions: RetryOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      ...options
    };
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= retryOptions.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        // Check if we should retry
        if (attempt >= retryOptions.maxRetries) {
          break;
        }
        
        // Check if error is retryable
        if (error instanceof AIProviderError && 
            retryOptions.retryableErrorTypes && 
            !error.isRetryable(retryOptions.retryableErrorTypes)) {
          break;
        }
        
        // Calculate delay with exponential backoff
        let delay = retryOptions.baseDelayMs * Math.pow(retryOptions.backoffFactor, attempt);
        
        // Apply jitter if enabled (prevents thundering herd)
        if (retryOptions.jitter) {
          // Add random jitter between -25% and +25%
          const jitterFactor = 0.5 + Math.random();
          delay = Math.floor(delay * jitterFactor);
        }
        
        // Cap the delay at maximum
        delay = Math.min(delay, retryOptions.maxDelayMs);
        
        // Log the retry
        console.warn(`Retry ${attempt + 1}/${retryOptions.maxRetries} after ${delay}ms due to error: ${lastError.message}`);
        
        // Wait before the next attempt
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If we've exhausted all retries, throw the last error
    throw lastError;
  }
  
  /**
   * Executes a function with fallbacks if the primary implementation fails
   * 
   * @param primaryFn The primary implementation to try first
   * @param fallbackFns Array of fallback functions to try in order if primary fails
   * @returns Result from either the primary or first successful fallback
   * @throws Combined error with all failure reasons if all attempts fail
   */
  static async withFallback<T>(
    primaryFn: () => Promise<T>,
    fallbackFns: Array<() => Promise<T>>
  ): Promise<T> {
    const errors: Error[] = [];
    
    try {
      return await primaryFn();
    } catch (error) {
      errors.push(error as Error);
      console.warn(`Primary implementation failed: ${(error as Error).message}. Trying fallbacks...`);
    }
    
    // Try each fallback in sequence
    for (let i = 0; i < fallbackFns.length; i++) {
      try {
        return await fallbackFns[i]();
      } catch (error) {
        errors.push(error as Error);
        console.warn(`Fallback ${i + 1} failed: ${(error as Error).message}`);
      }
    }
    
    // If we get here, all implementations failed
    const combinedMessage = errors.map((e, i) => 
      `Attempt ${i === 0 ? 'primary' : `fallback ${i}`}: ${e.message}`
    ).join('; ');
    
    throw new Error(`All implementations failed: ${combinedMessage}`);
  }
  
  /**
   * Executes a function with a timeout
   * 
   * @param fn The function to execute
   * @param timeoutMs Timeout in milliseconds
   * @returns Result of function if it completes within the timeout
   * @throws Error if the timeout is exceeded
   */
  static async withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Set timeout
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      // Execute function
      fn().then(
        (result) => {
          clearTimeout(timeoutId);
          resolve(result);
        },
        (error) => {
          clearTimeout(timeoutId);
          reject(error);
        }
      );
    });
  }
  
  /**
   * Executes a function with circuit breaker pattern
   * Implements the three states of the circuit breaker pattern:
   * - Closed: Requests flow normally
   * - Open: Requests are immediately rejected
   * - Half-Open: A single request is allowed through as a test
   * 
   * @param fn The function to execute
   * @param options Circuit breaker options
   * @returns Result of function if successful
   * @throws Error if circuit is open or function fails
   */
  static async withCircuitBreaker<T>(
    fn: () => Promise<T>,
    options: {
      circuitName: string;
      failureThreshold: number;
      resetTimeoutMs: number;
    }
  ): Promise<T> {
    const { circuitName, failureThreshold, resetTimeoutMs } = options;
    
    // Initialize circuit state if not exists
    if (!ResilienceStrategies.circuitState[circuitName]) {
      ResilienceStrategies.circuitState[circuitName] = {
        status: 'CLOSED',
        failures: 0,
        lastFailure: 0,
        lastSuccess: Date.now()
      };
    }
    
    const circuit = ResilienceStrategies.circuitState[circuitName];
    const now = Date.now();
    
    // Check circuit state
    if (circuit.status === 'OPEN') {
      // Check if it's time to try again (transition to half-open)
      if (now - circuit.lastFailure >= resetTimeoutMs) {
        circuit.status = 'HALF_OPEN';
        console.log(`Circuit ${circuitName} transitioning from OPEN to HALF_OPEN`);
      } else {
        // Circuit is open and reset timeout hasn't elapsed
        throw new Error(`Circuit breaker ${circuitName} is open, requests are rejected`);
      }
    }
    
    // Execute the function (circuit is either CLOSED or HALF_OPEN)
    try {
      const result = await fn();
      
      // Success - handle based on current state
      if (circuit.status === 'HALF_OPEN') {
        // Successful test in half-open state, close the circuit
        circuit.status = 'CLOSED';
        console.log(`Circuit ${circuitName} recovered, transitioning from HALF_OPEN to CLOSED`);
      }
      
      // Reset failure counter
      circuit.failures = 0;
      circuit.lastSuccess = now;
      
      return result;
    } catch (error) {
      // Failure - handle based on current state
      circuit.failures++;
      circuit.lastFailure = now;
      
      // Check if we've hit the threshold
      if (circuit.status === 'CLOSED' && circuit.failures >= failureThreshold) {
        // Too many failures, open the circuit
        circuit.status = 'OPEN';
        console.log(`Circuit ${circuitName} opened after ${failureThreshold} failures`);
      } else if (circuit.status === 'HALF_OPEN') {
        // Failed during test, back to open
        circuit.status = 'OPEN';
        console.log(`Circuit ${circuitName} test failed, returning to OPEN`);
      }
      
      throw error;
    }
  }
  
  // Circuit state store - in production this would use a distributed store
  private static circuitState: Record<string, {
    status: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failures: number;
    lastFailure: number;
    lastSuccess: number;
  }> = {};
}
