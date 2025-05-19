import { TieredCacheService } from '../../src/services/tiered-cache.service';
import { getTieredCacheInstanceForTests } from '../../src/services/tiered-cache-test-adapter';
import { CacheTier } from '../../src/interfaces/cache.interfaces';
import * as fs from 'fs';
import * as path from 'path';

describe('TieredCacheService', () => {
  // Use a test-specific cache path
  const testCachePath = path.join(__dirname, '../test-cache');
  let cacheService: TieredCacheService;
  
  beforeEach(() => {
    // Ensure test cache directory exists and is empty
    if (fs.existsSync(testCachePath)) {
      fs.rmSync(testCachePath, { recursive: true, force: true });
    }
    fs.mkdirSync(testCachePath, { recursive: true });
    
    // Create a new instance for each test
    cacheService = TieredCacheService.getInstance(testCachePath);
  });
  
  afterEach(() => {
    // Clean up test cache directory
    if (fs.existsSync(testCachePath)) {
      fs.rmSync(testCachePath, { recursive: true, force: true });
    }
  });
  
  describe('Memory Cache', () => {
    test('should store and retrieve values from memory cache', async () => {
      const key = 'memory-test-key';
      const value = { name: 'Test Value', data: [1, 2, 3] };
      
      // Store in memory cache only
      await cacheService.set(key, value, 60, [CacheTier.MEMORY]);
      
      // Retrieve from memory cache
      const retrieved = await cacheService.get(key, [CacheTier.MEMORY]);
      
      expect(retrieved).toEqual(value);
    });
    
    test('should respect TTL for memory cache', async () => {
      const key = 'memory-ttl-test';
      const value = 'This should expire quickly';
      
      // Store with very short TTL (1 second)
      await cacheService.set(key, value, 1, [CacheTier.MEMORY]);
      
      // Should be available immediately
      let retrieved = await cacheService.get(key, [CacheTier.MEMORY]);
      expect(retrieved).toEqual(value);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be gone after TTL
      retrieved = await cacheService.get(key, [CacheTier.MEMORY]);
      expect(retrieved).toBeNull();
    });
  });
  
  describe('Persistent Cache', () => {
    test('should store and retrieve values from persistent cache', async () => {
      const key = 'persistent-test-key';
      const value = { name: 'Persistent Test', timestamp: Date.now() };
      
      // Store in persistent cache only
      await cacheService.set(key, value, 3600, [CacheTier.PERSISTENT]);
      
      // Verify file was created
      const cacheFilePath = path.join(testCachePath, `${key}.json`);
      expect(fs.existsSync(cacheFilePath)).toBeTruthy();
      
      // Retrieve from persistent cache
      const retrieved = await cacheService.get(key, [CacheTier.PERSISTENT]);
      
      expect(retrieved).toEqual(value);
    });
    
    test('should respect TTL for persistent cache', async () => {
      const key = 'persistent-ttl-test';
      const value = 'This should expire from persistent cache';
      
      // Store with very short TTL
      await cacheService.set(key, value, 1, [CacheTier.PERSISTENT]);
      
      // Should be available immediately
      let retrieved = await cacheService.get(key, [CacheTier.PERSISTENT]);
      expect(retrieved).toEqual(value);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be gone after TTL
      retrieved = await cacheService.get(key, [CacheTier.PERSISTENT]);
      expect(retrieved).toBeNull();
    });
  });
  
  describe('Cache Invalidation', () => {
    test('should invalidate cache entries correctly', async () => {
      const key = 'invalidation-test';
      const value = 'This should be invalidated';
      
      // Store in both memory and persistent cache
      await cacheService.set(key, value, 3600, [CacheTier.MEMORY, CacheTier.PERSISTENT]);
      
      // Verify it was stored
      let retrieved = await cacheService.get(key);
      expect(retrieved).toEqual(value);
      
      // Invalidate
      await cacheService.invalidate(key);
      
      // Should be gone from both tiers
      retrieved = await cacheService.get(key, [CacheTier.MEMORY]);
      expect(retrieved).toBeNull();
      
      retrieved = await cacheService.get(key, [CacheTier.PERSISTENT]);
      expect(retrieved).toBeNull();
    });
  });
  
  describe('Cache Warming', () => {
    test('should retrieve from cache when warmed', async () => {
      const key = 'warm-cache-test';
      const value = 'Warmed value';
      
      let functionCalled = false;
      
      // Warm the cache with a function that returns the value
      const warmedValue = await cacheService.warm(
        key, 
        async () => {
          functionCalled = true;
          return value;
        },
        60
      );
      
      // First call should execute the function
      expect(functionCalled).toBeTruthy();
      expect(warmedValue).toEqual(value);
      
      // Reset flag
      functionCalled = false;
      
      // Second call should use the cached value
      const cachedValue = await cacheService.warm(
        key,
        async () => {
          functionCalled = true;
          return 'Different value';
        },
        60
      );
      
      // Function should not be called again
      expect(functionCalled).toBeFalsy();
      
      // Should return the previously cached value
      expect(cachedValue).toEqual(value);
    });
  });
  
  describe('Cache Statistics', () => {
    test('should track cache hits and misses', async () => {
      // Reset stats
      cacheService.resetStats();
      
      const key = 'stats-test';
      const value = 'Stats test value';
      
      // First access should be a miss
      let result = await cacheService.get(key, [CacheTier.MEMORY]);
      expect(result).toBeNull();
      
      // Store the value
      await cacheService.set(key, value, 60, [CacheTier.MEMORY]);
      
      // Next access should be a hit
      result = await cacheService.get(key, [CacheTier.MEMORY]);
      expect(result).toEqual(value);
      
      // Get stats
      const stats = cacheService.getStats();
      
      // Should have 1 hit and 1 miss for memory cache
      expect(stats.memoryHits).toBe(1);
      expect(stats.memoryMisses).toBe(1);
    });
  });
  
  describe('Multi-tier Cache', () => {
    test('should cascade through cache tiers', async () => {
      const key = 'cascade-test';
      const value = 'Cascade test value';
      
      // Store only in persistent cache
      await cacheService.set(key, value, 60, [CacheTier.PERSISTENT]);
      
      // First, try to get from memory (should fail)
      let result = await cacheService.get(key, [CacheTier.MEMORY]);
      expect(result).toBeNull();
      
      // Now try with both tiers - should find in persistent and populate memory
      result = await cacheService.get(key);
      expect(result).toEqual(value);
      
      // Now memory should have it too
      result = await cacheService.get(key, [CacheTier.MEMORY]);
      expect(result).toEqual(value);
    });
  });
});
