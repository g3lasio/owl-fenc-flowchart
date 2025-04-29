import { FenceDimensions, FenceOptions, RequiredMaterial } from './fence.interfaces';

/**
 * Interfaz para calculador de materiales
 */
export interface MaterialCalculator {
  calculate(dimensions: FenceDimensions, options: FenceOptions): RequiredMaterial[];
}

/**
 * Interfaz para entrada de caché de precios de materiales
 */
export interface MaterialPriceEntry {
  id: string;
  location: string;
  unitPrice: number;
  priceSource: string;
}

/**
 * Interfaz para cachés
 */
export interface MaterialCache {
  get(materialId: string, location: string): PricedMaterialCacheItem | null;
  getMaterialPrices(materials: RequiredMaterial[], location: { zipCode: string }): Map<string, any>;
  set(material: MaterialPriceEntry): void;
  invalidate(materialId: string): void;
  invalidateByRegion(location: string): void;
}

export interface PricedMaterialCacheItem {
  unitPrice: number;
  source: string;
  timestamp: Date;
}

/**
 * Interfaz para clientes de API de precios
 */
export interface PriceAPIClient {
  getPrice(materialId: string, location: any): Promise<PriceResult>;
}

export interface PriceResult {
  amount: number;
  available: boolean;
  source: string;
}