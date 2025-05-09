import axios from 'axios';
import { Location } from '../interfaces/fence.interfaces';
import { config } from '../config/config';

/**
 * Servicio para consulta de disponibilidad de materiales en tiempo real
 * con distribuidores y proveedores locales. Permite verificar inventario,
 * obtener precios actualizados y recomendaciones de productos.
 */
export class MaterialSupplierService {
  // Mapeo de API endpoints por proveedor
  private readonly SUPPLIER_ENDPOINTS = {
    homedepot: {
      inventory: `${config.suppliers.homedepot.baseUrl}/inventory`,
      products: `${config.suppliers.homedepot.baseUrl}/products`,
      recommendations: `${config.suppliers.homedepot.baseUrl}/recommendations`
    },
    lowes: {
      inventory: `${config.suppliers.lowes.baseUrl}/inventory`,
      products: `${config.suppliers.lowes.baseUrl}/products`,
      recommendations: `${config.suppliers.lowes.baseUrl}/recommendations`
    },
    andersen: {
      inventory: `${config.suppliers.andersen.baseUrl}/inventory`,
      products: `${config.suppliers.andersen.baseUrl}/products`,
      recommendations: `${config.suppliers.andersen.baseUrl}/recommendations`
    },
    pella: {
      inventory: `${config.suppliers.pella.baseUrl}/inventory`,
      products: `${config.suppliers.pella.baseUrl}/products`,
      recommendations: `${config.suppliers.pella.baseUrl}/recommendations`
    },
    marvin: {
      inventory: `${config.suppliers.marvin.baseUrl}/inventory`,
      products: `${config.suppliers.marvin.baseUrl}/products`,
      recommendations: `${config.suppliers.marvin.baseUrl}/recommendations`
    },
    localSuppliers: {
      baseUrl: `${config.suppliers.localApi.baseUrl}`
    }
  };
  
  // Catálogo de productos con fallbacks por si las APIs no responden
  private readonly FALLBACK_CATALOG = {
    window: {
      standard: [
        {
          id: 'aw-2030-dh-vinyl',
          sku: 'AW-2030-DH-VINYL',
          name: 'Ventana Guillotina Doble Vinilo 2\'x3\'',
          supplier: 'Andersen Windows',
          type: 'double_hung',
          material: 'vinyl',
          dimensions: { width: 24, height: 36 },
          price: 189.99,
          estimatedDelivery: this.addDays(new Date(), 3)
        },
        {
          id: 'aw-3040-dh-vinyl',
          sku: 'AW-3040-DH-VINYL',
          name: 'Ventana Guillotina Doble Vinilo 3\'x4\'',
          supplier: 'Andersen Windows',
          type: 'double_hung',
          material: 'vinyl',
          dimensions: { width: 36, height: 48 },
          price: 259.99,
          estimatedDelivery: this.addDays(new Date(), 3)
        },
        {
          id: 'pw-3050-csmt-wd',
          sku: 'PW-3050-CSMT-WD',
          name: 'Ventana Batiente Madera 3\'x5\'',
          supplier: 'Pella Windows',
          type: 'casement',
          material: 'wood',
          dimensions: { width: 36, height: 60 },
          price: 399.99,
          estimatedDelivery: this.addDays(new Date(), 5)
        },
        {
          id: 'mw-6040-sld-fbr',
          sku: 'MW-6040-SLD-FBR',
          name: 'Ventana Corredera Fibra de Vidrio 6\'x4\'',
          supplier: 'Marvin Windows',
          type: 'sliding',
          material: 'fiberglass',
          dimensions: { width: 72, height: 48 },
          price: 489.99,
          estimatedDelivery: this.addDays(new Date(), 7)
        }
      ],
      custom: [
        {
          id: 'aw-custom-dh-vinyl',
          sku: 'AW-CUSTOM-DH-VINYL',
          name: 'Ventana Guillotina Doble Vinilo - Medida Personalizada',
          supplier: 'Andersen Windows',
          type: 'double_hung',
          material: 'vinyl',
          isCustom: true,
          basePricePerSqFt: 21.99,
          estimatedDelivery: this.addDays(new Date(), 10)
        },
        {
          id: 'pw-custom-csmt-wd',
          sku: 'PW-CUSTOM-CSMT-WD',
          name: 'Ventana Batiente Madera - Medida Personalizada',
          supplier: 'Pella Windows',
          type: 'casement',
          material: 'wood',
          isCustom: true,
          basePricePerSqFt: 35.99,
          estimatedDelivery: this.addDays(new Date(), 14)
        },
        {
          id: 'mw-custom-sld-fbr',
          sku: 'MW-CUSTOM-SLD-FBR',
          name: 'Ventana Corredera Fibra de Vidrio - Medida Personalizada',
          supplier: 'Marvin Windows',
          type: 'sliding',
          material: 'fiberglass',
          isCustom: true,
          basePricePerSqFt: 42.99,
          estimatedDelivery: this.addDays(new Date(), 14)
        }
      ]
    },
    door: {
      // Catálogo fallback de puertas
    }
    // Otros tipos de productos...
  };
  
  constructor() {
    this.validateConfig();
  }
  
  /**
   * Valida la configuración de APIs de proveedores
   */
  private validateConfig(): void {
    const isConfigValid = config.suppliers && 
                        (config.suppliers.homedepot || 
                         config.suppliers.lowes || 
                         config.suppliers.localApi);
    
    if (!isConfigValid) {
      console.warn('⚠️ Configuración de proveedores incompleta. Se usarán datos fallback para demostraciones.');
    }
  }
  
  /**
   * Verifica disponibilidad de inventario para los productos requeridos
   * Consulta múltiples proveedores en paralelo para encontrar la mejor opción
   */
  async checkInventoryAvailability(
    productCategory: string,
    items: any[],
    location: Location
  ): Promise<any> {
    try {
      // Si no hay elementos para verificar, retornar disponibilidad completa por defecto
      if (!items || items.length === 0) {
        return {
          status: 'success',
          availability: 'complete',
          message: 'No se especificaron artículos para verificar inventario'
        };
      }
      
      // Determinar qué proveedores consultar según el tipo de producto
      const suppliersToCheck = this.getSuppliersForCategory(productCategory);
      
      // Intentar consultar APIs de proveedores en paralelo
      try {
        const inventoryPromises = suppliersToCheck.map(supplier => 
          this.checkSupplierInventory(supplier, productCategory, items, location)
        );
        
        const inventoryResults = await Promise.allSettled(inventoryPromises);
        
        // Procesar resultados y combinar disponibilidad
        const availability = this.processInventoryResults(inventoryResults, items);
        
        // Si no hay suficiente información de APIs, usar datos fallback
        if (availability.dataSourceCount === 0) {
          return this.generateFallbackInventoryData(productCategory, items, location);
        }
        
        return availability;
      } catch (apiError) {
        console.error('Error consultando APIs de inventario:', apiError);
        // Usar datos fallback en caso de error
        return this.generateFallbackInventoryData(productCategory, items, location);
      }
    } catch (error) {
      console.error('Error en verificación de inventario:', error);
      return {
        status: 'error',
        message: 'Error verificando disponibilidad de inventario',
        details: error.message
      };
    }
  }
  
  /**
   * Obtiene recomendaciones de productos basadas en los detalles del proyecto
   */
  async getRecommendedProducts(
    productCategory: string,
    itemDetails: any[],
    location: Location
  ): Promise<any[]> {
    try {
      // Si no hay elementos, retornar recomendaciones vacías
      if (!itemDetails || itemDetails.length === 0) {
        return [];
      }
      
      // Intentar obtener recomendaciones de las APIs de proveedores
      try {
        // Determinar qué proveedores consultar según el tipo de producto
        const suppliersToCheck = this.getSuppliersForCategory(productCategory);
        
        // Solicitar recomendaciones a cada proveedor
        const recommendationPromises = suppliersToCheck.map(supplier => 
          this.getSupplierRecommendations(supplier, productCategory, itemDetails, location)
        );
        
        const recommendationResults = await Promise.allSettled(recommendationPromises);
        
        // Combinar recomendaciones de todos los proveedores
        const allRecommendations = this.processRecommendationResults(recommendationResults);
        
        // Si hay suficientes recomendaciones, usarlas
        if (allRecommendations.length >= itemDetails.length) {
          return this.optimizeRecommendations(allRecommendations, itemDetails);
        }
        
        // Complementar con datos fallback si es necesario
        const fallbackRecommendations = this.generateFallbackRecommendations(
          productCategory, 
          itemDetails, 
          location,
          allRecommendations
        );
        
        return this.optimizeRecommendations(fallbackRecommendations, itemDetails);
      } catch (apiError) {
        console.error('Error consultando APIs de recomendaciones:', apiError);
        // Usar recomendaciones fallback en caso de error
        return this.generateFallbackRecommendations(productCategory, itemDetails, location, []);
      }
    } catch (error) {
      console.error('Error generando recomendaciones de productos:', error);
      // En caso de error, generar recomendaciones fallback
      return this.generateFallbackRecommendations(productCategory, itemDetails, location, []);
    }
  }
  
  /**
   * Consulta el inventario de un proveedor específico
   */
  private async checkSupplierInventory(
    supplier: string,
    productCategory: string,
    items: any[],
    location: Location
  ): Promise<any> {
    try {
      // Verificar si tenemos configuración para este proveedor
      if (!this.SUPPLIER_ENDPOINTS[supplier]) {
        return { supplier, status: 'error', message: 'Proveedor no configurado' };
      }
      
      // Construir la solicitud según el proveedor
      const endpoint = this.SUPPLIER_ENDPOINTS[supplier].inventory;
      
      // Si es API local, usar el endpoint correspondiente
      if (supplier === 'localSuppliers') {
        return this.checkLocalSuppliersInventory(productCategory, items, location);
      }
      
      // Realizar solicitud a la API del proveedor
      const response = await axios.post(endpoint, {
        category: productCategory,
        items,
        location: {
          zipCode: location.zipCode,
          city: location.city,
          state: location.state
        }
      }, {
        headers: {
          'Authorization': `Bearer ${config.suppliers[supplier].apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000 // Timeout de 5 segundos
      });
      
      return {
        supplier,
        status: 'success',
        data: response.data
      };
    } catch (error) {
      console.error(`Error consultando inventario de ${supplier}:`, error);
      return {
        supplier,
        status: 'error',
        message: `Error consultando ${supplier}: ${error.message}`
      };
    }
  }
  
  /**
   * Consulta proveedores locales a través de la API unificada
   */
  private async checkLocalSuppliersInventory(
    productCategory: string,
    items: any[],
    location: Location
  ): Promise<any> {
    try {
      const endpoint = `${this.SUPPLIER_ENDPOINTS.localSuppliers.baseUrl}/local-inventory`;
      
      const response = await axios.post(endpoint, {
        category: productCategory,
        items,
        location
      }, {
        headers: {
          'Authorization': `Bearer ${config.suppliers.localApi.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 8000 // Timeout más largo para API local que consulta múltiples proveedores
      });
      
      return {
        supplier: 'localSuppliers',
        status: 'success',
        data: response.data
      };
    } catch (error) {
      console.error(`Error consultando proveedores locales:`, error);
      return {
        supplier: 'localSuppliers',
        status: 'error',
        message: `Error consultando proveedores locales: ${error.message}`
      };
    }
  }
  
  /**
   * Obtiene recomendaciones de productos de un proveedor específico
   */
  private async getSupplierRecommendations(
    supplier: string,
    productCategory: string,
    itemDetails: any[],
    location: Location
  ): Promise<any> {
    try {
      // Verificar si tenemos configuración para este proveedor
      if (!this.SUPPLIER_ENDPOINTS[supplier]) {
        return { supplier, status: 'error', message: 'Proveedor no configurado' };
      }
      
      // Construir la solicitud según el proveedor
      const endpoint = this.SUPPLIER_ENDPOINTS[supplier].recommendations;
      
      // Si es API local, usar el endpoint correspondiente
      if (supplier === 'localSuppliers') {
        return this.getLocalSuppliersRecommendations(productCategory, itemDetails, location);
      }
      
      // Realizar solicitud a la API del proveedor
      const response = await axios.post(endpoint, {
        category: productCategory,
        items: itemDetails,
        location: {
          zipCode: location.zipCode,
          city: location.city,
          state: location.state
        }
      }, {
        headers: {
          'Authorization': `Bearer ${config.suppliers[supplier].apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000 // Timeout de 5 segundos
      });
      
      return {
        supplier,
        status: 'success',
        data: response.data
      };
    } catch (error) {
      console.error(`Error obteniendo recomendaciones de ${supplier}:`, error);
      return {
        supplier,
        status: 'error',
        message: `Error obteniendo recomendaciones de ${supplier}: ${error.message}`
      };
    }
  }
  
  /**
   * Obtiene recomendaciones de proveedores locales
   */
  private async getLocalSuppliersRecommendations(
    productCategory: string,
    itemDetails: any[],
    location: Location
  ): Promise<any> {
    try {
      const endpoint = `${this.SUPPLIER_ENDPOINTS.localSuppliers.baseUrl}/local-recommendations`;
      
      const response = await axios.post(endpoint, {
        category: productCategory,
        items: itemDetails,
        location
      }, {
        headers: {
          'Authorization': `Bearer ${config.suppliers.localApi.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 8000
      });
      
      return {
        supplier: 'localSuppliers',
        status: 'success',
        data: response.data
      };
    } catch (error) {
      console.error(`Error obteniendo recomendaciones locales:`, error);
      return {
        supplier: 'localSuppliers',
        status: 'error',
        message: `Error obteniendo recomendaciones locales: ${error.message}`
      };
    }
  }
  
  /**
   * Procesa los resultados de inventario de múltiples proveedores
   */
  private processInventoryResults(results: PromiseSettledResult<any>[], items: any[]): any {
    // Contar fuentes de datos exitosas
    let dataSourceCount = 0;
    let successfulRequests = [];
    
    // Extraer resultados exitosos
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value.status === 'success') {
        dataSourceCount++;
        successfulRequests.push(result.value);
      }
    });
    
    // Si no hay resultados exitosos, indicarlo
    if (dataSourceCount === 0) {
      return { status: 'warning', dataSourceCount: 0, message: 'No se obtuvieron datos de proveedores' };
    }
    
    // Combinar los resultados exitosos
    const combinedInventory = {};
    
    // Inicializar inventario combinado con todos los items
    items.forEach((item, index) => {
      const itemKey = `item_${index}`;
      combinedInventory[itemKey] = {
        item,
        availability: [],
        bestOption: null
      };
    });
    
    // Agregar disponibilidad de cada proveedor
    successfulRequests.forEach(request => {
      const supplier = request.supplier;
      const inventory = request.data?.inventory || [];
      
      inventory.forEach(invItem => {
        const itemKey = `item_${invItem.itemIndex}`;
        
        if (combinedInventory[itemKey]) {
          combinedInventory[itemKey].availability.push({
            supplier,
            available: invItem.available,
            quantity: invItem.quantity,
            price: invItem.price,
            estimatedDelivery: invItem.estimatedDelivery,
            notes: invItem.notes
          });
          
          // Actualizar mejor opción si aplicable (en stock y mejor precio)
          if (invItem.available && 
              (!combinedInventory[itemKey].bestOption || 
               invItem.price < combinedInventory[itemKey].bestOption.price)) {
            combinedInventory[itemKey].bestOption = {
              supplier,
              price: invItem.price,
              estimatedDelivery: invItem.estimatedDelivery
            };
          }
        }
      });
    });
    
    // Evaluar disponibilidad general
    let unavailableCount = 0;
    Object.values(combinedInventory).forEach((itemData: any) => {
      if (!itemData.bestOption) {
        unavailableCount++;
      }
    });
    
    // Determinar estado general
    let availability = 'complete'; // Todos disponibles
    if (unavailableCount === items.length) {
      availability = 'none'; // Ninguno disponible
    } else if (unavailableCount > 0) {
      availability = 'partial'; // Algunos disponibles
    }
    
    return {
      status: 'success',
      dataSourceCount,
      availability,
      inventory: combinedInventory,
      unavailableCount
    };
  }
  
  /**
   * Procesa los resultados de recomendaciones de productos
   */
  private processRecommendationResults(results: PromiseSettledResult<any>[]): any[] {
    let allRecommendations = [];
    
    // Extraer recomendaciones exitosas
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value.status === 'success') {
        const recommendations = result.value.data?.recommendations || [];
        allRecommendations = [...allRecommendations, ...recommendations];
      }
    });
    
    return allRecommendations;
  }
  
  /**
   * Optimiza las recomendaciones para maximizar la relación calidad/precio
   */
  private optimizeRecommendations(recommendations: any[], itemDetails: any[]): any[] {
    // Si no hay suficientes recomendaciones, devolver las disponibles
    if (recommendations.length <= itemDetails.length) {
      return recommendations;
    }
    
    // Agrupar recomendaciones por tipo de producto
    const groupedRecommendations = {};
    
    recommendations.forEach(rec => {
      const key = rec.type || 'unknown';
      if (!groupedRecommendations[key]) {
        groupedRecommendations[key] = [];
      }
      groupedRecommendations[key].push(rec);
    });
    
    // Para cada tipo, seleccionar la mejor opción
    const optimizedRecommendations = [];
    
    Object.keys(groupedRecommendations).forEach(type => {
      const typeRecommendations = groupedRecommendations[type];
      
      // Ordenar por puntuación de calidad/precio (descendente)
      typeRecommendations.sort((a, b) => {
        const scoreA = (a.qualityScore || 5) / a.price;
        const scoreB = (b.qualityScore || 5) / b.price;
        return scoreB - scoreA; // Orden descendente
      });
      
      // Agregar la mejor opción y una alternativa más económica si está disponible
      if (typeRecommendations.length > 0) {
        optimizedRecommendations.push({
          ...typeRecommendations[0],
          recommendation: 'best_value'
        });
        
        // Si hay más opciones, agregar una alternativa económica
        if (typeRecommendations.length > 1) {
          // Ordenar por precio (ascendente)
          const budgetOptions = [...typeRecommendations].sort((a, b) => a.price - b.price);
          
          // Tomar la opción más económica que no sea la misma que la mejor relación calidad/precio
          const budgetOption = budgetOptions.find(opt => opt.id !== typeRecommendations[0].id);
          
          if (budgetOption) {
            optimizedRecommendations.push({
              ...budgetOption,
              recommendation: 'budget_friendly'
            });
          }
        }
      }
    });
    
    return optimizedRecommendations;
  }
  
  /**
   * Genera datos fallback de inventario cuando las APIs no responden
   */
  private generateFallbackInventoryData(
    productCategory: string,
    items: any[],
    location: Location
  ): any {
    console.log(`Generando datos fallback de inventario para ${productCategory}`);
    
    // Preparar respuesta fallback
    const fallbackInventory = {};
    
    // Generar disponibilidad simulada para cada item
    items.forEach((item, index) => {
      const itemKey = `item_${index}`;
      const isAvailable = Math.random() > 0.2; // 80% de probabilidad de disponibilidad
      
      fallbackInventory[itemKey] = {
        item,
        availability: [
          {
            supplier: 'Proveedor Local',
            available: isAvailable,
            quantity: isAvailable ? Math.floor(Math.random() * 10) + 1 : 0,
            price: this.calculateFallbackPrice(productCategory, item),
            estimatedDelivery: this.addDays(new Date(), Math.floor(Math.random() * 7) + 1),
            notes: isAvailable ? 'Disponible para entrega local' : 'Temporalmente sin stock'
          }
        ],
        bestOption: isAvailable ? {
          supplier: 'Proveedor Local',
          price: this.calculateFallbackPrice(productCategory, item),
          estimatedDelivery: this.addDays(new Date(), Math.floor(Math.random() * 7) + 1)
        } : null
      };
    });
    
    // Contar items no disponibles
    const unavailableCount = Object.values(fallbackInventory)
      .filter((itemData: any) => !itemData.bestOption).length;
    
    // Determinar disponibilidad general
    let availability = 'complete';
    if (unavailableCount === items.length) {
      availability = 'none';
    } else if (unavailableCount > 0) {
      availability = 'partial';
    }
    
    return {
      status: 'success',
      dataSourceCount: 1,
      availability,
      inventory: fallbackInventory,
      unavailableCount,
      isFallback: true
    };
  }
  
  /**
   * Genera recomendaciones fallback cuando las APIs no responden
   */
  private generateFallbackRecommendations(
    productCategory: string,
    itemDetails: any[],
    location: Location,
    existingRecommendations: any[] = []
  ): any[] {
    console.log(`Generando recomendaciones fallback para ${productCategory}`);
    
    // Si no hay catálogo fallback para esta categoría, devolver recomendaciones existentes
    if (!this.FALLBACK_CATALOG[productCategory]) {
      return existingRecommendations;
    }
    
    const fallbackRecommendations = [...existingRecommendations];
    
    // Para cada item sin recomendación, generar una recomendación fallback
    itemDetails.forEach(item => {
      // Verificar si ya existe una recomendación para este tipo de item
      const itemType = item.type || 'standard';
      const existingRec = fallbackRecommendations.find(rec => rec.type === itemType);
      
      if (!existingRec) {
        // Para ventanas, considerar si son estándar o personalizadas
        if (productCategory === 'window') {
          const isStandardSize = this.isStandardWindowSize(item.dimensions);
          const catalog = isStandardSize ? 
                        this.FALLBACK_CATALOG.window.standard : 
                        this.FALLBACK_CATALOG.window.custom;
          
          if (catalog && catalog.length > 0) {
            // Encontrar el mejor match para las dimensiones
            const bestMatch = this.findBestSizeMatch(catalog, item.dimensions);
            
            if (bestMatch) {
              // Para tamaños personalizados, calcular precio basado en área
              if (!isStandardSize && bestMatch.isCustom) {
                const area = (item.dimensions.width / 12) * (item.dimensions.height / 12); // Convertir a pies cuadrados
                bestMatch.price = area * bestMatch.basePricePerSqFt;
                bestMatch.dimensions = { ...item.dimensions };
              }
              
              // Agregar cantidad recomendada
              bestMatch.recommendedQuantity = item.count || 1;
              
              // Agregar a las recomendaciones
              fallbackRecommendations.push({
                ...bestMatch,
                recommendation: 'best_match'
              });
            }
          }
        }
        // Lógica para otros tipos de productos...
      }
    });
    
    return fallbackRecommendations;
  }
  
  /**
   * Determina qué proveedores consultar según el tipo de producto
   */
  private getSuppliersForCategory(category: string): string[] {
    // Proveedores generales disponibles para todas las categorías
    const generalSuppliers = ['homedepot', 'lowes', 'localSuppliers'];
    
    // Proveedores específicos por categoría
    const categorySuppliers = {
      window: ['andersen', 'pella', 'marvin'],
      door: ['masonite', 'jeldwen', 'thermatru']
      // Otros tipos...
    };
    
    // Combinar proveedores generales con específicos si están definidos
    return categorySuppliers[category] ? 
      [...generalSuppliers, ...categorySuppliers[category]] : 
      generalSuppliers;
  }
  
  /**
   * Verifica si un tamaño de ventana es estándar o personalizado
   */
  private isStandardWindowSize(dimensions: any): boolean {
    if (!dimensions || !dimensions.width || !dimensions.height) {
      return false;
    }
    
    // Lista de tamaños estándar comunes (ancho x alto en pulgadas)
    const standardSizes = [
      { width: 24, height: 36 },  // 2'x3'
      { width: 24, height: 48 },  // 2'x4'
      { width: 28, height: 54 },  // 2'4"x4'6"
      { width: 30, height: 36 },  // 2'6"x3'
      { width: 30, height: 48 },  // 2'6"x4'
      { width: 30, height: 60 },  // 2'6"x5'
      { width: 36, height: 36 },  // 3'x3'
      { width: 36, height: 48 },  // 3'x4'
      { width: 36, height: 60 },  // 3'x5'
      { width: 36, height: 72 },  // 3'x6'
      { width: 40, height: 48 },  // 3'4"x4'
      { width: 40, height: 60 },  // 3'4"x5'
      { width: 48, height: 48 },  // 4'x4'
      { width: 48, height: 60 },  // 4'x5'
      { width: 72, height: 48 },  // 6'x4'
      { width: 72, height: 60 }   // 6'x5'
    ];
    
    // Permitir una tolerancia de ±1 pulgada para variaciones mínimas
    const tolerance = 1;
    
    return standardSizes.some(size => 
      Math.abs(size.width - dimensions.width) <= tolerance && 
      Math.abs(size.height - dimensions.height) <= tolerance
    );
  }
  
  /**
   * Encuentra el mejor match de tamaño en un catálogo de productos
   */
  private findBestSizeMatch(catalog: any[], dimensions: any): any {
    if (!dimensions || !dimensions.width || !dimensions.height) {
      return catalog[0]; // Retornar el primero si no hay dimensiones
    }
    
    // Para productos personalizados, retornar el primero disponible
    const customProduct = catalog.find(item => item.isCustom);
    if (customProduct) {
      return { ...customProduct };
    }
    
    // Para tamaños estándar, buscar el más cercano
    let bestMatch = null;
    let minDiff = Number.MAX_VALUE;
    
    catalog.forEach(item => {
      if (item.dimensions && item.dimensions.width && item.dimensions.height) {
        const widthDiff = Math.abs(item.dimensions.width - dimensions.width);
        const heightDiff = Math.abs(item.dimensions.height - dimensions.height);
        const totalDiff = widthDiff + heightDiff;
        
        if (totalDiff < minDiff) {
          minDiff = totalDiff;
          bestMatch = item;
        }
      }
    });
    
    return bestMatch || catalog[0];
  }
  
  /**
   * Calcula un precio fallback para un item basado en sus características
   */
  private calculateFallbackPrice(category: string, item: any): number {
    if (category === 'window') {
      // Precio base por pie cuadrado según material
      const basePricePerSqFt = {
        vinyl: 20,
        wood: 35,
        fiberglass: 40,
        aluminum: 25,
        default: 30
      };
      
      // Obtener precio base por pie cuadrado
      const material = item.material || 'default';
      const pricePerSqFt = basePricePerSqFt[material] || basePricePerSqFt.default;
      
      // Calcular área en pies cuadrados
      const width = item.dimensions?.width || 30;
      const height = item.dimensions?.height || 48;
      const area = (width / 12) * (height / 12); // Convertir a pies cuadrados
      
      // Precio base por área
      let price = pricePerSqFt * area;
      
      // Factores adicionales
      const type = item.type || 'double_hung';
      if (type === 'casement') price *= 1.2; // Ventanas batientes son más caras
      if (type === 'bay' || type === 'bow') price *= 1.8; // Ventanas bahía son mucho más caras
      
      return Math.round(price * 100) / 100; // Redondear a 2 decimales
    }
    
    // Para otros tipos de productos...
    return 199.99; // Precio predeterminado
  }
  
  /**
   * Agrega días a una fecha
   */
  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}