// filepath: /workspaces/owl-fenc-flowchart/backend/src/interfaces/construction-methods.interfaces.ts
import { FenceDimensions, FenceOptions, FenceType, Location } from './fence.interfaces';

/**
 * Especificación de un componente de construcción
 */
export interface ComponentSpecification {
  component: string;
  material: string;
  dimensions: string;
  installationMethod: string;
  quantity: string;
  notes: string;
}

/**
 * Resultado del motor de métodos de construcción
 */
export interface ConstructionMethodResult {
  specifications: ComponentSpecification[];
  constructionNotes: string[];
  bestPractices: string[];
  warnings: string[];
  installationSteps?: InstallationStep[];
  customizations?: Record<string, any>;
}

/**
 * Representación de un paso de instalación
 */
export interface InstallationStep {
  stepNumber: number;
  title: string;
  description: string;
  toolsNeeded: string[];
  estimatedTime: string;
  image?: string;
}

/**
 * Detalles del proyecto de cerca
 */
export interface FenceProjectDetails {
  fenceType: FenceType;
  dimensions: FenceDimensions;
  location: Location;
  options: FenceOptions;
  soilType: SoilType;
  terrain: TerrainType;
  climate: ClimateType;
  height: number;
  length: number;
  services?: string[];
}

/**
 * Tipos de suelo para instalación
 */
export type SoilType = 'clay' | 'sandy' | 'loamy' | 'rocky' | 'mixed';

/**
 * Tipos de terreno
 */
export type TerrainType = 'flat' | 'sloped' | 'uneven' | 'tiered';

/**
 * Tipos de clima
 */
export type ClimateType = 'temperate' | 'hot-dry' | 'cold-snow' | 'coastal' | 'tropical';

/**
 * Interfaz para caché de métodos de construcción
 */
export interface ConstructionMethodCache {
  getMethod(fenceType: FenceType, soilType: SoilType, climate: ClimateType): ConstructionMethodResult | null;
  setMethod(fenceType: FenceType, soilType: SoilType, climate: ClimateType, method: ConstructionMethodResult): void;
  invalidate(fenceType: FenceType, soilType: SoilType, climate: ClimateType): void;
  invalidateOlderThan(days: number): number;
}