import { ResilienceStrategies, AIProviderError, AIErrorType } from '../../src/utils/resilience';

// Mock for testing timeout function
jest.useFakeTimers();

describe('ResilienceStrategies', () => {
  describe('withRetry', () => {
    test('should return result if function succeeds on first try', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await ResilienceStrategies.withRetry(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
    
    test('should retry specified number of times and then succeed', async () => {
      // Function that fails twice and succeeds on third try
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');
      
      const result = await ResilienceStrategies.withRetry(mockFn, {
        maxRetries: 3,
        baseDelayMs: 100,
        backoffFactor: 1.5
      });
      
      // Fast-forward timers to execute delayed retries
      jest.runAllTimers();
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });
    
    test('should fail after max retries exhausted', async () => {
      // Function that always fails
      const mockFn = jest.fn().mockRejectedValue(new Error('always fails'));
      
      await expect(ResilienceStrategies.withRetry(mockFn, {
        maxRetries: 2,
        baseDelayMs: 100
      })).rejects.toThrow('always fails');
      
      // Fast-forward timers to execute delayed retries
      jest.runAllTimers();
      
      expect(mockFn).toHaveBeenCalledTimes(3); // Initial call + 2 retries
    });
    
    test('should only retry for specified error types', async () => {
      // Create errors of different types
      const retryableError = new AIProviderError(
        AIErrorType.RATE_LIMIT,
        'Rate limit error',
        'test-provider'
      );
      
      const nonRetryableError = new AIProviderError(
        AIErrorType.AUTHENTICATION,
        'Auth error',
        'test-provider'
      );
      
      // Function that first returns a retryable error, then non-retryable
      const mockFn = jest.fn()
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(nonRetryableError);
      
      await expect(ResilienceStrategies.withRetry(mockFn, {
        maxRetries: 3,
        retryableErrorTypes: [AIErrorType.RATE_LIMIT, AIErrorType.SERVER_ERROR]
      })).rejects.toEqual(nonRetryableError);
      
      // Fast-forward timers to execute delayed retries
      jest.runAllTimers();
      
      // Should only retry once, then fail on non-retryable error
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('withTimeout', () => {
    test('should return result if function completes before timeout', async () => {
      const mockFn = jest.fn().mockResolvedValue('completed');
      
      const result = await ResilienceStrategies.withTimeout(mockFn, 1000);
      
      expect(result).toBe('completed');
    });
    
    test('should throw error if function exceeds timeout', async () => {
      // Function that never resolves
      const mockFn = jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          // This will never resolve, simulating a hanging request
          setTimeout(resolve, 10000);
        });
      });
      
      const timeoutPromise = ResilienceStrategies.withTimeout(mockFn, 500);
      
      // Advance timers to trigger timeout
      jest.advanceTimersByTime(600);
      
      await expect(timeoutPromise).rejects.toThrow('Operation timed out');
    });
  });
  
  describe('withFallback', () => {
    test('should use primary function if it succeeds', async () => {
      const primaryFn = jest.fn().mockResolvedValue('primary result');
      const fallbackFn = jest.fn().mockResolvedValue('fallback result');
      
      const result = await ResilienceStrategies.withFallback(primaryFn, [fallbackFn]);
      
      expect(result).toBe('primary result');
      expect(primaryFn).toHaveBeenCalledTimes(1);
      expect(fallbackFn).not.toHaveBeenCalled();
    });
    
    test('should try fallbacks in order if primary fails', async () => {
      const primaryFn = jest.fn().mockRejectedValue(new Error('primary failed'));
      const fallback1 = jest.fn().mockRejectedValue(new Error('fallback1 failed'));
      const fallback2 = jest.fn().mockResolvedValue('fallback2 result');
      
      const result = await ResilienceStrategies.withFallback(primaryFn, [fallback1, fallback2]);
      
      expect(result).toBe('fallback2 result');
      expect(primaryFn).toHaveBeenCalledTimes(1);
      expect(fallback1).toHaveBeenCalledTimes(1);
      expect(fallback2).toHaveBeenCalledTimes(1);
    });
    
    test('should throw combined error if all implementations fail', async () => {
      const primaryFn = jest.fn().mockRejectedValue(new Error('primary failed'));
      const fallback1 = jest.fn().mockRejectedValue(new Error('fallback1 failed'));
      const fallback2 = jest.fn().mockRejectedValue(new Error('fallback2 failed'));
      
      await expect(ResilienceStrategies.withFallback(primaryFn, [fallback1, fallback2]))
        .rejects.toThrow('All implementations failed');
      
      expect(primaryFn).toHaveBeenCalledTimes(1);
      expect(fallback1).toHaveBeenCalledTimes(1);
      expect(fallback2).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('withCircuitBreaker', () => {
    beforeEach(() => {
      // Reset circuit breaker state between tests
      // @ts-ignore - Accessing private member for testing
      ResilienceStrategies.circuitBreakerState = { failures: 0, lastFailure: 0 };
    });
    
    test('should execute function when circuit is closed', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await ResilienceStrategies.withCircuitBreaker(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
    
    test('should open circuit after threshold failures', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Cause enough failures to open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await ResilienceStrategies.withCircuitBreaker(mockFn, { failureThreshold: 5 });
        } catch (error) {
          // Expected error
        }
      }
      
      // Next attempt should fail with circuit breaker error
      await expect(ResilienceStrategies.withCircuitBreaker(mockFn))
        .rejects.toThrow('Circuit breaker is open');
      
      // The function should not have been called on the last attempt
      expect(mockFn).toHaveBeenCalledTimes(5);
    });
    
    test('should reset circuit after timeout', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Cause enough failures to open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await ResilienceStrategies.withCircuitBreaker(mockFn, { 
            failureThreshold: 5,
            resetTimeoutMs: 1000
          });
        } catch (error) {
          // Expected error
        }
      }
      
      // Advance time past the reset timeout
      jest.advanceTimersByTime(1100);
      
      // Mock to succeed on next call
      mockFn.mockResolvedValueOnce('success after reset');
      
      // Circuit should be closed now
      const result = await ResilienceStrategies.withCircuitBreaker(mockFn);
      expect(result).toBe('success after reset');
      expect(mockFn).toHaveBeenCalledTimes(6);
    });
  });
  
  describe('AIProviderError', () => {
    test('should detect retryable errors correctly', () => {
      const retryableErrors = [
        new AIProviderError(AIErrorType.RATE_LIMIT, 'Rate limited', 'test'),
        new AIProviderError(AIErrorType.SERVER_ERROR, 'Server error', 'test'),
        new AIProviderError(AIErrorType.NETWORK, 'Network error', 'test')
      ];
      
      const nonRetryableErrors = [
        new AIProviderError(AIErrorType.AUTHENTICATION, 'Auth error', 'test'),
        new AIProviderError(AIErrorType.CONTENT_ERROR, 'Content error', 'test'),
        new AIProviderError(AIErrorType.MODEL_ERROR, 'Model error', 'test')
      ];
      
      // Default retryable types
      for (const error of retryableErrors) {
        expect(error.isRetryable()).toBe(true);
      }
      
      for (const error of nonRetryableErrors) {
        expect(error.isRetryable()).toBe(false);
      }
      
      // Custom retryable types
      const customRetryableTypes = [AIErrorType.CONTENT_ERROR];
      expect(nonRetryableErrors[1].isRetryable(customRetryableTypes)).toBe(true);
      expect(retryableErrors[0].isRetryable(customRetryableTypes)).toBe(false);
    });
    
    test('should create error from API response correctly', () => {
      const apiError = {
        response: {
          status: 429,
          data: {
            error: {
              message: 'Rate limit exceeded',
              type: 'rate_limit_error'
            }
          }
        }
      };
      
      const error = AIProviderError.fromApiError(apiError, 'openai');
      
      expect(error.type).toBe(AIErrorType.RATE_LIMIT);
      expect(error.provider).toBe('openai');
      expect(error.statusCode).toBe(429);
      expect(error.message).toContain('rate limit');
      expect(error.isRetryable()).toBe(true);
    });
  });
});
