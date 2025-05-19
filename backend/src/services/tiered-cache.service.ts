import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { config } from '../config/config';
import { CacheTier } from '../interfaces/cache.interfaces';

/**
 * Tiered caching service that provides multiple levels of caching:
 * - Memory cache (fastest, volatile)
 * - Persistent cache (slower, durable)
 * - Distributed cache (network-based, shared across services)
 */
export class TieredCacheService {
  private static instance: TieredCacheService;
  
  // Memory cache (first tier - fastest)
  private memoryCache: Map<string, { value: any; expiry: number }> = new Map();
  
  // Cache paths
  private persistentCachePath: string;
  
  // Cache configuration
  private memoryCacheMaxSize: number;
  private memoryCacheDefaultTTL: number; // in seconds
  private persistentCacheDefaultTTL: number; // in seconds
  
  // Distributed cache client (could be Redis or similar)
  private distributedCacheClient: any;
  private distributedCacheEnabled: boolean;
  private distributedCacheUrl: string;
  
  // Statistics for performance monitoring
  private stats = {
    memoryHits: 0,
    memoryMisses: 0,
    persistentHits: 0, 
    persistentMisses: 0,
    distributedHits: 0,
    distributedMisses: 0
  };

  /**
   * Configuration options for tiered cache
   */
  export interface TieredCacheOptions {
    memoryTTL?: number;
    persistentCachePath?: string;
    persistentTTL?: number;
    distributedCacheEnabled?: boolean;
    distributedCacheUrl?: string;
  }

  private constructor(
    options?: TieredCacheOptions | string
  ) {
    // Handle the case where the first parameter is a string (for backward compatibility)
    if (typeof options === 'string') {
      this.persistentCachePath = options;
      this.memoryCacheMaxSize = config.cache.memoryCacheMaxSize || 1000;
      this.memoryCacheDefaultTTL = config.cache.memoryCacheDefaultTTL || 300;
      this.persistentCacheDefaultTTL = config.cache.persistentCacheDefaultTTL || 86400;
    } else {
      const opts = options || {};
      this.persistentCachePath = opts.persistentCachePath || config.cache.cachePath;
      this.memoryCacheMaxSize = config.cache.memoryCacheMaxSize || 1000;
      this.memoryCacheDefaultTTL = opts.memoryTTL || config.cache.memoryCacheDefaultTTL || 300;
      this.persistentCacheDefaultTTL = opts.persistentTTL || config.cache.persistentCacheDefaultTTL || 86400;
      this.distributedCacheEnabled = opts.distributedCacheEnabled || false;
      this.distributedCacheUrl = opts.distributedCacheUrl || '';
    }
    
    // Ensure cache directory exists
    this.ensureCacheDirectoryExists(this.persistentCachePath);
    
    // Start the memory cache cleanup process
    this.startMemoryCacheCleanup();

    // Initialize distributed cache client
    this.initializeDistributedCache();
  }

  /**
   * Get singleton instance of TieredCacheService
   */
  public static getInstance(options?: TieredCacheOptions | string): TieredCacheService {
    if (!TieredCacheService.instance) {
      TieredCacheService.instance = new TieredCacheService(options);
    }
    return TieredCacheService.instance;
  }

  /**
   * Get a value from cache with specified tiers to try
   * @param key The cache key
   * @param tiers Array of cache tiers to try, in order
   * @param deserialize Function to deserialize the cached data
   */
  async get<T>(key: string, tiers: CacheTier[] = [CacheTier.MEMORY, CacheTier.PERSISTENT], deserialize?: (data: any) => T): Promise<T | null> {
    const normalizedKey = this.normalizeKey(key);
    
    // Try each tier in order
    for (const tier of tiers) {
      try {
        let value: T | null = null;
        
        switch (tier) {
          case CacheTier.MEMORY:
            value = await this.getFromMemory<T>(normalizedKey);
            break;
          case CacheTier.PERSISTENT:
            value = await this.getFromPersistent<T>(normalizedKey, deserialize);
            break;
          case CacheTier.DISTRIBUTED:
            value = await this.getFromDistributed<T>(normalizedKey);
            break;
        }
        
        if (value !== null) {
          // Found in this tier, return it
          return value;
        }
      } catch (error) {
        console.warn(`Error retrieving from ${tier} cache:`, error);
        // Continue to next tier on error
      }
    }
    
    // Not found in any tier
    return null;
  }

  /**
   * Store a value in multiple cache tiers
   * @param key The cache key
   * @param value The value to store
   * @param ttl Time to live in seconds
   * @param tiers Array of cache tiers to store in
   */
  async set(key: string, value: any, ttl: number = this.memoryCacheDefaultTTL, tiers: CacheTier[] = [CacheTier.MEMORY, CacheTier.PERSISTENT]): Promise<void> {
    const normalizedKey = this.normalizeKey(key);
    
    // Store in each tier
    for (const tier of tiers) {
      try {
        switch (tier) {
          case CacheTier.MEMORY:
            await this.setInMemory(normalizedKey, value, ttl);
            break;
          case CacheTier.PERSISTENT:
            await this.setInPersistent(normalizedKey, value, ttl);
            break;
          case CacheTier.DISTRIBUTED:
            await this.setInDistributed(normalizedKey, value, ttl);
            break;
        }
      } catch (error) {
        console.warn(`Error storing in ${tier} cache:`, error);
        // Continue to next tier on error
      }
    }
  }

  /**
   * Remove a value from all specified cache tiers
   * @param key The cache key
   * @param tiers Array of cache tiers to invalidate
   */
  async invalidate(key: string, tiers: CacheTier[] = [CacheTier.MEMORY, CacheTier.PERSISTENT, CacheTier.DISTRIBUTED]): Promise<void> {
    const normalizedKey = this.normalizeKey(key);
    
    // Remove from each tier
    for (const tier of tiers) {
      try {
        switch (tier) {
          case CacheTier.MEMORY:
            this.memoryCache.delete(normalizedKey);
            break;
          case CacheTier.PERSISTENT:
            await this.invalidateFromPersistent(normalizedKey);
            break;
          case CacheTier.DISTRIBUTED:
            await this.invalidateFromDistributed(normalizedKey);
            break;
        }
      } catch (error) {
        console.warn(`Error invalidating from ${tier} cache:`, error);
      }
    }
  }

  /**
   * Prefetch and warm the cache with specified data
   * @param key The cache key
   * @param getter Function to retrieve the data if not cached
   * @param ttl Time to live in seconds
   * @param tiers Tiers to check and store in
   */
  async warm<T>(key: string, getter: () => Promise<T>, ttl: number = this.memoryCacheDefaultTTL, tiers: CacheTier[] = [CacheTier.MEMORY, CacheTier.PERSISTENT]): Promise<T> {
    // Try to get from cache first
    const cachedValue = await this.get<T>(key, tiers);
    
    if (cachedValue !== null) {
      return cachedValue;
    }
    
    // Not in cache, retrieve it
    const value = await getter();
    
    // Store in cache
    await this.set(key, value, ttl, tiers);
    
    return value;
  }

  /**
   * Get cache statistics
   */
  getStats(): any {
    return {
      ...this.stats,
      memorySize: this.memoryCache.size,
      memoryHitRate: this.calculateHitRate(this.stats.memoryHits, this.stats.memoryMisses),
      persistentHitRate: this.calculateHitRate(this.stats.persistentHits, this.stats.persistentMisses),
      distributedHitRate: this.calculateHitRate(this.stats.distributedHits, this.stats.distributedMisses),
      overallHitRate: this.calculateOverallHitRate()
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = {
      memoryHits: 0,
      memoryMisses: 0,
      persistentHits: 0,
      persistentMisses: 0,
      distributedHits: 0,
      distributedMisses: 0
    };
  }

  /**
   * Get a value from memory cache
   */
  private getFromMemory<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    
    if (!entry) {
      this.stats.memoryMisses++;
      return null;
    }
    
    // Check if entry has expired
    if (entry.expiry < Date.now()) {
      this.memoryCache.delete(key);
      this.stats.memoryMisses++;
      return null;
    }
    
    this.stats.memoryHits++;
    return entry.value as T;
  }

  /**
   * Store a value in memory cache
   */
  private setInMemory(key: string, value: any, ttl: number): void {
    // Enforce capacity limit with LRU-like behavior
    if (this.memoryCache.size >= this.memoryCacheMaxSize) {
      // Simple LRU implementation: delete oldest entries first
      // In a production system, you might want a more sophisticated LRU implementation
      const oldestKeys = Array.from(this.memoryCache.keys()).slice(0, Math.ceil(this.memoryCacheMaxSize * 0.2));
      for (const oldKey of oldestKeys) {
        this.memoryCache.delete(oldKey);
      }
    }
    
    // Set the value with expiry
    const expiry = Date.now() + (ttl * 1000);
    this.memoryCache.set(key, { value, expiry });
  }

  /**
   * Get a value from persistent cache
   */
  private async getFromPersistent<T>(key: string, deserialize?: (data: any) => T): Promise<T | null> {
    const filePath = this.getCacheFilePath(key);
    
    try {
      if (!fs.existsSync(filePath)) {
        this.stats.persistentMisses++;
        return null;
      }
      
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Check if data has expired
      if (data.expiry < Date.now()) {
        // Remove expired data
        fs.unlinkSync(filePath);
        this.stats.persistentMisses++;
        return null;
      }
      
      this.stats.persistentHits++;
      
      // Apply custom deserialization if provided
      if (deserialize) {
        return deserialize(data.value);
      }
      
      return data.value as T;
    } catch (error) {
      this.stats.persistentMisses++;
      console.error(`Error reading from persistent cache (${key}):`, error);
      return null;
    }
  }

  /**
   * Store a value in persistent cache
   */
  private async setInPersistent(key: string, value: any, ttl: number): Promise<void> {
    const filePath = this.getCacheFilePath(key);
    
    try {
      const expiry = Date.now() + (ttl * 1000);
      const data = {
        value,
        expiry,
        createdAt: Date.now()
      };
      
      fs.writeFileSync(filePath, JSON.stringify(data));
    } catch (error) {
      console.error(`Error writing to persistent cache (${key}):`, error);
      throw error;
    }
  }

  /**
   * Remove a value from persistent cache
   */
  private async invalidateFromPersistent(key: string): Promise<void> {
    const filePath = this.getCacheFilePath(key);
    
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Error invalidating from persistent cache (${key}):`, error);
      throw error;
    }
  }

  /**
   * Get a value from distributed cache
   * This implementation will work with a Redis-compatible client
   */
  private async getFromDistributed<T>(key: string): Promise<T | null> {
    // Check if distributed cache is enabled and initialized
    if (!this.distributedCacheEnabled || !this.distributedCacheClient) {
      this.stats.distributedMisses++;
      return null;
    }
    
    try {
      // Get from distributed cache
      const value = await this.distributedCacheClient.get(key);
      
      if (!value) {
        this.stats.distributedMisses++;
        return null;
      }
      
      // Parse the JSON value
      const parsed = JSON.parse(value);
      
      // Check if the value has expired (Redis can handle TTL for us, but this is a backup)
      if (parsed.expiry && parsed.expiry < Date.now()) {
        // Remove expired key
        await this.distributedCacheClient.del(key);
        this.stats.distributedMisses++;
        return null;
      }
      
      this.stats.distributedHits++;
      
      // Also store in memory cache for faster future access
      this.setInMemory(key, parsed.value, this.memoryCacheDefaultTTL);
      
      return parsed.value as T;
    } catch (error) {
      console.error(`Error getting from distributed cache (${key}):`, error);
      this.stats.distributedMisses++;
      return null;
    }
  }

  /**
   * Store a value in distributed cache
   */
  private async setInDistributed(key: string, value: any, ttl: number): Promise<void> {
    // Check if distributed cache is enabled and initialized
    if (!this.distributedCacheEnabled || !this.distributedCacheClient) {
      return;
    }
    
    try {
      const expiry = Date.now() + (ttl * 1000);
      const data = {
        value,
        expiry,
        createdAt: Date.now()
      };
      
      // Store in Redis with TTL
      await this.distributedCacheClient.set(key, JSON.stringify(data), 'EX', ttl);
    } catch (error) {
      console.error(`Error setting in distributed cache (${key}):`, error);
    }
  }

  /**
   * Remove a value from distributed cache
   */
  private async invalidateFromDistributed(key: string): Promise<void> {
    // Check if distributed cache is enabled and initialized
    if (!this.distributedCacheEnabled || !this.distributedCacheClient) {
      return;
    }
    
    try {
      await this.distributedCacheClient.del(key);
    } catch (error) {
      console.error(`Error invalidating from distributed cache (${key}):`, error);
    }
  }

  /**
   * Initialize the distributed cache client (Redis)
   */
  private initializeDistributedCache(): void {
    // Skip if already initialized
    if (this.distributedCacheClient) {
      return;
    }
    
    // For now, distributed cache is disabled by default
    // In a real implementation, this would be configurable
    this.distributedCacheEnabled = false;
    this.distributedCacheUrl = '';
    
    if (!this.distributedCacheEnabled || !this.distributedCacheUrl) {
      console.log('Distributed cache not enabled or URL not configured');
      return;
    }
    
    try {
      // In a real implementation, we would initialize a Redis client here
      // For example:
      // const Redis = require('ioredis');
      // this.distributedCacheClient = new Redis(this.distributedCacheUrl);
      
      console.log('Distributed cache client initialized');
    } catch (error) {
      console.error('Failed to initialize distributed cache client:', error);
    }
  }

  /**
   * Get file path for persistent cache item
   */
  private getCacheFilePath(key: string): string {
    return path.join(this.persistentCachePath, `${key}.json`);
  }

  /**
   * Normalize cache key to be safe for filesystem
   */
  private normalizeKey(key: string): string {
    // For complex keys or long keys, use a hash
    if (key.length > 100 || key.includes('/')) {
      return createHash('md5').update(key).digest('hex');
    }
    
    // For simple keys, just replace unsafe characters
    return key.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Start periodic cleanup of expired memory cache entries
   */
  private startMemoryCacheCleanup(): void {
    // Run cleanup every minute
    setInterval(() => {
      this.cleanupExpiredMemoryCacheEntries();
    }, 60000);
  }

  /**
   * Clean up expired entries in memory cache
   */
  private cleanupExpiredMemoryCacheEntries(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiry < now) {
        this.memoryCache.delete(key);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      console.log(`Cleaned up ${expiredCount} expired memory cache entries`);
    }
  }

  /**
   * Calculate hit rate percentage
   */
  private calculateHitRate(hits: number, misses: number): number {
    const total = hits + misses;
    if (total === 0) return 0;
    return (hits / total) * 100;
  }

  /**
   * Calculate overall hit rate
   */
  private calculateOverallHitRate(): number {
    const totalHits = this.stats.memoryHits + this.stats.persistentHits + this.stats.distributedHits;
    const totalMisses = this.stats.memoryMisses + this.stats.persistentMisses + this.stats.distributedMisses;
    return this.calculateHitRate(totalHits, totalMisses);
  }
}
