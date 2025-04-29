import { MaterialCalculator } from '../../interfaces/calculators.interfaces';
import { AluminumFenceMaterialCalculator } from './aluminum-fence.calculator';
import { ChainLinkFenceMaterialCalculator } from './chain-link-fence.calculator';
import { ConcreteFenceMaterialCalculator } from './concrete-fence.calculator';
import { IronFenceMaterialCalculator } from './iron-fence.calculator';
import { MeshFenceMaterialCalculator } from './mesh-fence.calculator';
import { VinylFenceMaterialCalculator } from './vinyl-fence.calculator';
import { WoodFenceMaterialCalculator } from './wood-fence.calculator';

/**
 * Fábrica que crea calculadores de materiales según el tipo de cerca
 */
export class MaterialCalculatorFactory {
  /**
   * Devuelve una instancia del calculador apropiado según el tipo de cerca
   */
  static getCalculator(fenceType: string): MaterialCalculator {
    switch (fenceType.toLowerCase()) {
      case 'wood':
        return new WoodFenceMaterialCalculator();
      case 'vinyl':
        return new VinylFenceMaterialCalculator();
      case 'chain-link':
        return new ChainLinkFenceMaterialCalculator();
      case 'iron':
        return new IronFenceMaterialCalculator();
      case 'aluminum':
        return new AluminumFenceMaterialCalculator();
      case 'mesh':
        return new MeshFenceMaterialCalculator();
      case 'concrete':
        return new ConcreteFenceMaterialCalculator();
      default:
        throw new Error(`No hay calculador de materiales disponible para el tipo de cerca: ${fenceType}`);
    }
  }
}