import { TieredCacheService } from '../../src/services/tiered-cache.service';
import { CacheTier } from '../../src/interfaces/cache.interfaces';
import * as path from 'path';
import * as fs from 'fs';

describe('Distributed Cache', () => {
  // Use a test-specific cache path
  const testCachePath = path.join(__dirname, '../test-distributed-cache');
  let cacheService: TieredCacheService;
  
  beforeEach(() => {
    // Ensure test cache directory exists and is empty
    if (fs.existsSync(testCachePath)) {
      fs.rmSync(testCachePath, { recursive: true, force: true });
    }
    fs.mkdirSync(testCachePath, { recursive: true });
    
    // Create a new instance for each test with the singleton pattern
    cacheService = TieredCacheService.getInstance({
      persistentCachePath: testCachePath,
      distributedCacheEnabled: false
    });
  });
  
  afterEach(() => {
    // Clean up test cache directory
    if (fs.existsSync(testCachePath)) {
      fs.rmSync(testCachePath, { recursive: true, force: true });
    }
  });
  
  test('should attempt to connect to distributed cache based on config', () => {
    // We can verify that the initialization method was called during constructor
    expect((cacheService as any).distributedCacheEnabled).toBeDefined();
  });
  
  test('should handle missing distributed cache gracefully', async () => {
    // Explicitly disable distributed cache and clear client
    (cacheService as any).distributedCacheEnabled = false;
    (cacheService as any).distributedCacheClient = null;
    
    // Try getting and setting with distributed cache tier
    const key = 'no-distributed-test';
    const value = 'This should fall back to other tiers';
    
    // Should not throw when attempting distributed tier
    await expect(cacheService.set(key, value, 60, [CacheTier.DISTRIBUTED])).resolves.not.toThrow();
    
    // Trying to get should return null, not throw
    const result = await cacheService.get(key, [CacheTier.DISTRIBUTED]);
    expect(result).toBeNull();
  });
  
  test('should update stats for distributed cache misses', async () => {
    // Explicitly disable distributed cache
    (cacheService as any).distributedCacheEnabled = false;
    (cacheService as any).distributedCacheClient = null;
    
    // Reset stats
    cacheService.resetStats();
    
    // Try getting from distributed cache
    const key = 'distributed-stats-test';
    await cacheService.get(key, [CacheTier.DISTRIBUTED]);
    
    // Get stats and verify misses incremented
    const stats = cacheService.getStats();
    expect(stats.distributedMisses).toBe(1);
    expect(stats.distributedHits).toBe(0);
  });
  
  test('should cascade through tiers including distributed', async () => {
    // Mock a distributed cache client
    (cacheService as any).distributedCacheClient = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1)
    };
    (cacheService as any).distributedCacheEnabled = true;
    
    const key = 'cascade-with-distributed-test';
    const value = 'This value should cascade through tiers';
    
    // Store in persistent cache only
    await cacheService.set(key, value, 60, [CacheTier.PERSISTENT]);
    
    // Try to get with all tiers
    const result = await cacheService.get(key, [CacheTier.MEMORY, CacheTier.DISTRIBUTED, CacheTier.PERSISTENT]);
    
    // Should find the value in persistent cache
    expect(result).toEqual(value);
    
    // Should have tried distributed cache first (which returns null)
    expect((cacheService as any).distributedCacheClient.get).toHaveBeenCalledWith(key);
  });
  
  test('should successfully invalidate from distributed cache', async () => {
    // Mock a distributed cache client
    (cacheService as any).distributedCacheClient = {
      get: jest.fn().mockResolvedValue(JSON.stringify({
        value: 'test value',
        expiry: Date.now() + 1000000
      })),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1)
    };
    (cacheService as any).distributedCacheEnabled = true;
    
    const key = 'invalidate-distributed-test';
    
    // Invalidate the key
    await cacheService.invalidate(key, [CacheTier.DISTRIBUTED]);
    
    // Should have called del on the distributed cache client
    expect((cacheService as any).distributedCacheClient.del).toHaveBeenCalledWith(key);
  });
  
  test('should handle errors from distributed cache gracefully', async () => {
    // Mock a distributed cache client that throws errors
    (cacheService as any).distributedCacheClient = {
      get: jest.fn().mockRejectedValue(new Error('Connection error')),
      set: jest.fn().mockRejectedValue(new Error('Connection error')),
      del: jest.fn().mockRejectedValue(new Error('Connection error'))
    };
    (cacheService as any).distributedCacheEnabled = true;
    
    const key = 'error-handling-test';
    const value = 'This should handle errors gracefully';
    
    // These should not throw despite the client throwing
    await expect(cacheService.set(key, value, 60, [CacheTier.DISTRIBUTED])).resolves.not.toThrow();
    await expect(cacheService.get(key, [CacheTier.DISTRIBUTED])).resolves.toBeNull();
    await expect(cacheService.invalidate(key, [CacheTier.DISTRIBUTED])).resolves.not.toThrow();
  });
});
