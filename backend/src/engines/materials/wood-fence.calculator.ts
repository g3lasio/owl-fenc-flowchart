import { MaterialCalculator } from '../../interfaces/calculators.interfaces';
import { FenceDimensions, FenceOptions, RequiredMaterial } from '../../interfaces/fence.interfaces';

/**
 * Calculador de materiales para cercas de madera
 */
export class WoodFenceMaterialCalculator implements MaterialCalculator {
  calculate(dimensions: FenceDimensions, options: FenceOptions): RequiredMaterial[] {
    const { length, height, gates = 0 } = dimensions;
    const { style = 'privacy' } = options;
    
    // Espaciado entre postes (pies)
    const postSpacing = 8; 
    
    // Cálculos básicos
    const posts = Math.ceil(length / postSpacing) + 1;
    const rails = Math.ceil(length / postSpacing) * (height <= 6 ? 3 : 4); // 3 rails estándar, 4 para cercas altas
    
    // Cantidad de pickets varía según el estilo
    let pickets = 0;
    switch(style.toLowerCase()) {
      case 'privacy':
        pickets = Math.ceil(length * 2); // 2 pickets por pie lineal (sin espacio)
        break;
      case 'semi-privacy':
        pickets = Math.ceil(length * 1.5); // 1.5 pickets por pie lineal
        break;
      case 'picket':
        pickets = Math.ceil(length * 1.2); // 1.2 pickets por pie lineal (con espacio)
        break;
      case 'shadow-box':
        pickets = Math.ceil(length * 4); // Doble fila de pickets
        break;
      default:
        pickets = Math.ceil(length * 2);
    }
    
    // Lista de materiales
    const materials: RequiredMaterial[] = [
      { 
        id: 'wood-post', 
        name: `${height + 2}' Wood Fence Post`, 
        quantity: posts, 
        unit: 'each',
        fallbackPrice: 15.99
      },
      { 
        id: 'rail-2x4',
        name: '2"x4"x8\' Pressure Treated Rail', 
        quantity: rails, 
        unit: 'each',
        fallbackPrice: 7.99
      },
      { 
        id: 'picket',
        name: `1"x6"x${height}' Wood Fence Picket`, 
        quantity: pickets, 
        unit: 'each',
        fallbackPrice: 3.99
      },
      { 
        id: 'concrete',
        name: 'Concrete Mix 50lb', 
        quantity: posts * 2, // 2 bolsas por poste
        unit: 'bag',
        fallbackPrice: 5.99
      },
      { 
        id: 'screws',
        name: 'Exterior Screws 5lb', 
        quantity: Math.ceil(pickets / 100), // 1 caja por cada 100 pickets aprox
        unit: 'box',
        fallbackPrice: 24.99
      }
    ];
    
    // Agregar puertas si existen
    if (gates > 0) {
      materials.push(
        { 
          id: 'gate-frame',
          name: `Wood Gate Frame Kit ${height}'`, 
          quantity: gates, 
          unit: 'each',
          fallbackPrice: 49.99
        },
        { 
          id: 'gate-hardware',
          name: 'Gate Hardware Kit', 
          quantity: gates, 
          unit: 'each',
          fallbackPrice: 29.99
        }
      );
    }
    
    return materials;
  }
}