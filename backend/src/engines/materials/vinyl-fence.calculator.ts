import { MaterialCalculator } from '../../interfaces/calculators.interfaces';
import { FenceDimensions, FenceOptions, RequiredMaterial } from '../../interfaces/fence.interfaces';

/**
 * Calculador de materiales para cercas de vinilo
 */
export class VinylFenceMaterialCalculator implements MaterialCalculator {
  calculate(dimensions: FenceDimensions, options: FenceOptions): RequiredMaterial[] {
    const { length, height, gates = 0 } = dimensions;
    const { style = 'privacy', color = 'white' } = options;
    
    // Espaciado entre postes (pies)
    const postSpacing = 8;
    
    // Cálculos básicos
    const posts = Math.ceil(length / postSpacing) + 1;
    const panels = Math.ceil(length / postSpacing);
    
    // Lista de materiales base
    const materials: RequiredMaterial[] = [
      { 
        id: 'vinyl-post', 
        name: `${height + 2}' Vinyl Post, ${color}`, 
        quantity: posts, 
        unit: 'each',
        fallbackPrice: height <= 6 ? 35.99 : 45.99
      },
      { 
        id: 'vinyl-panel',
        name: `${height}' x ${postSpacing}' Vinyl ${style.charAt(0).toUpperCase() + style.slice(1)} Panel, ${color}`, 
        quantity: panels, 
        unit: 'each',
        fallbackPrice: height <= 6 ? 120.99 : 160.99
      },
      { 
        id: 'post-cap',
        name: `Vinyl Post Cap, ${color}`, 
        quantity: posts, 
        unit: 'each',
        fallbackPrice: 5.99
      },
      { 
        id: 'concrete',
        name: 'Concrete Mix 50lb', 
        quantity: posts * 2, // 2 bolsas por poste
        unit: 'bag',
        fallbackPrice: 5.99
      }
    ];
    
    // Agregar brackets según tipo de panel
    if (style !== 'privacy') {
      materials.push({
        id: 'bracket-kit',
        name: 'Vinyl Fence Bracket Kit', 
        quantity: panels * 2, // Brackets para cada panel
        unit: 'kit',
        fallbackPrice: 12.99
      });
    }
    
    // Agregar puertas si existen
    if (gates > 0) {
      materials.push(
        { 
          id: 'vinyl-gate',
          name: `${height}' x 4' Vinyl ${style.charAt(0).toUpperCase() + style.slice(1)} Gate, ${color}`, 
          quantity: gates, 
          unit: 'each',
          fallbackPrice: height <= 6 ? 250.99 : 320.99
        },
        { 
          id: 'gate-hardware',
          name: 'Vinyl Gate Hardware Kit', 
          quantity: gates, 
          unit: 'kit',
          fallbackPrice: 45.99
        }
      );
    }
    
    return materials;
  }
}