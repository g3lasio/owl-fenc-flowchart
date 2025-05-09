import { CacheService } from '../services/cache.service';
import { ErrorHandlerEngine } from './error-handler.engine';
import { ERROR_CODES } from '../constants/shared.constants';

/**
 * Opciones básicas para inicializar un motor
 */
export interface BaseEngineOptions {
  useCache?: boolean;
  cacheTTL?: number;
  cacheNamespace?: string;
  persistCache?: boolean;
  debugMode?: boolean;
}

/**
 * Clase base para todos los motores de la aplicación.
 * Proporciona funcionalidad común como caché, manejo de errores y logging.
 */
export abstract class BaseEngine {
  protected readonly cacheService?: CacheService;
  protected readonly options: BaseEngineOptions;
  protected readonly engineName: string;
  protected readonly debugMode: boolean;

  /**
   * Crea una nueva instancia del motor base
   * @param engineName Nombre del motor para identificación y logging
   * @param options Opciones de inicialización
   */
  constructor(engineName: string, options: BaseEngineOptions = {}) {
    this.engineName = engineName;
    this.options = {
      useCache: options.useCache !== undefined ? options.useCache : true,
      cacheTTL: options.cacheTTL || 3600, // 1 hora por defecto
      cacheNamespace: options.cacheNamespace || engineName.toLowerCase(),
      persistCache: options.persistCache || false,
      debugMode: options.debugMode || false
    };
    
    this.debugMode = this.options.debugMode;

    // Inicializar el servicio de caché si está habilitado
    if (this.options.useCache) {
      this.cacheService = new CacheService({
        ttl: this.options.cacheTTL,
        namespace: this.options.cacheNamespace,
        persistent: this.options.persistCache
      });
    }

    this.logDebug(`Inicializando ${this.engineName}`);
  }

  /**
   * Método para ser implementado por los motores específicos
   * que realiza la inicialización de recursos
   */
  protected abstract initialize(): Promise<void>;

  /**
   * Obtiene un valor del caché si el caché está habilitado
   * @param key Clave de caché
   * @returns El valor cacheado o null si no existe o el caché está deshabilitado
   */
  protected getCached<T>(key: string): T | null {
    if (!this.cacheService) return null;
    
    try {
      return this.cacheService.get<T>(key);
    } catch (error) {
      this.logWarning(`Error al obtener valor de caché para ${key}: ${error}`);
      return null;
    }
  }

  /**
   * Guarda un valor en el caché si el caché está habilitado
   * @param key Clave de caché
   * @param value Valor a almacenar
   * @param options Opciones adicionales como TTL o metadatos
   */
  protected setCache<T>(key: string, value: T, options: { ttl?: number; metadata?: Record<string, any> } = {}): void {
    if (!this.cacheService) return;
    
    try {
      this.cacheService.set(key, value, options);
    } catch (error) {
      this.logWarning(`Error al guardar valor en caché para ${key}: ${error}`);
    }
  }

  /**
   * Obtiene o establece un valor en caché, calculándolo si no existe
   */
  protected async getOrCalculate<T>(
    key: string, 
    calculator: () => Promise<T>,
    options: { ttl?: number; metadata?: Record<string, any> } = {}
  ): Promise<T> {
    // Si no hay caché, calcular directamente
    if (!this.cacheService) {
      return await calculator();
    }
    
    try {
      return await this.cacheService.getOrSet(key, calculator, options);
    } catch (error) {
      this.logWarning(`Error en getOrCalculate para ${key}: ${error}`);
      // Si hay un error con el caché, calcular directamente
      return await calculator();
    }
  }

  /**
   * Maneja un error, lo registra y opcionalmente lo lanza o devuelve un valor por defecto
   * @param error Error original
   * @param operation Nombre de la operación donde ocurrió el error
   * @param defaultValue Valor por defecto opcional para retornar en caso de error
   * @param rethrow Si es true, lanza el error después de manejarlo
   */
  protected handleError<T>(
    error: any, 
    operation: string, 
    defaultValue?: T, 
    rethrow: boolean = true
  ): T {
    const enrichedError = ErrorHandlerEngine.handleError(
      error,
      this.engineName,
      operation
    );
    
    if (rethrow && defaultValue === undefined) {
      throw enrichedError;
    }
    
    return defaultValue as T;
  }

  /**
   * Registra un mensaje de depuración si el modo debug está activado
   */
  protected logDebug(message: string): void {
    if (this.debugMode) {
      console.debug(`[DEBUG][${this.engineName}] ${message}`);
    }
  }

  /**
   * Registra un mensaje informativo
   */
  protected logInfo(message: string): void {
    console.info(`[INFO][${this.engineName}] ${message}`);
  }

  /**
   * Registra una advertencia
   */
  protected logWarning(message: string): void {
    console.warn(`[WARN][${this.engineName}] ${message}`);
  }

  /**
   * Registra un error
   */
  protected logError(message: string, error?: any): void {
    console.error(`[ERROR][${this.engineName}] ${message}`);
    if (error) {
      console.error(error);
    }
  }

  /**
   * Mide el tiempo de ejecución de una función
   * @param operation Nombre de la operación
   * @param fn Función a ejecutar
   * @returns El resultado de la función
   */
  protected async measureExecutionTime<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      this.logDebug(`${operation} completado en ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logError(`${operation} falló después de ${duration}ms`, error);
      throw error;
    }
  }

  /**
   * Recurso de limpieza cuando el motor ya no se necesita
   * Libera recursos como conexiones, servicios, etc.
   */
  public async dispose(): Promise<void> {
    this.logDebug(`Finalizando ${this.engineName}`);
    
    // Limpiar recursos del caché
    if (this.cacheService) {
      this.cacheService.destroy();
    }
    
    // Las clases específicas pueden implementar más lógica en sus propios 
    // métodos dispose() que deben llamar a super.dispose()
  }
}