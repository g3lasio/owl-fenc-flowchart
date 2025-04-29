import { MaterialCalculator } from '../../interfaces/calculators.interfaces';
import { FenceDimensions, FenceOptions, RequiredMaterial } from '../../interfaces/fence.interfaces';

/**
 * Calculador de materiales para cercas de hierro
 */
export class IronFenceMaterialCalculator implements MaterialCalculator {
  calculate(dimensions: FenceDimensions, options: FenceOptions): RequiredMaterial[] {
    const { length, height, gates = 0 } = dimensions;
    const { style = 'traditional', postCap = 'standard' } = options;
    
    // Espaciado entre postes (pies)
    const postSpacing = 6; // Espaciado menor para mayor resistencia
    
    // Cálculos básicos
    const posts = Math.ceil(length / postSpacing) + 1;
    const panels = Math.ceil(length / postSpacing);
    
    // Lista de materiales base
    const materials: RequiredMaterial[] = [
      { 
        id: 'iron-post', 
        name: `${height + 1}' Iron Post for ${height}' Fence`, 
        quantity: posts, 
        unit: 'each',
        fallbackPrice: 45.99
      },
      { 
        id: 'iron-panel',
        name: `${height}' x ${postSpacing}' Iron Fence Panel (${style})`, 
        quantity: panels, 
        unit: 'each',
        fallbackPrice: height <= 5 ? 189.99 : 249.99
      },
      { 
        id: 'post-cap',
        name: `Iron Post Cap (${postCap} style)`, 
        quantity: posts, 
        unit: 'each',
        fallbackPrice: 12.99
      },
      { 
        id: 'concrete',
        name: 'Concrete Mix 60lb', 
        quantity: posts * 3, // Más concreto para postes de hierro (mayor profundidad)
        unit: 'bag',
        fallbackPrice: 6.99
      },
      { 
        id: 'paint',
        name: 'Exterior Metal Paint Gallon', 
        quantity: Math.ceil(panels / 8), // 1 galón cubre 8 paneles aprox
        unit: 'each',
        fallbackPrice: 39.99
      },
      { 
        id: 'hardware',
        name: 'Metal Fence Hardware Kit', 
        quantity: panels, 
        unit: 'kit',
        fallbackPrice: 15.99
      }
    ];
    
    // Agregar puertas si existen
    if (gates > 0) {
      materials.push(
        { 
          id: 'iron-gate',
          name: `${height}' x 4' Iron Gate (${style})`, 
          quantity: gates, 
          unit: 'each',
          fallbackPrice: height <= 5 ? 299.99 : 399.99
        },
        { 
          id: 'gate-hardware',
          name: 'Iron Gate Hardware Kit', 
          quantity: gates, 
          unit: 'kit',
          fallbackPrice: 59.99
        }
      );
    }
    
    return materials;
  }
}