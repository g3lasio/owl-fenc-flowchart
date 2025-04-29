// filepath: /workspaces/owl-fenc-flowchart/backend/src/services/construction-method-cache.service.ts
import { ConstructionMethodCache, ConstructionMethodResult, ClimateType, SoilType } from '../interfaces/construction-methods.interfaces';
import { FenceType } from '../interfaces/fence.interfaces';

/**
 * Servicio de caché para métodos de construcción
 * Almacena temporalmente los métodos de construcción para evitar consultas repetitivas
 */
export class ConstructionMethodCacheService implements ConstructionMethodCache {
  private cache: Map<string, {
    data: ConstructionMethodResult,
    timestamp: number
  }> = new Map();
  
  // Tiempo de vida de la caché: 30 días en milisegundos
  private readonly CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
  
  /**
   * Construye una clave única para el caché
   */
  private buildKey(fenceType: FenceType, soilType: SoilType, climate: ClimateType): string {
    return `${fenceType.toLowerCase()}_${soilType.toLowerCase()}_${climate.toLowerCase()}`;
  }
  
  /**
   * Obtiene un método de construcción desde la caché
   */
  getMethod(
    fenceType: FenceType, 
    soilType: SoilType,
    climate: ClimateType
  ): ConstructionMethodResult | null {
    const key = this.buildKey(fenceType, soilType, climate);
    const cachedItem = this.cache.get(key);
    
    if (!cachedItem) {
      return null;
    }
    
    // Verificar si el caché está vigente
    const now = Date.now();
    if (now - cachedItem.timestamp > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return cachedItem.data;
  }
  
  /**
   * Guarda un método de construcción en la caché
   */
  setMethod(
    fenceType: FenceType, 
    soilType: SoilType,
    climate: ClimateType,
    method: ConstructionMethodResult
  ): void {
    const key = this.buildKey(fenceType, soilType, climate);
    
    this.cache.set(key, {
      data: method,
      timestamp: Date.now()
    });
  }
  
  /**
   * Invalida una entrada específica en la caché
   */
  invalidate(fenceType: FenceType, soilType: SoilType, climate: ClimateType): void {
    const key = this.buildKey(fenceType, soilType, climate);
    this.cache.delete(key);
  }
  
  /**
   * Invalida entradas más antiguas que cierta cantidad de días
   * @returns Número de entradas eliminadas
   */
  invalidateOlderThan(days: number): number {
    const threshold = Date.now() - (days * 24 * 60 * 60 * 1000);
    let count = 0;
    
    this.cache.forEach((value, key) => {
      if (value.timestamp < threshold) {
        this.cache.delete(key);
        count++;
      }
    });
    
    return count;
  }
}