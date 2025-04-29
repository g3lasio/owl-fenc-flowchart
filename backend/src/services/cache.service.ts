import NodeCache from 'node-cache';
import { MaterialCache, MaterialPriceEntry, PricedMaterialCacheItem } from '../interfaces/calculators.interfaces';
import { PricedMaterial, RequiredMaterial } from '../interfaces/fence.interfaces';

/**
 * Servicio de caché para precios de materiales
 */
export class MaterialCacheService implements MaterialCache {
  private cache: NodeCache;
  
  constructor(ttlSeconds: number = 86400) { // Por defecto, 24 horas
    this.cache = new NodeCache({
      stdTTL: ttlSeconds,
      checkperiod: ttlSeconds * 0.2, // Verificar validez cada 20% del TTL
      useClones: false
    });
  }

  /**
   * Genera una clave única para un material en una ubicación
   */
  private getCacheKey(materialId: string, zipCode: string): string {
    return `${materialId}:${zipCode}`;
  }

  /**
   * Obtiene información de precio para un material específico
   */
  get(materialId: string, location: string): PricedMaterialCacheItem | null {
    const key = this.getCacheKey(materialId, location);
    const data = this.cache.get(key);
    
    if (data) {
      const { unitPrice, priceSource } = data as { unitPrice: number, priceSource: string };
      return {
        unitPrice,
        source: priceSource,
        timestamp: new Date()
      };
    }
    
    return null;
  }

  /**
   * Almacena un precio de material en el caché
   */
  set(entry: MaterialPriceEntry): void {
    const key = this.getCacheKey(entry.id, entry.location);
    
    this.cache.set(key, {
      unitPrice: entry.unitPrice,
      priceSource: entry.priceSource
    });
  }

  /**
   * Obtiene información de precio para una lista de materiales
   * @returns Un Map con los materiales que se encontraron en caché
   */
  getMaterialPrices(materials: RequiredMaterial[], location: { zipCode: string }): Map<string, PricedMaterial> {
    const result = new Map<string, PricedMaterial>();
    
    materials.forEach(material => {
      const cacheKey = this.getCacheKey(material.id, location.zipCode);
      const cachedData = this.cache.get(cacheKey);
      
      if (cachedData) {
        const { unitPrice, priceSource } = cachedData as { unitPrice: number, priceSource: string };
        
        const pricedMaterial: PricedMaterial = {
          ...material,
          unitPrice,
          priceSource,
          totalPrice: unitPrice * material.quantity
        };
        
        result.set(material.id, pricedMaterial);
      }
    });
    
    return result;
  }

  /**
   * Invalida (elimina) un material específico del caché en todas las ubicaciones
   */
  invalidate(materialId: string): void {
    // Buscar todas las claves que contengan este materialId
    const allKeys = this.cache.keys();
    const keysToDelete = allKeys.filter(key => key.startsWith(`${materialId}:`));
    
    keysToDelete.forEach(key => this.cache.del(key));
  }

  /**
   * Invalida todos los materiales para una ubicación específica
   */
  invalidateByRegion(location: string): void {
    // Buscar todas las claves que terminen con esta ubicación
    const allKeys = this.cache.keys();
    const keysToDelete = allKeys.filter(key => key.endsWith(`:${location}`));
    
    keysToDelete.forEach(key => this.cache.del(key));
  }

  /**
   * Elimina un precio de material del caché
   */
  remove(materialId: string, zipCode: string): boolean {
    const key = this.getCacheKey(materialId, zipCode);
    return this.cache.del(key) > 0;
  }

  /**
   * Limpia todo el caché
   */
  clear(): void {
    this.cache.flushAll();
  }
}