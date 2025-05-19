import { ResilienceStrategies } from '../../src/utils/resilience';

describe('Circuit Breaker', () => {
  // Reset circuit breaker state before each test
  beforeEach(() => {
    // Access private circuit state and reset it for testing
    // This is a bit of a hack for testing purposes
    (ResilienceStrategies as any).circuitState = {};
  });
  
  test('should allow requests when circuit is closed', async () => {
    const circuitName = 'test-circuit-closed';
    
    // Create a mock function that succeeds
    const mockOperation = jest.fn().mockResolvedValue('success');
    
    // Execute with circuit breaker
    const result = await ResilienceStrategies.withCircuitBreaker(
      mockOperation,
      {
        circuitName,
        failureThreshold: 3,
        resetTimeoutMs: 10000
      }
    );
    
    // Should execute function and return result
    expect(mockOperation).toHaveBeenCalledTimes(1);
    expect(result).toBe('success');
  });
  
  test('should open circuit after threshold failures', async () => {
    const circuitName = 'test-circuit-open';
    
    // Create a mock function that always fails
    const mockOperation = jest.fn().mockRejectedValue(new Error('test failure'));
    
    // Try multiple times - circuit should open after threshold
    const failureThreshold = 3;
    
    // First few calls should attempt the operation
    for (let i = 0; i < failureThreshold; i++) {
      try {
        await ResilienceStrategies.withCircuitBreaker(
          mockOperation,
          {
            circuitName,
            failureThreshold,
            resetTimeoutMs: 10000
          }
        );
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('test failure');
      }
    }
    
    // After threshold, circuit should be open and reject immediately
    try {
      await ResilienceStrategies.withCircuitBreaker(
        mockOperation,
        {
          circuitName,
          failureThreshold,
          resetTimeoutMs: 10000
        }
      );
      fail('Should have thrown an error');
    } catch (error: any) {
      // Should be circuit open error, not the original error
      expect(error.message).toContain(`Circuit breaker ${circuitName} is open`);
      
      // Operation should not have been called again
      expect(mockOperation).toHaveBeenCalledTimes(failureThreshold);
    }
  });
  
  test('should try again after reset timeout', async () => {
    const circuitName = 'test-circuit-reset';
    
    // Create a mock function that fails and then succeeds
    const mockOperation = jest.fn()
      .mockRejectedValueOnce(new Error('test failure 1'))
      .mockRejectedValueOnce(new Error('test failure 2'))
      .mockRejectedValueOnce(new Error('test failure 3'))
      .mockResolvedValue('success after reset');
    
    // Fail enough times to open the circuit
    const failureThreshold = 3;
    const resetTimeoutMs = 500; // Short timeout for testing
    
    // Open the circuit
    for (let i = 0; i < failureThreshold; i++) {
      try {
        await ResilienceStrategies.withCircuitBreaker(
          mockOperation,
          {
            circuitName,
            failureThreshold,
            resetTimeoutMs
          }
        );
      } catch (error) {
        // Expected
      }
    }
    
    // Wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, resetTimeoutMs * 1.1));
    
    // Circuit should try again now and succeed
    const result = await ResilienceStrategies.withCircuitBreaker(
      mockOperation,
      {
        circuitName,
        failureThreshold,
        resetTimeoutMs
      }
    );
    
    // Should have called the mock operation again
    expect(mockOperation).toHaveBeenCalledTimes(4);
    expect(result).toBe('success after reset');
  });
  
  test('should use half-open state to test circuit', async () => {
    const circuitName = 'test-circuit-half-open';
    
    // Create a mock that fails a lot and then succeeds
    const mockOperation = jest.fn();
    
    // Set up to fail 5 times, then succeed
    for (let i = 0; i < 5; i++) {
      mockOperation.mockRejectedValueOnce(new Error(`failure ${i}`));
    }
    mockOperation.mockResolvedValue('eventual success');
    
    // Open the circuit with 3 failures
    for (let i = 0; i < 3; i++) {
      try {
        await ResilienceStrategies.withCircuitBreaker(
          mockOperation,
          {
            circuitName,
            failureThreshold: 3,
            resetTimeoutMs: 500
          }
        );
      } catch (error) {
        // Expected
      }
    }
    
    // Wait for reset timeout to transition to half-open
    await new Promise(resolve => setTimeout(resolve, 600));
    
    // Should try again now (in half-open state)
    // This call will fail but be allowed through as a test
    try {
      await ResilienceStrategies.withCircuitBreaker(
        mockOperation,
        {
          circuitName,
          failureThreshold: 3,
          resetTimeoutMs: 500
        }
      );
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toBe('failure 3');
      
      // Circuit should be open again after this failure
      try {
        await ResilienceStrategies.withCircuitBreaker(
          mockOperation,
          {
            circuitName,
            failureThreshold: 3,
            resetTimeoutMs: 500
          }
        );
        fail('Should have thrown a circuit open error');
      } catch (error: any) {
        expect(error.message).toContain(`Circuit breaker ${circuitName} is open`);
      }
    }
    
    // Wait for another reset timeout
    await new Promise(resolve => setTimeout(resolve, 600));
    
    // Try again, it should still fail but allow the call
    try {
      await ResilienceStrategies.withCircuitBreaker(
        mockOperation,
        {
          circuitName,
          failureThreshold: 3,
          resetTimeoutMs: 500
        }
      );
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toBe('failure 4');
    }
    
    // Wait again
    await new Promise(resolve => setTimeout(resolve, 600));
    
    // Now it should succeed and close the circuit
    const result = await ResilienceStrategies.withCircuitBreaker(
      mockOperation,
      {
        circuitName,
        failureThreshold: 3,
        resetTimeoutMs: 500
      }
    );
    
    expect(result).toBe('eventual success');
    
    // Circuit should now be closed, so another call should work without waiting
    const secondResult = await ResilienceStrategies.withCircuitBreaker(
      jest.fn().mockResolvedValue('second success'),
      {
        circuitName,
        failureThreshold: 3,
        resetTimeoutMs: 500
      }
    );
    
    expect(secondResult).toBe('second success');
  });
  
  test('should combine with retry strategy', async () => {
    const circuitName = 'test-circuit-with-retry';
    
    // Create a mock that fails twice then succeeds on third try
    const mockOperation = jest.fn()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('second failure'))
      .mockResolvedValue('retry success');
    
    // Execute with circuit breaker and retry
    const result = await ResilienceStrategies.withCircuitBreaker(
      async () => {
        return await ResilienceStrategies.withRetry(
          mockOperation,
          { maxRetries: 3, baseDelayMs: 10 }
        );
      },
      {
        circuitName,
        failureThreshold: 2,
        resetTimeoutMs: 1000
      }
    );
    
    // Should have retried and succeeded before circuit opened
    expect(mockOperation).toHaveBeenCalledTimes(3);
    expect(result).toBe('retry success');
  });
});
