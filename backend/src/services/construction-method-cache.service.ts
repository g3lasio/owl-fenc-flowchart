// filepath: /workspaces/owl-fenc-flowchart/backend/src/services/construction-method-cache.service.ts

/**
 * Servicio de caché para métodos de construcción
 * Permite almacenar y recuperar métodos de construcción para evitar recalcularlos
 */
export class ConstructionMethodCacheService {
  private cache: Map<string, any>;
  private readonly defaultTTL: number; // Tiempo de vida en segundos
  
  constructor(defaultTTL = 86400) { // 24 horas por defecto
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
  }
  
  /**
   * Obtiene un método de construcción almacenado en caché
   */
  get(key: string): any {
    const item = this.cache.get(key);
    
    if (!item) return null;
    
    // Verificar si el item ha expirado
    if (item.expiry && item.expiry < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }
  
  /**
   * Almacena un método de construcción en caché
   */
  set(key: string, value: any, ttl?: number): void {
    const expiry = ttl ? Date.now() + ttl * 1000 : Date.now() + this.defaultTTL * 1000;
    
    this.cache.set(key, {
      value,
      expiry
    });
  }
  
  /**
   * Elimina un método de construcción de la caché
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }
  
  /**
   * Limpia toda la caché
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Elimina entradas expiradas de la caché
   */
  purgeExpired(): number {
    let purged = 0;
    const now = Date.now();
    
    for (const [key, item] of this.cache.entries()) {
      if (item.expiry && item.expiry < now) {
        this.cache.delete(key);
        purged++;
      }
    }
    
    return purged;
  }
}