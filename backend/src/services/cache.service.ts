import * as fs from 'fs';
import * as path from 'path';
import { generateUniqueId, safeJsonParse } from '../utils/common.utils';
import { config } from '../config/config';

/**
 * Opciones para la configuración del caché
 */
export interface CacheOptions {
  ttl: number;                  // Tiempo de vida en segundos
  maxItems?: number;            // Número máximo de items en caché
  persistent?: boolean;         // Si el caché debe persistir a disco
  cachePath?: string;           // Ruta para el caché persistente
  namespace?: string;           // Espacio de nombres para separar diferentes cachés
}

/**
 * Entrada de caché con metadatos
 */
interface CacheEntry<T> {
  value: T;                     // Valor almacenado
  timestamp: number;            // Timestamp de cuando se guardó
  expiration: number;           // Timestamp de expiración
  key: string;                  // Clave para referencia
  metadata?: Record<string, any>; // Metadatos opcionales (tags, etc.)
}

/**
 * Servicio de caché centralizado y mejorado
 * Soporta TTL, persistencia, y manejo de metadatos
 */
export class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private options: CacheOptions;
  private persistenceInterval: NodeJS.Timeout | null = null;

  /**
   * Constructor del servicio de caché
   */
  constructor(options: Partial<CacheOptions> = {}) {
    this.options = {
      ttl: options.ttl || config.cache.ttl || 3600, // 1 hora por defecto
      maxItems: options.maxItems || 1000,
      persistent: options.persistent || false,
      cachePath: options.cachePath || path.join(process.cwd(), '.cache'),
      namespace: options.namespace || 'default'
    };

    // Inicializar caché persistente
    if (this.options.persistent) {
      this.initPersistentCache();
    }
  }

  /**
   * Obtiene un valor del caché
   */
  get<T>(key: string): T | null {
    const namespaceKey = this.getNamespacedKey(key);
    const entry = this.cache.get(namespaceKey);

    // Verificar si existe y si no ha expirado
    if (entry && Date.now() < entry.expiration) {
      return entry.value as T;
    }

    // Si ha expirado, eliminarlo
    if (entry) {
      this.cache.delete(namespaceKey);
    }

    return null;
  }

  /**
   * Guarda un valor en el caché
   */
  set<T>(key: string, value: T, options: { ttl?: number; metadata?: Record<string, any> } = {}): void {
    const namespaceKey = this.getNamespacedKey(key);
    const now = Date.now();
    const ttl = options.ttl || this.options.ttl;
    
    const entry: CacheEntry<T> = {
      value,
      timestamp: now,
      expiration: now + ttl * 1000,
      key,
      metadata: options.metadata
    };

    // Verificar si necesitamos hacer espacio
    if (this.cache.size >= (this.options.maxItems || 1000)) {
      this.evictOldest();
    }

    this.cache.set(namespaceKey, entry);

    // Si es persistente, guardar inmediatamente o programar guardado
    if (this.options.persistent && !this.persistenceInterval) {
      this.schedulePersistence();
    }
  }

  /**
   * Elimina un valor del caché
   */
  delete(key: string): boolean {
    const namespaceKey = this.getNamespacedKey(key);
    return this.cache.delete(namespaceKey);
  }

  /**
   * Verifica si una clave existe y no ha expirado
   */
  has(key: string): boolean {
    const namespaceKey = this.getNamespacedKey(key);
    const entry = this.cache.get(namespaceKey);

    if (!entry) return false;
    
    const isValid = Date.now() < entry.expiration;
    
    // Limpiar si ha expirado
    if (!isValid) {
      this.cache.delete(namespaceKey);
    }
    
    return isValid;
  }

  /**
   * Limpia todo el caché
   */
  clear(): void {
    this.cache.clear();
    
    // Si es persistente, guardar el caché vacío
    if (this.options.persistent) {
      this.persistToDisk();
    }
  }

  /**
   * Elimina las entradas expiradas
   */
  cleanup(): number {
    const now = Date.now();
    let deletedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiration) {
        this.cache.delete(key);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Busca entradas que coincidan con ciertos metadatos
   */
  findByMetadata<T>(criteria: Record<string, any>): Array<{ key: string; value: T }> {
    const results: Array<{ key: string; value: T }> = [];
    const criteriaEntries = Object.entries(criteria);

    for (const [key, entry] of this.cache.entries()) {
      if (!entry.metadata) continue;

      // Verificar si todos los criterios coinciden
      const allMatch = criteriaEntries.every(([criteriaKey, criteriaValue]) => 
        entry.metadata?.[criteriaKey] === criteriaValue
      );

      if (allMatch && Date.now() < entry.expiration) {
        // Extraer el key original sin el namespace
        const originalKey = entry.key;
        results.push({ key: originalKey, value: entry.value as T });
      }
    }

    return results;
  }

  /**
   * Obtiene o establece un valor, con función para calcularlo si no existe
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, options: { ttl?: number; metadata?: Record<string, any> } = {}): Promise<T> {
    const cached = this.get<T>(key);
    
    if (cached !== null) {
      return cached;
    }
    
    const value = await factory();
    this.set(key, value, options);
    return value;
  }

  /**
   * Devuelve estadísticas del caché
   */
  getStats(): { size: number; hitRate: number; missRate: number; oldestEntry: Date; newestEntry: Date } {
    const now = Date.now();
    let oldest = now;
    let newest = 0;
    let validItems = 0;

    for (const entry of this.cache.values()) {
      if (now < entry.expiration) {
        validItems++;
        oldest = Math.min(oldest, entry.timestamp);
        newest = Math.max(newest, entry.timestamp);
      }
    }

    // TODO: Implementar conteo de hits/misses

    return {
      size: validItems,
      hitRate: 0, // Placeholder
      missRate: 0, // Placeholder
      oldestEntry: new Date(oldest),
      newestEntry: new Date(newest),
    };
  }

  // Métodos privados

  /**
   * Genera una clave con el namespace
   */
  private getNamespacedKey(key: string): string {
    return `${this.options.namespace}:${key}`;
  }

  /**
   * Elimina la entrada más antigua cuando se excede el límite
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Inicializa el caché persistente cargando de disco
   */
  private initPersistentCache(): void {
    try {
      const cachePath = this.getCachePath();
      
      // Crear directorio si no existe
      if (!fs.existsSync(path.dirname(cachePath))) {
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      }

      // Cargar caché si existe
      if (fs.existsSync(cachePath)) {
        const fileContent = fs.readFileSync(cachePath, 'utf-8');
        const savedCache = safeJsonParse<Array<CacheEntry<any>>>(fileContent, []);
        
        // Restaurar el caché y validar TTL
        if (Array.isArray(savedCache)) {
          const now = Date.now();
          
          for (const entry of savedCache) {
            // Solo agregar entradas no expiradas
            if (entry && entry.expiration > now) {
              this.cache.set(this.getNamespacedKey(entry.key), entry);
            }
          }
        }
      }

      // Programar guardado periódico
      this.schedulePersistence();
    } catch (error) {
      console.error('Error al inicializar caché persistente:', error);
    }
  }

  /**
   * Programa la persistencia periódica del caché
   */
  private schedulePersistence(): void {
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
    }
    
    // Guardar cada 5 minutos o según configuración
    const interval = config.cache.persistenceInterval || 5 * 60 * 1000;
    
    this.persistenceInterval = setInterval(() => {
      this.persistToDisk();
    }, interval);
  }

  /**
   * Guarda el caché en disco
   */
  private persistToDisk(): void {
    try {
      const cachePath = this.getCachePath();
      
      // Limpiar entradas expiradas antes de guardar
      this.cleanup();
      
      // Convertir el caché a formato serializable
      const serializable = Array.from(this.cache.values());
      
      // Guardar a disco
      fs.writeFileSync(cachePath, JSON.stringify(serializable), 'utf-8');
    } catch (error) {
      console.error('Error al persistir caché a disco:', error);
    }
  }

  /**
   * Obtiene la ruta completa del archivo de caché
   */
  private getCachePath(): string {
    return path.join(this.options.cachePath || '', `${this.options.namespace}.cache.json`);
  }

  /**
   * Destructor para limpieza al cerrar
   */
  destroy(): void {
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
      this.persistenceInterval = null;
    }
    
    // Guardar antes de cerrar
    if (this.options.persistent) {
      this.persistToDisk();
    }
  }
}