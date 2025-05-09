import { ERROR_CODES } from '../constants/shared.constants';

/**
 * Interfaz para errores enriquecidos de la aplicación
 */
export interface EnrichedError extends Error {
  code: string;
  originalError?: any;
  timestamp: Date;
  source: string;
  operation: string;
  context?: Record<string, any>;
  stack?: string;
}

/**
 * Motor de manejo de errores centralizado
 * Proporciona funcionalidad para manejar, enriquecer y registrar errores de forma consistente
 */
export class ErrorHandlerEngine {
  /**
   * Procesa un error y lo enriquece con información adicional
   * @param error Error original
   * @param source Fuente del error (nombre del servicio/motor)
   * @param operation Operación donde ocurrió el error
   * @param context Contexto adicional opcional
   * @returns Error enriquecido
   */
  public static handleError(
    error: any,
    source: string,
    operation: string,
    context: Record<string, any> = {}
  ): EnrichedError {
    // Crear un error enriquecido
    const enrichedError: EnrichedError = {
      name: error?.name || 'Error',
      message: error?.message || 'Error desconocido',
      code: this.determineErrorCode(error),
      originalError: error,
      timestamp: new Date(),
      source,
      operation,
      context,
      stack: error?.stack,
    } as EnrichedError;

    // Registrar el error
    this.logError(enrichedError);

    return enrichedError;
  }

  /**
   * Crea un error con formato consistente
   * @param message Mensaje de error
   * @param code Código de error
   * @param source Fuente del error
   * @param operation Operación donde ocurre el error
   * @param context Contexto adicional
   * @returns Error enriquecido
   */
  public static createError(
    message: string,
    code: string,
    source: string,
    operation: string,
    context: Record<string, any> = {}
  ): EnrichedError {
    const error: EnrichedError = {
      name: 'ApplicationError',
      message,
      code,
      timestamp: new Date(),
      source,
      operation,
      context,
    } as EnrichedError;

    // Capturar stack trace
    Error.captureStackTrace(error, this.createError);

    return error;
  }

  /**
   * Determina el código de error apropiado basado en el error original
   * @param error Error original
   * @returns Código de error estandarizado
   */
  private static determineErrorCode(error: any): string {
    // Si el error ya tiene un código, usarlo
    if (error?.code && typeof error.code === 'string') {
      // Comprobar si ya es uno de nuestros códigos
      const errorCodes = Object.values(ERROR_CODES);
      if (errorCodes.includes(error.code)) {
        return error.code;
      }
      
      // Convertir códigos externos a nuestro formato
      if (error.code.startsWith('ECONNREFUSED')) {
        return ERROR_CODES.NETWORK_ERROR;
      }
      if (error.code.startsWith('ETIMEOUT')) {
        return ERROR_CODES.TIMEOUT;
      }
    }

    // Determinar por el tipo de error
    if (error instanceof TypeError) {
      return ERROR_CODES.INVALID_INPUT;
    }
    if (error instanceof RangeError) {
      return ERROR_CODES.VALIDATION_ERROR;
    }
    if (error instanceof SyntaxError) {
      return ERROR_CODES.INVALID_INPUT;
    }
    if (error instanceof URIError) {
      return ERROR_CODES.INVALID_INPUT;
    }

    // Determinar por mensaje o propiedades
    const errorMessage = error?.message?.toLowerCase() || '';
    if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      return ERROR_CODES.VALIDATION_ERROR;
    }
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return ERROR_CODES.TIMEOUT;
    }
    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return ERROR_CODES.NETWORK_ERROR;
    }
    if (errorMessage.includes('authentication') || errorMessage.includes('unauthorized')) {
      return ERROR_CODES.AUTHENTICATION_FAILED;
    }
    if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
      return ERROR_CODES.RATE_LIMIT_EXCEEDED;
    }

    // Código de error por defecto si no se puede determinar
    return ERROR_CODES.SYSTEM_ERROR;
  }

  /**
   * Registra el error en la consola y potencialmente en sistemas de monitoreo
   * @param error Error enriquecido
   */
  private static logError(error: EnrichedError): void {
    console.error(`[ERROR][${error.source}][${error.operation}] ${error.code}: ${error.message}`);
    
    if (error.context && Object.keys(error.context).length > 0) {
      console.error('Contexto:', error.context);
    }
    
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    
    // Aquí se podría agregar integración con servicios de monitoreo como Sentry, New Relic, etc.
  }

  /**
   * Verifica si un error es de un tipo específico
   * @param error Error a verificar
   * @param errorCode Código de error a comprobar
   * @returns Verdadero si el error tiene el código especificado
   */
  public static isErrorType(error: any, errorCode: string): boolean {
    if (!error) return false;
    
    // Verificar si es un error enriquecido
    if (typeof error === 'object' && 'code' in error) {
      return error.code === errorCode;
    }
    
    // Verificar si es un error normal con un código en su mensaje
    if (error.message && typeof error.message === 'string') {
      return error.message.includes(errorCode);
    }
    
    return false;
  }

  /**
   * Convierte excepciones a respuestas de error apropiadas
   * @param error Error original
   * @returns Objeto de respuesta con formato estándar
   */
  public static formatErrorResponse(error: any): { 
    status: number;
    error: { code: string; message: string; details?: any }
  } {
    const enrichedError = error.code 
      ? error 
      : this.handleError(error, 'API', 'responseFormatter');
    
    // Determinar código de estado HTTP
    let statusCode = 500;
    switch (enrichedError.code) {
      case ERROR_CODES.VALIDATION_ERROR:
      case ERROR_CODES.INVALID_INPUT:
        statusCode = 400;
        break;
      case ERROR_CODES.AUTHENTICATION_FAILED:
        statusCode = 401;
        break;
      case ERROR_CODES.RATE_LIMIT_EXCEEDED:
        statusCode = 429;
        break;
      case ERROR_CODES.API_UNAVAILABLE:
        statusCode = 503;
        break;
      default:
        statusCode = 500;
    }
    
    return {
      status: statusCode,
      error: {
        code: enrichedError.code,
        message: enrichedError.message,
        details: process.env.NODE_ENV === 'production' 
          ? undefined 
          : {
              source: enrichedError.source,
              operation: enrichedError.operation,
              timestamp: enrichedError.timestamp,
              // No incluir stack trace u original error en producción
              ...(process.env.NODE_ENV !== 'production' && { stack: enrichedError.stack })
            }
      }
    };
  }
}