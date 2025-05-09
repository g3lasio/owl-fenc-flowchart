import { FenceDimensions, FenceOptions, RequiredMaterial } from './fence.interfaces';
import { PROJECT_TYPES } from '../constants/shared.constants';

/**
 * Interfaz base para todos los materiales
 */
export interface BaseMaterial {
  id: string;
  name: string;
  description?: string;
  unitPrice: number;
  unit: string;
  category: string;
  supplier?: string;
  lastUpdated?: Date;
  metadata?: Record<string, any>;
}

/**
 * Interfaz para material de cerca
 */
export interface FenceMaterial extends BaseMaterial {
  type: 'post' | 'rail' | 'picket' | 'hardware' | 'concrete' | 'accessory';
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
    thickness?: number;
  };
  grade?: string;
  treatment?: string;
  color?: string;
}

/**
 * Interfaz para los resultados de un cálculo
 */
export interface CalculationResult {
  materials: MaterialBreakdown[];
  labor: LaborCost[];
  totalMaterialCost: number;
  totalLaborCost: number;
  subtotal: number;
  overhead: number;
  profit: number;
  total: number;
  taxRate?: number;
  taxAmount?: number;
  grandTotal?: number;
  additionalFees?: AdditionalFee[];
  pricePerUnit?: number;
  unit?: string;
  valid: boolean;
  warnings?: string[];
  metadata?: Record<string, any>;
}

/**
 * Interfaz para el desglose de materiales
 */
export interface MaterialBreakdown {
  materialId: string;
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  category: string;
  supplier?: string;
  notes?: string;
}

/**
 * Interfaz para costos de mano de obra
 */
export interface LaborCost {
  taskId: string;
  description: string;
  hours: number;
  rate: number;
  total: number;
  category?: string;
  complexity?: 'low' | 'medium' | 'high';
}

/**
 * Interfaz para tarifas adicionales
 */
export interface AdditionalFee {
  name: string;
  description?: string;
  amount: number;
  type: 'fixed' | 'percentage';
  appliedTo?: 'subtotal' | 'materials' | 'labor' | 'total';
}

/**
 * Interfaz para opciones de cálculo compartidas
 */
export interface CalculationOptions {
  includeTax?: boolean;
  taxRate?: number;
  profitMargin?: number;
  overheadRate?: number;
  usePreferredVendors?: boolean;
  includeFees?: boolean;
  roundPrices?: boolean;
  roundingIncrement?: number;
  includeDetailedBreakdown?: boolean;
  applyDiscounts?: boolean;
  discountRate?: number;
  projectType: keyof typeof PROJECT_TYPES;
}

/**
 * Interfaz para los requisitos del proyecto
 */
export interface ProjectRequirements {
  dimensions: {
    length?: number;
    width?: number;
    height?: number;
    area?: number;
    perimeter?: number;
  };
  materialPreferences?: string[];
  style?: string;
  additionalFeatures?: string[];
  mustInclude?: string[];
  mustExclude?: string[];
  budget?: {
    min?: number;
    max?: number;
    target?: number;
  };
  constraints?: string[];
  priorityFactor?: 'cost' | 'quality' | 'durability' | 'appearance' | 'speed';
}

/**
 * Interfaz para caché de materiales
 */
export interface MaterialCache {
  materials: BaseMaterial[];
  lastUpdated: Date;
  categories: string[];
  suppliers: string[];
  version: string;
}

/**
 * Interfaz para la propuesta de cálculo
 */
export interface CalculationProposal {
  id: string;
  clientId: string;
  projectId: string;
  calculationResults: CalculationResult;
  requirements: ProjectRequirements;
  options: CalculationOptions;
  createdAt: Date;
  updatedAt: Date;
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
  notes?: string;
  expirationDate?: Date;
  version: number;
}

/**
 * Interfaz para un estimador que implementa la calculadora
 */
export interface Estimator {
  calculateMaterialsNeeded(requirements: ProjectRequirements, options?: CalculationOptions): Promise<MaterialBreakdown[]>;
  calculateLaborCosts(requirements: ProjectRequirements, materials: MaterialBreakdown[], options?: CalculationOptions): Promise<LaborCost[]>;
  calculateTotalCost(materials: MaterialBreakdown[], labor: LaborCost[], options?: CalculationOptions): Promise<CalculationResult>;
}

/**
 * Tipo de función para actualizar precios de materiales
 */
export type PriceUpdateFunction = (materials: BaseMaterial[]) => Promise<BaseMaterial[]>;