import fs from 'fs';
import path from 'path';
import { PricedMaterialCacheItem } from '../interfaces/calculators.interfaces';

/**
 * Servicio de caché mejorado con persistencia en disco
 * Guarda los resultados para reutilizarlos incluso después de reiniciar el servidor
 */
export class PersistentCacheService {
  private cachePath: string;
  private cache: Map<string, any>;
  private memoryOnlyKeys: Set<string>;
  
  constructor(cacheFolder: string = 'cache') {
    // Crear directorio de caché si no existe
    this.cachePath = path.join(process.cwd(), cacheFolder);
    if (!fs.existsSync(this.cachePath)) {
      fs.mkdirSync(this.cachePath, { recursive: true });
    }
    
    this.cache = new Map<string, any>();
    this.memoryOnlyKeys = new Set<string>();
    
    // Cargar caché existente al iniciar
    this.loadCacheFromDisk();
  }
  
  /**
   * Guarda un valor en caché con tiempo de expiración opcional
   */
  set(key: string, value: any, ttlSeconds?: number, persistToDisk: boolean = true): void {
    const item = {
      value,
      expires: ttlSeconds ? Date.now() + (ttlSeconds * 1000) : null
    };
    
    this.cache.set(key, item);
    
    if (!persistToDisk) {
      this.memoryOnlyKeys.add(key);
    } else {
      // Solo guardar en disco ítems persistentes
      this.saveCacheToDisk();
    }
  }
  
  /**
   * Obtiene un valor de la caché si existe y no ha expirado
   */
  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) return null;
    
    // Comprobar si ha expirado
    if (item.expires && item.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value as T;
  }
  
  /**
   * Elimina un valor de la caché
   */
  delete(key: string): boolean {
    const result = this.cache.delete(key);
    this.memoryOnlyKeys.delete(key);
    this.saveCacheToDisk();
    return result;
  }
  
  /**
   * Limpia toda la caché
   */
  clear(): void {
    this.cache.clear();
    this.memoryOnlyKeys.clear();
    this.saveCacheToDisk();
  }
  
  /**
   * Guarda la caché en disco
   */
  private saveCacheToDisk(): void {
    try {
      // Filtrar elementos que no deben persistir
      const persistentCache: Record<string, any> = {};
      
      this.cache.forEach((value, key) => {
        if (!this.memoryOnlyKeys.has(key)) {
          persistentCache[key] = value;
        }
      });
      
      fs.writeFileSync(
        path.join(this.cachePath, 'cache.json'),
        JSON.stringify(persistentCache, null, 2)
      );
    } catch (error) {
      console.error('Error al guardar caché en disco:', error);
    }
  }
  
  /**
   * Carga la caché desde el disco
   */
  private loadCacheFromDisk(): void {
    try {
      const cachePath = path.join(this.cachePath, 'cache.json');
      
      if (fs.existsSync(cachePath)) {
        const data = fs.readFileSync(cachePath, 'utf8');
        const loadedCache = JSON.parse(data);
        
        // Restaurar en memoria
        Object.entries(loadedCache).forEach(([key, value]) => {
          this.cache.set(key, value);
        });
        
        console.log(`Caché cargada desde disco: ${this.cache.size} elementos`);
      }
    } catch (error) {
      console.error('Error al cargar caché desde disco:', error);
    }
  }
}