import { MaterialCalculator } from '../../interfaces/calculators.interfaces';
import { FenceDimensions, FenceOptions, RequiredMaterial } from '../../interfaces/fence.interfaces';

/**
 * Calculador de materiales para cercas de concreto
 */
export class ConcreteFenceMaterialCalculator implements MaterialCalculator {
  calculate(dimensions: FenceDimensions, options: FenceOptions): RequiredMaterial[] {
    const { length, height, gates = 0 } = dimensions;
    const { finish = 'smooth', panelType = 'precast' } = options;
    
    // Espaciado entre postes depende del tipo (pies)
    const postSpacing = panelType === 'precast' ? 8 : 4;
    
    // Cálculos básicos
    const posts = Math.ceil(length / postSpacing) + 1;
    const panels = Math.ceil(length / postSpacing);
    const concreteVolume = posts * (height * 0.33 * 0.33 * 3); // Pies cúbicos para postes (profundidad 3')
    
    // Lista de materiales base
    const materials: RequiredMaterial[] = [
      { 
        id: 'concrete-post', 
        name: `${height + 3}' Concrete Fence Post (${finish})`, 
        quantity: posts, 
        unit: 'each',
        fallbackPrice: 79.99
      },
      { 
        id: 'concrete-panel',
        name: `${height}' x ${postSpacing}' ${panelType.charAt(0).toUpperCase() + panelType.slice(1)} Concrete Panel (${finish})`, 
        quantity: panels, 
        unit: 'each',
        fallbackPrice: height <= 6 ? 189.99 : 259.99
      },
      { 
        id: 'gravel',
        name: 'Gravel for Post Base', 
        quantity: posts * 0.25, // Yardas cúbicas
        unit: 'cubic_yard',
        fallbackPrice: 45.99
      },
      { 
        id: 'concrete-mix',
        name: 'Concrete Mix', 
        quantity: concreteVolume / 0.6, // Convertir pies cúbicos a bolsas (0.6 pies³ por bolsa)
        unit: 'bag',
        fallbackPrice: 5.99
      },
      { 
        id: 'rebar',
        name: 'Reinforcing Bar (Rebar)', 
        quantity: posts * height * 4, // 4 barras por poste
        unit: 'foot',
        fallbackPrice: 1.19
      },
      { 
        id: 'joint-compound',
        name: 'Concrete Joint Compound', 
        quantity: panels, 
        unit: 'tube',
        fallbackPrice: 8.99
      }
    ];
    
    // Agregar materiales adicionales según el tipo de panel
    if (panelType === 'poured') {
      materials.push(
        {
          id: 'form-boards',
          name: 'Concrete Form Boards',
          quantity: length * 2, // Ambos lados
          unit: 'foot',
          fallbackPrice: 2.99
        },
        {
          id: 'form-ties',
          name: 'Concrete Form Ties',
          quantity: Math.ceil(length * 2), // Aprox. 2 por pie
          unit: 'each',
          fallbackPrice: 1.49
        },
        {
          id: 'release-agent',
          name: 'Concrete Form Release Agent',
          quantity: Math.ceil(length / 50), // 1 galón cubre 50 pies lineales
          unit: 'gallon',
          fallbackPrice: 29.99
        }
      );
    }
    
    // Agregar puertas si existen
    if (gates > 0) {
      materials.push(
        { 
          id: 'gate-frame',
          name: `${height}' x 4' Metal Gate Frame for Concrete Fence`, 
          quantity: gates, 
          unit: 'each',
          fallbackPrice: 199.99
        },
        { 
          id: 'gate-hardware',
          name: 'Heavy Duty Gate Hardware Kit', 
          quantity: gates, 
          unit: 'kit',
          fallbackPrice: 89.99
        }
      );
    }
    
    return materials;
  }
}