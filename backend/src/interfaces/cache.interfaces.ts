/**
 * Defines the different cache tiers available in the system
 */
export enum CacheTier {
  /**
   * In-memory cache (fastest, but volatile and not shared between services)
   */
  MEMORY = 'memory',
  
  /**
   * Persistent file-based cache (slower than memory, but survives restarts)
   */
  PERSISTENT = 'persistent',
  
  /**
   * Distributed cache (network-based, shared across services)
   */
  DISTRIBUTED = 'distributed'
}

/**
 * Cache policy for different types of data
 */
export interface CachePolicy {
  /**
   * Time to live in seconds
   */
  ttl: number;
  
  /**
   * Cache tiers to use for this type of data
   */
  tiers: CacheTier[];
  
  /**
   * Whether to refresh cache in the background before expiry
   */
  backgroundRefresh?: boolean;
  
  /**
   * Percentage of TTL after which background refresh should happen (0-1)
   */
  refreshThreshold?: number;
}

/**
 * Cache configuration for the application
 */
export interface CacheConfig {
  /**
   * Path for persistent cache files
   */
  cachePath: string;
  
  /**
   * Maximum size of memory cache (number of items)
   */
  memoryCacheMaxSize: number;
  
  /**
   * Default TTL for memory cache items in seconds
   */
  memoryCacheDefaultTTL: number;
  
  /**
   * Default TTL for persistent cache items in seconds
   */
  persistentCacheDefaultTTL: number;
  
  /**
   * Predefined cache policies for different types of data
   */
  policies: {
    [key: string]: CachePolicy;
  };
}

/**
 * Cache entry with value and metadata
 */
export interface CacheEntry<T> {
  /**
   * The cached value
   */
  value: T;
  
  /**
   * Expiry timestamp in milliseconds since epoch
   */
  expiry: number;
  
  /**
   * When the cache entry was created
   */
  createdAt: number;
  
  /**
   * Optional metadata for the cache entry
   */
  metadata?: Record<string, any>;
}
