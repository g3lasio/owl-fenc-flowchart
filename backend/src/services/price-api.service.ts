import axios, { AxiosInstance } from 'axios';
import { PriceAPIClient, PriceResult } from '../interfaces/calculators.interfaces';
import { Location } from '../interfaces/fence.interfaces';

/**
 * Cliente API genérico para obtener precios de materiales
 */
export abstract class BasePriceAPIClient implements PriceAPIClient {
  protected client: AxiosInstance;
  protected readonly source: string;
  
  constructor(baseURL: string, apiKey: string, source: string) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    this.source = source;
  }

  /**
   * Método abstracto que debe ser implementado por los clientes específicos
   */
  abstract getPrice(materialId: string, location: Location): Promise<PriceResult>;
  
  /**
   * Método compartido para manejar errores
   */
  protected handleError(error: any, materialId: string): PriceResult {
    console.error(`Error al obtener precio para ${materialId} desde ${this.source}:`, error);
    return {
      amount: 0,
      available: false,
      source: this.source
    };
  }
}

/**
 * Cliente API para Home Depot
 */
export class HomeDepotAPIClient extends BasePriceAPIClient {
  constructor(apiKey: string) {
    super('https://api.homedepot.com/v1', apiKey, 'Home Depot');
  }
  
  async getPrice(materialId: string, location: Location): Promise<PriceResult> {
    try {
      // Esta implementación se debe adaptar a la API real de Home Depot
      const response = await this.client.get('/products/prices', {
        params: {
          sku: materialId,
          zipCode: location.zipCode
        }
      });
      
      if (response.data && response.data.price) {
        return {
          amount: response.data.price,
          available: true,
          source: this.source
        };
      }
      
      return {
        amount: 0,
        available: false,
        source: this.source
      };
    } catch (error) {
      return this.handleError(error, materialId);
    }
  }
}

/**
 * Cliente API para Lowes
 */
export class LowesAPIClient extends BasePriceAPIClient {
  constructor(apiKey: string) {
    super('https://api.lowes.com/v1', apiKey, 'Lowes');
  }
  
  async getPrice(materialId: string, location: Location): Promise<PriceResult> {
    try {
      // Esta implementación se debe adaptar a la API real de Lowes
      const response = await this.client.get('/products/price', {
        params: {
          productId: materialId,
          storeNumber: location.zipCode // Simplificado para el ejemplo
        }
      });
      
      if (response.data && response.data.regularPrice) {
        return {
          amount: response.data.regularPrice,
          available: true,
          source: this.source
        };
      }
      
      return {
        amount: 0,
        available: false,
        source: this.source
      };
    } catch (error) {
      return this.handleError(error, materialId);
    }
  }
}

/**
 * Cliente API para simulación de precios (para desarrollo)
 */
export class MockPriceAPIClient implements PriceAPIClient {
  private readonly source = 'Mock API';
  private priceData: Map<string, number> = new Map();
  
  constructor() {
    // Inicializar algunos precios de prueba
    this.priceData.set('wood-post', 15.99);
    this.priceData.set('rail-2x4', 7.99);
    this.priceData.set('picket', 3.99);
    this.priceData.set('concrete', 5.99);
    this.priceData.set('vinyl-post', 35.99);
    this.priceData.set('vinyl-panel', 120.99);
    this.priceData.set('terminal-post', 25.99);
    this.priceData.set('fabric', 4.99);
    // Agregar más precios según sea necesario
  }
  
  async getPrice(materialId: string, location: Location): Promise<PriceResult> {
    // Simular un tiempo de respuesta de la API
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const price = this.priceData.get(materialId);
    
    if (price) {
      return {
        amount: price,
        available: true,
        source: this.source
      };
    }
    
    return {
      amount: 0,
      available: false,
      source: this.source
    };
  }
}