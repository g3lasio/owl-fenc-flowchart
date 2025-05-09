/**
 * Constantes compartidas para toda la aplicación
 * Este archivo centraliza todas las constantes del sistema para facilitar el mantenimiento
 */

/**
 * Códigos de error estandarizados para toda la aplicación
 */
export const ERROR_CODES = {
  // Errores generales del sistema
  SYSTEM_ERROR: 'E001',
  VALIDATION_ERROR: 'E002',
  INVALID_INPUT: 'E003',
  NOT_FOUND: 'E004',
  UNAUTHORIZED: 'E005',
  FORBIDDEN: 'E006',
  
  // Errores de red y comunicación
  NETWORK_ERROR: 'E101',
  TIMEOUT: 'E102',
  API_UNAVAILABLE: 'E103',
  RATE_LIMIT_EXCEEDED: 'E104',
  
  // Errores de autenticación y autorización
  AUTHENTICATION_FAILED: 'E201',
  SESSION_EXPIRED: 'E202',
  INSUFFICIENT_PERMISSIONS: 'E203',
  
  // Errores específicos de la aplicación
  CONFIG_ERROR: 'E301',
  DATA_PROCESSING_ERROR: 'E302',
  CALCULATION_ERROR: 'E303',
  
  // Errores de servicios externos
  EXTERNAL_SERVICE_ERROR: 'E401',
  PAYMENT_PROCESSING_ERROR: 'E402',
  NOTIFICATION_ERROR: 'E403',
  
  // Errores de IA y procesamiento
  AI_PROCESSING_ERROR: 'E501',
  MODEL_EXECUTION_ERROR: 'E502',
  TEMPLATE_RENDERING_ERROR: 'E503',
};

/**
 * Mensajes de error predefinidos
 */
export const ERROR_MESSAGES = {
  GENERIC_ERROR: 'Ha ocurrido un error en el sistema.',
  INVALID_INPUT: 'La entrada proporcionada no es válida.',
  NOT_FOUND: 'El recurso solicitado no existe.',
  NETWORK_ERROR: 'Error de conexión, por favor intente más tarde.',
  TIMEOUT: 'La operación ha tomado demasiado tiempo, por favor intente más tarde.',
  AUTHENTICATION_REQUIRED: 'Autenticación requerida para acceder a este recurso.',
  INSUFFICIENT_PERMISSIONS: 'No tiene permisos suficientes para esta operación.',
  RATE_LIMIT: 'Ha excedido el límite de solicitudes, por favor intente más tarde.',
};

/**
 * Valores por defecto para toda la aplicación
 */
export const DEFAULT_VALUES = {
  CACHE_TTL: 3600, // 1 hora en segundos
  REQUEST_TIMEOUT: 30000, // 30 segundos en milisegundos
  PAGE_SIZE: 20,
  MAX_RETRY_ATTEMPTS: 3,
  TEMPLATE_DEFAULT: 'professional',
  MAX_QUERY_LENGTH: 500,
};

/**
 * Rutas de API
 */
export const API_ROUTES = {
  BASE: '/api',
  DEEPSEARCH: '/api/deepsearch',
  TEMPLATES: '/api/templates',
  MATERIALS: '/api/materials',
  ESTIMATES: '/api/estimates',
  PROFILES: '/api/profiles',
  CONFIGURATION: '/api/configuration',
};

/**
 * Constantes para servicios de IA
 */
export const AI_CONSTANTS = {
  MODELS: {
    OPENAI_DEFAULT: 'gpt-4',
    ANTHROPIC_DEFAULT: 'claude-3-opus-20240229',
  },
  TEMPERATURES: {
    CREATIVE: 0.9,
    BALANCED: 0.7,
    PRECISE: 0.2,
  },
  MAX_TOKENS: {
    DEFAULT: 2048,
    EXTENDED: 4096,
    FULL_CONTEXT: 8192,
  },
};

/**
 * Constantes para unidades de medida
 */
export const MEASUREMENT_UNITS = {
  FEET: 'ft',
  INCHES: 'in',
  METERS: 'm',
  CENTIMETERS: 'cm',
  SQUARE_FEET: 'sq_ft',
  SQUARE_METERS: 'sq_m',
};

/**
 * Constantes para tipos de materiales
 */
export const MATERIAL_TYPES = {
  WOOD: 'wood',
  METAL: 'metal',
  VINYL: 'vinyl',
  COMPOSITE: 'composite',
  CHAIN_LINK: 'chain_link',
  CONCRETE: 'concrete',
};

/**
 * Constantes para estilos de valla
 */
export const FENCE_STYLES = {
  PRIVACY: 'privacy',
  PICKET: 'picket',
  RANCH: 'ranch',
  SPLIT_RAIL: 'split_rail',
  ORNAMENTAL: 'ornamental',
  SECURITY: 'security',
};

/**
 * Constantes para tipos de construcción
 */
export const CONSTRUCTION_TYPES = {
  RESIDENTIAL: 'residential',
  COMMERCIAL: 'commercial',
  INDUSTRIAL: 'industrial',
  AGRICULTURAL: 'agricultural',
};

/**
 * Expresiones regulares útiles
 */
export const REGEX_PATTERNS = {
  EMAIL: /^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/,
  PHONE: /^\+?[1-9]\d{1,14}$/,
  ZIP_CODE: /^\d{5}(-\d{4})?$/,
  DIMENSIONS: /^(\d+(\.\d+)?)\s*(ft|in|m|cm)$/i,
  PRICE: /^\$?\d+(\.\d{1,2})?$/,
};

/**
 * Estados de procesamiento
 */
export const PROCESS_STATES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
};

/**
 * Niveles de log para la aplicación
 */
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  TRACE: 'trace',
};