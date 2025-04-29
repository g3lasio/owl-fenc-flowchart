import { MaterialCalculator } from '../../interfaces/calculators.interfaces';
import { FenceDimensions, FenceOptions, RequiredMaterial } from '../../interfaces/fence.interfaces';

/**
 * Calculador de materiales para cercas de cadena (Chain Link)
 */
export class ChainLinkFenceMaterialCalculator implements MaterialCalculator {
  calculate(dimensions: FenceDimensions, options: FenceOptions): RequiredMaterial[] {
    const { length, height, gates = 0 } = dimensions;
    const { gauge = '11', coating = 'galvanized' } = options;
    
    // Espaciado entre postes (pies)
    const postSpacing = 10;
    
    // Cálculos básicos
    const terminalPosts = 2; // Postes de terminal (esquinas/extremos)
    const linePosts = Math.ceil(length / postSpacing) - 1; // Postes de línea
    const fabric = Math.ceil(length * 1.05); // 5% extra para solapamiento
    const topRail = Math.ceil(length * 1.05); // Igual longitud que la tela
    
    // Lista de materiales base
    const materials: RequiredMaterial[] = [
      { 
        id: 'terminal-post', 
        name: `${height + 2}' Terminal Post ${gauge} Gauge ${coating}`, 
        quantity: terminalPosts, 
        unit: 'each',
        fallbackPrice: 25.99
      },
      { 
        id: 'line-post',
        name: `${height + 2}' Line Post ${gauge} Gauge ${coating}`, 
        quantity: linePosts, 
        unit: 'each',
        fallbackPrice: 19.99 
      },
      { 
        id: 'fabric',
        name: `${height}' Chain Link Fabric ${gauge} Gauge ${coating}`, 
        quantity: fabric, 
        unit: 'foot',
        fallbackPrice: 4.99
      },
      { 
        id: 'top-rail',
        name: `1-3/8" Top Rail ${coating}`, 
        quantity: topRail, 
        unit: 'foot',
        fallbackPrice: 2.49
      },
      { 
        id: 'tension-wire',
        name: 'Tension Wire', 
        quantity: fabric, 
        unit: 'foot',
        fallbackPrice: 0.59
      },
      { 
        id: 'concrete',
        name: 'Concrete Mix 50lb', 
        quantity: (terminalPosts + linePosts) * 2, 
        unit: 'bag',
        fallbackPrice: 5.99
      },
      {
        id: 'tie-wires',
        name: 'Chain Link Tie Wires (100 pack)',
        quantity: Math.ceil(fabric / 25), // 1 paquete por cada 25 pies
        unit: 'pack',
        fallbackPrice: 9.99
      }
    ];
    
    // Agregar puertas si existen
    if (gates > 0) {
      materials.push(
        { 
          id: 'chain-link-gate',
          name: `${height}' x 4' Chain Link Gate ${gauge} Gauge ${coating}`, 
          quantity: gates, 
          unit: 'each',
          fallbackPrice: height <= 6 ? 89.99 : 129.99
        },
        { 
          id: 'gate-hardware',
          name: 'Chain Link Gate Hardware Kit', 
          quantity: gates, 
          unit: 'kit',
          fallbackPrice: 29.99
        }
      );
    }
    
    return materials;
  }
}