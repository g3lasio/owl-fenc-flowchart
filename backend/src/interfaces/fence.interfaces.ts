/**
 * Interfaz para el objeto de ubicación
 */
export interface Location {
  zipCode: string;
  city?: string;
  state?: string;
  country?: string;
  timezone?: string;
}

/**
 * Dimensiones de una cerca
 */
export interface FenceDimensions {
  length: number;
  height: number;
}

/**
 * Opciones específicas para la cerca
 */
export interface FenceOptions {
  type: FenceType;
  color?: string;
  gates?: GateInfo[];
  style?: string;
  postSpacing?: number;
  groundType?: GroundType;
  quality?: MaterialQuality;
}

/**
 * Información sobre puertas
 */
export interface GateInfo {
  width: number;
  height: number;
  type: string;
  hardware?: string;
}

/**
 * Tipos de cercas soportados
 */
export type FenceType = 'wood' | 'vinyl' | 'chain-link' | 'aluminum' | 'iron' | 'concrete' | 'mesh';

/**
 * Tipos de terreno para instalación
 */
export type GroundType = 'normal' | 'rocky' | 'soft' | 'hard';

/**
 * Calidad de los materiales
 */
export type MaterialQuality = 'economy' | 'standard' | 'premium';

/**
 * Material requerido para un proyecto
 */
export interface RequiredMaterial {
  id: string;
  name: string;
  description?: string;
  unit: string;
  quantity: number;
  category?: string;
  fallbackPrice?: number; // Precio de respaldo si no se encuentra en los servicios
}

/**
 * Material con precio
 */
export interface PricedMaterial extends RequiredMaterial {
  unitPrice: number;
  totalPrice: number;
  priceSource: string;
  available?: boolean;
}

/**
 * Resultado de estimado de materiales
 */
export interface MaterialEstimateResult {
  materials: PricedMaterial[];
  totalCost: number;
}