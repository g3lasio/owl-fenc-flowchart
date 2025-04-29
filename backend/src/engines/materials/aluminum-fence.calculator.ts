import { MaterialCalculator } from '../../interfaces/calculators.interfaces';
import { FenceDimensions, FenceOptions, RequiredMaterial } from '../../interfaces/fence.interfaces';

/**
 * Calculador de materiales para cercas de aluminio
 */
export class AluminumFenceMaterialCalculator implements MaterialCalculator {
  calculate(dimensions: FenceDimensions, options: FenceOptions): RequiredMaterial[] {
    const { length, height, gates = 0 } = dimensions;
    const { style = 'standard', color = 'black' } = options;
    
    // Espaciado entre postes (pies)
    const postSpacing = 6;
    
    // Cálculos básicos
    const posts = Math.ceil(length / postSpacing) + 1;
    const panels = Math.ceil(length / postSpacing);
    
    // Lista de materiales base
    const materials: RequiredMaterial[] = [
      { 
        id: 'aluminum-post', 
        name: `${height + 1}' Aluminum Post, ${color}`, 
        quantity: posts, 
        unit: 'each',
        fallbackPrice: 34.99
      },
      { 
        id: 'aluminum-panel',
        name: `${height}' x ${postSpacing}' Aluminum Panel (${style}), ${color}`, 
        quantity: panels, 
        unit: 'each',
        fallbackPrice: height <= 5 ? 159.99 : 199.99
      },
      { 
        id: 'post-cap',
        name: `Aluminum Post Cap, ${color}`, 
        quantity: posts, 
        unit: 'each',
        fallbackPrice: 7.99
      },
      { 
        id: 'concrete',
        name: 'Concrete Mix 60lb', 
        quantity: posts * 2, 
        unit: 'bag',
        fallbackPrice: 6.99
      },
      { 
        id: 'hardware',
        name: 'Aluminum Fence Bracket Kit', 
        quantity: panels * 2, // Brackets para cada panel
        unit: 'kit',
        fallbackPrice: 12.99
      },
      { 
        id: 'self-tapping-screws',
        name: 'Self-tapping Screws (100 count)', 
        quantity: Math.ceil(panels / 3), // Un paquete cada 3 paneles
        unit: 'box',
        fallbackPrice: 19.99
      }
    ];
    
    // Agregar puertas si existen
    if (gates > 0) {
      materials.push(
        { 
          id: 'aluminum-gate',
          name: `${height}' x 4' Aluminum Gate (${style}), ${color}`, 
          quantity: gates, 
          unit: 'each',
          fallbackPrice: height <= 5 ? 249.99 : 299.99
        },
        { 
          id: 'gate-hardware',
          name: 'Aluminum Gate Hardware Kit', 
          quantity: gates, 
          unit: 'kit',
          fallbackPrice: 49.99
        }
      );
    }
    
    return materials;
  }
}