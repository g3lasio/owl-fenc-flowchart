import { MaterialCalculator, MaterialCache, PriceAPIClient } from '../../interfaces/calculators.interfaces';
import { FenceDimensions, FenceOptions, FenceType, Location, RequiredMaterial } from '../../interfaces/fence.interfaces';
import { MaterialCalculatorFactory } from './material-calculator.factory';
import { PriceResearchService } from '../../services/price-research.service';
import { config } from '../../config/config';

/**
 * Motor principal de materiales del sistema DeepSearch
 * Responsable de calcular los materiales necesarios para un proyecto
 * y obtener sus precios actualizados
 */
export class MaterialEngine {
  private apiClients: PriceAPIClient[] = [];
  private researchService: PriceResearchService;
  
  constructor(
    private readonly calculatorFactory: MaterialCalculatorFactory,
    private readonly materialCache: MaterialCache,
    apiClients: PriceAPIClient[] = []
  ) {
    this.apiClients = apiClients;
    // Crear el servicio de investigación de precios
    this.researchService = new PriceResearchService(
      config.research.enableAI,
      config.cache.ttlSeconds
    );
  }
  
  /**
   * Calcula los materiales y precios para un proyecto de cerca
   */
  async calculateMaterials(
    fenceType: FenceType,
    dimensions: FenceDimensions,
    options: FenceOptions,
    location: Location
  ): Promise<{ materials: RequiredMaterial[], totalCost: number }> {
    try {
      // Obtener el calculador adecuado para el tipo de cerca
      const calculator = this.calculatorFactory.getCalculator(fenceType);
      if (!calculator) {
        throw new Error(`No se encontró calculador para el tipo de cerca: ${fenceType}`);
      }
      
      // Calcular materiales necesarios
      const requiredMaterials = calculator.calculate(dimensions, options);
      
      // Aplicar reglas de proyecto específicas si existen
      const materialsWithRules = this.applyProjectRules(requiredMaterials, fenceType, options);
      
      // Obtener precios para los materiales
      const pricedMaterials = await this.getPricesForMaterials(materialsWithRules, location);
      
      // Calcular costo total
      const totalCost = pricedMaterials.reduce((total, material) => {
        return total + (material.quantity * material.unitPrice);
      }, 0);
      
      return {
        materials: pricedMaterials,
        totalCost
      };
    } catch (error) {
      console.error('Error en el motor de materiales:', error);
      throw new Error(`Error al calcular materiales: ${(error as Error).message}`);
    }
  }
  
  /**
   * Aplica reglas específicas del proyecto a los materiales requeridos
   * basadas en el tipo de cerca y opciones seleccionadas
   */
  private applyProjectRules(
    materials: RequiredMaterial[], 
    fenceType: FenceType, 
    options: FenceOptions
  ): RequiredMaterial[] {
    // Aplicar reglas generales
    let adjustedMaterials = [...materials];
    
    // Regla: Si hay puertas, añadir herrajes adicionales según el tipo de cerca
    if (options.gates && options.gates.length > 0) {
      switch (fenceType) {
        case 'wood':
          // Para cercas de madera, añadir kit de herrajes específico
          const hasGateHardware = materials.some(m => m.id === 'gate-hardware-kit');
          if (!hasGateHardware) {
            adjustedMaterials.push({
              id: 'gate-hardware-kit',
              name: 'Gate Hardware Kit',
              quantity: options.gates.length,
              unit: 'each',
              unitPrice: 29.99
            });
          }
          break;
          
        case 'vinyl':
          // Para cercas de vinilo, verificar si necesita herrajes especiales
          const needsVinylHardware = options.gates.some(g => g.width > 4);
          if (needsVinylHardware) {
            adjustedMaterials.push({
              id: 'heavy-duty-vinyl-gate-hardware',
              name: 'Heavy Duty Vinyl Gate Hardware Kit',
              quantity: options.gates.filter(g => g.width > 4).length,
              unit: 'kit',
              unitPrice: 59.99
            });
          }
          break;
          
        // Otras reglas específicas por tipo de cerca
      }
    }
    
    // Regla: Si es una cerca alta, añadir material de refuerzo
    if ((dimensions) => dimensions.height > 6) {
      switch (fenceType) {
        case 'wood':
          // Añadir refuerzos para cercas de madera altas
          adjustedMaterials.push({
            id: 'wood-reinforcement-bracket',
            name: 'Wood Fence Post Reinforcement Bracket',
            quantity: Math.ceil(options.linearFeet / 8), // Uno cada 8 pies
            unit: 'each',
            unitPrice: 12.99
          });
          break;
          
        case 'chain-link':
          // Añadir postes más gruesos para cercas chain-link altas
          // Reemplazar los postes estándar con postes reforzados
          adjustedMaterials = adjustedMaterials.map(material => {
            if (material.id.includes('line-post')) {
              return {
                ...material,
                id: 'heavy-duty-line-post',
                name: 'Heavy Duty Line Post 11 Gauge',
                unitPrice: material.unitPrice * 1.5 // 50% más costoso
              };
            }
            return material;
          });
          break;
          
        // Otras reglas para tipos de cerca
      }
    }
    
    // Regla: Si se especifica resistencia al viento, añadir materiales adicionales
    if (options.windRating && options.windRating > 100) { // mph
      // Añadir materiales de refuerzo según el tipo de cerca
      switch (fenceType) {
        case 'vinyl':
          // Para vinilo, añadir refuerzos de acero internos
          adjustedMaterials.push({
            id: 'steel-insert-reinforcement',
            name: 'Steel Insert Reinforcement for Vinyl Posts',
            quantity: Math.ceil(options.linearFeet / 8), // Uno cada 8 pies
            unit: 'each',
            unitPrice: 18.99
          });
          break;
          
        case 'aluminum':
          // Para aluminio, usar postes más gruesos
          adjustedMaterials = adjustedMaterials.map(material => {
            if (material.id.includes('aluminum-post')) {
              return {
                ...material,
                id: 'heavy-duty-aluminum-post',
                name: 'Heavy Duty Aluminum Fence Post',
                unitPrice: material.unitPrice * 1.3 // 30% más costoso
              };
            }
            return material;
          });
          break;
          
        // Otras reglas para tipos de cerca
      }
    }
    
    return adjustedMaterials;
  }
  
  /**
   * Obtiene precios para los materiales utilizando caché, APIs y servicio de investigación
   */
  private async getPricesForMaterials(
    materials: RequiredMaterial[],
    location: Location
  ): Promise<RequiredMaterial[]> {
    const pricedMaterials: RequiredMaterial[] = [];
    
    // Mapa para evitar duplicados en la búsqueda de precios
    const uniqueMaterialIds = new Set<string>();
    materials.forEach(m => uniqueMaterialIds.add(m.id));
    
    // Buscar precios para cada material único
    for (const materialId of uniqueMaterialIds) {
      const material = materials.find(m => m.id === materialId);
      if (!material) continue;
      
      let pricedMaterial = { ...material };
      
      try {
        // 1. Intentar obtener precio de caché
        const cachedPrice = this.materialCache.get(materialId, location.zipCode);
        
        if (cachedPrice) {
          pricedMaterial.unitPrice = cachedPrice.unitPrice;
          pricedMaterial.priceSource = cachedPrice.source;
          pricedMaterials.push(pricedMaterial);
          continue;
        }
        
        // 2. Intentar obtener precio de proveedores API
        let priceFound = false;
        
        for (const apiClient of this.apiClients) {
          try {
            const priceResult = await apiClient.getPrice(materialId, location);
            
            if (priceResult.available) {
              pricedMaterial.unitPrice = priceResult.amount;
              pricedMaterial.priceSource = priceResult.source;
              
              // Guardar en caché
              this.materialCache.set({
                id: materialId,
                location: location.zipCode,
                unitPrice: priceResult.amount,
                priceSource: priceResult.source
              });
              
              priceFound = true;
              break;
            }
          } catch (error) {
            console.warn(`Error al obtener precio desde API para ${materialId}:`, error);
            // Continuar con el siguiente cliente
          }
        }
        
        // 3. Si no se encontró precio con los clientes API, usar el servicio de investigación
        if (!priceFound) {
          const researchResult = await this.researchService.getPrice(materialId, location);
          
          if (researchResult.available) {
            pricedMaterial.unitPrice = researchResult.amount;
            pricedMaterial.priceSource = researchResult.source;
            
            // Guardar en caché
            this.materialCache.set({
              id: materialId,
              location: location.zipCode,
              unitPrice: researchResult.amount,
              priceSource: researchResult.source
            });
          }
        }
      } catch (error) {
        console.error(`Error al obtener precio para ${materialId}:`, error);
        // Mantener el precio predeterminado si existe
      }
      
      pricedMaterials.push(pricedMaterial);
    }
    
    return pricedMaterials;
  }
}