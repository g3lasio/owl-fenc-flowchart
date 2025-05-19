import { TieredCacheService } from './tiered-cache.service';
import { CacheTier } from '../interfaces/cache.interfaces';

/**
 * A function to create a TieredCacheService instance for tests
 */
export function createTieredCacheForTests(options: any): any {
  // Create a new instance of TieredCacheService
  const service = new TieredCacheService(options);
  
  // Return the service as any type to bypass TypeScript checks
  return service;
}

/**
 * A function to create a TieredCacheService instance for tests using the singleton pattern
 */
export function getTieredCacheInstanceForTests(options: any): any {
  return TieredCacheService.getInstance(options);
}
