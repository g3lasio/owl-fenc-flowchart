import { MaterialCalculator } from '../../interfaces/calculators.interfaces';
import { FenceDimensions, FenceOptions, RequiredMaterial } from '../../interfaces/fence.interfaces';

/**
 * Calculador de materiales para cercas de malla
 */
export class MeshFenceMaterialCalculator implements MaterialCalculator {
  calculate(dimensions: FenceDimensions, options: FenceOptions): RequiredMaterial[] {
    const { length, height, gates = 0 } = dimensions;
    const { meshType = 'standard', fastening = 'clips' } = options;
    
    // Espaciado entre postes (pies)
    const postSpacing = 8;
    
    // Cálculos básicos
    const posts = Math.ceil(length / postSpacing) + 1;
    const meshArea = length * height * 1.1; // 10% adicional para solapamiento
    
    // Lista de materiales base
    const materials: RequiredMaterial[] = [
      { 
        id: 'metal-post', 
        name: `${height + 2}' Metal Post`, 
        quantity: posts, 
        unit: 'each',
        fallbackPrice: 18.99
      },
      { 
        id: 'mesh',
        name: `Mesh Fencing Material ${meshType}`, 
        quantity: meshArea, 
        unit: 'sq_ft',
        fallbackPrice: 1.99
      },
      { 
        id: fastening,
        name: `Mesh ${fastening.charAt(0).toUpperCase() + fastening.slice(1)}`, 
        quantity: posts * 3, // 3 puntos de fijación por poste
        unit: 'each',
        fallbackPrice: fastening === 'clips' ? 0.99 : 1.49
      },
      { 
        id: 'concrete',
        name: 'Concrete Mix 50lb', 
        quantity: posts * 2, 
        unit: 'bag',
        fallbackPrice: 5.99
      },
      { 
        id: 'tension-cable',
        name: 'Tension Cable', 
        quantity: length * 3, // Cable superior, medio e inferior
        unit: 'foot',
        fallbackPrice: 0.59
      }
    ];
    
    // Agregar material adicional según tipo de malla
    if (meshType === 'privacy') {
      materials.push({
        id: 'privacy-slats',
        name: 'Privacy Fence Slats',
        quantity: length,
        unit: 'foot',
        fallbackPrice: 2.99
      });
    }
    
    // Agregar puertas si existen
    if (gates > 0) {
      materials.push(
        { 
          id: 'mesh-gate-frame',
          name: `${height}' x 4' Mesh Gate Frame`, 
          quantity: gates, 
          unit: 'each',
          fallbackPrice: 59.99
        },
        { 
          id: 'mesh-gate-fabric',
          name: `Mesh Gate Fabric ${meshType}`, 
          quantity: gates * height * 4, // 4 pies de ancho por puerta
          unit: 'sq_ft',
          fallbackPrice: 2.49
        },
        { 
          id: 'gate-hardware',
          name: 'Mesh Gate Hardware Kit', 
          quantity: gates, 
          unit: 'kit',
          fallbackPrice: 24.99
        }
      );
    }
    
    return materials;
  }
}