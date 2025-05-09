/**
 * Utilidades generales para toda la aplicación
 * Este archivo centraliza funciones de utilidad para evitar duplicación
 */

/**
 * Normaliza texto para comparaciones
 * (elimina acentos, convierte a minúsculas, elimina caracteres especiales)
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/**
 * Convierte un valor en snake_case a camelCase
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convierte un valor en camelCase a snake_case
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Redondea un número a un número específico de decimales
 */
export function roundToDecimals(value: number, decimals: number = 2): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Formatea un número como moneda (USD por defecto)
 */
export function formatCurrency(value: number, locale: string = 'en-US', currency: string = 'USD'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

/**
 * Compara dos objetos para ver si son iguales (comparación profunda)
 */
export function deepEquals(obj1: any, obj2: any): boolean {
  // Verificar tipo primitivo o referencia igual
  if (obj1 === obj2) return true;
  
  // Si alguno es null o no es un objeto, no son iguales
  if (obj1 === null || obj2 === null || typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    return false;
  }
  
  // Verificar si son arrays
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) return false;
    return obj1.every((item, index) => deepEquals(item, obj2[index]));
  }
  
  // Comparar las claves
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  // Comparar cada propiedad recursivamente
  return keys1.every(key => 
    Object.prototype.hasOwnProperty.call(obj2, key) && 
    deepEquals(obj1[key], obj2[key])
  );
}

/**
 * Genera un ID único (para sesiones, etc.)
 */
export function generateUniqueId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `${prefix}${timestamp}${randomStr}`;
}

/**
 * Extrae texto entre delimitadores
 */
export function extractBetween(text: string, startDelimiter: string, endDelimiter: string): string | null {
  const startIdx = text.indexOf(startDelimiter);
  if (startIdx === -1) return null;
  
  const startPos = startIdx + startDelimiter.length;
  const endIdx = text.indexOf(endDelimiter, startPos);
  
  if (endIdx === -1) return null;
  
  return text.substring(startPos, endIdx);
}

/**
 * Intenta parsear JSON de manera segura, devolviendo un valor por defecto si falla
 */
export function safeJsonParse<T>(text: string, defaultValue: T): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    return defaultValue;
  }
}

/**
 * Trunca un string a una longitud máxima añadiendo ellipsis si es necesario
 */
export function truncateString(str: string, maxLength: number, ellipsis: string = '...'): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Convierte medidas entre diferentes unidades
 */
export const UnitConverter = {
  // Longitud
  inchesToFeet: (inches: number): number => inches / 12,
  feetToInches: (feet: number): number => feet * 12,
  feetToMeters: (feet: number): number => feet * 0.3048,
  metersToFeet: (meters: number): number => meters / 0.3048,
  
  // Área
  sqFeetToSqMeters: (sqFeet: number): number => sqFeet * 0.09290304,
  sqMetersToSqFeet: (sqMeters: number): number => sqMeters / 0.09290304,
  
  // Volumen
  cubicFeetToCubicYards: (cubicFeet: number): number => cubicFeet / 27,
  cubicYardsToCubicFeet: (cubicYards: number): number => cubicYards * 27,
  
  // Peso
  poundsToKg: (pounds: number): number => pounds * 0.45359237,
  kgToPounds: (kg: number): number => kg / 0.45359237
};

/**
 * Formateador de fechas
 */
export const DateFormatter = {
  toLocalDate(date: Date, locale: string = 'es-ES'): string {
    return date.toLocaleDateString(locale);
  },
  
  toLocalDateTime(date: Date, locale: string = 'es-ES'): string {
    return date.toLocaleDateString(locale) + ' ' + date.toLocaleTimeString(locale);
  },
  
  toIsoString(date: Date): string {
    return date.toISOString();
  },
  
  fromIsoString(isoString: string): Date {
    return new Date(isoString);
  }
};