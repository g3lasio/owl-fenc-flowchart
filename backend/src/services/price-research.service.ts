import axios from 'axios';
import * as cheerio from 'cheerio';
import { CacheService } from './cache.service';
import { OpenAIClient } from './openai.client';
import { RequiredMaterial, Location } from '../interfaces/fence.interfaces';

interface PriceResult {
  available: boolean;
  amount: number;
  source: string;
  confidence: number;
}

/**
 * Servicio para investigar precios de materiales en tiempo real
 * Utiliza técnicas de web scraping y/o APIs alternativas para obtener
 * información actualizada de precios cuando las APIs oficiales no están disponibles
 */
export class PriceResearchService {
  private cacheService: CacheService;
  private readonly RESEARCH_CACHE_PREFIX = 'price_research:';
  
  constructor(
    private readonly enableAI: boolean = true,
    private readonly cacheTTLSeconds: number = 86400, // 24 horas por defecto
    private readonly openAIClient?: OpenAIClient
  ) {
    this.cacheService = new CacheService();
  }
  
  /**
   * Obtiene el precio de un material utilizando varias fuentes de investigación
   * @param materialId ID del material
   * @param location Ubicación para la búsqueda de precios
   * @returns Resultado con el precio encontrado o valores predeterminados
   */
  async getPrice(materialId: string, location: { zipCode: string, state?: string, city?: string }): Promise<PriceResult> {
    // Verificar si tenemos un resultado en caché
    const cacheKey = `${this.RESEARCH_CACHE_PREFIX}${materialId}:${location.zipCode}`;
    const cachedResult = this.cacheService.get<PriceResult>(cacheKey);
    
    if (cachedResult) {
      return cachedResult;
    }
    
    // Resultado predeterminado en caso de que no podamos encontrar un precio
    const defaultResult: PriceResult = {
      available: false,
      amount: 0,
      source: 'default',
      confidence: 0
    };
    
    try {
      // 1. Intentar con búsqueda en sitios de mejoramiento del hogar
      const homeImprovementResult = await this.searchHomeImprovementSites(materialId, location);
      
      if (homeImprovementResult.available) {
        // Guardar en caché y devolver el resultado
        this.cacheService.set(cacheKey, homeImprovementResult, this.cacheTTLSeconds);
        return homeImprovementResult;
      }
      
      // 2. Intentar con agregadores de precios
      const aggregatorResult = await this.searchPriceAggregators(materialId, location);
      
      if (aggregatorResult.available) {
        // Guardar en caché y devolver el resultado
        this.cacheService.set(cacheKey, aggregatorResult, this.cacheTTLSeconds);
        return aggregatorResult;
      }
      
      // 3. Si está habilitada la IA, usar búsqueda inteligente
      if (this.enableAI && this.openAIClient) {
        const aiResult = await this.searchWithAI(materialId, location);
        
        if (aiResult.available) {
          // Guardar en caché y devolver el resultado
          this.cacheService.set(cacheKey, aiResult, this.cacheTTLSeconds);
          return aiResult;
        }
      }
      
      // Si no encontramos nada, devolver un estimado basado en promedios históricos
      const estimatedResult = await this.getEstimatedPrice(materialId);
      
      // Guardar en caché si tenemos un estimado
      if (estimatedResult.available) {
        this.cacheService.set(cacheKey, estimatedResult, this.cacheTTLSeconds);
      }
      
      return estimatedResult;
      
    } catch (error) {
      console.error('Error en la investigación de precios:', error);
      return defaultResult;
    }
  }
  
  /**
   * Busca precios en sitios de mejoramiento del hogar
   */
  private async searchHomeImprovementSites(materialId: string, location: { zipCode: string }): Promise<PriceResult> {
    try {
      // Convertir el ID del material a términos de búsqueda
      const searchTerm = this.materialIdToSearchTerm(materialId);
      
      // Lista de sitios a consultar
      const sites = [
        { name: 'Home Depot', url: `https://www.homedepot.com/s/${encodeURIComponent(searchTerm)}` },
        { name: 'Lowe\'s', url: `https://www.lowes.com/search?searchTerm=${encodeURIComponent(searchTerm)}` },
        { name: 'Menards', url: `https://www.menards.com/main/search.html?search=${encodeURIComponent(searchTerm)}` }
      ];
      
      for (const site of sites) {
        try {
          // Obtener la página HTML
          const response = await axios.get(site.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml',
              'Accept-Language': 'en-US,en;q=0.9'
            }
          });
          
          // Analizar el HTML con cheerio
          const $ = cheerio.load(response.data);
          
          // Estrategias de extracción específicas por sitio
          let price = 0;
          
          if (site.name === 'Home Depot') {
            // Selector específico para Home Depot
            const priceText = $('.price-format__main-price').first().text().trim();
            price = this.extractPriceFromString(priceText);
          } else if (site.name === 'Lowe\'s') {
            // Selector específico para Lowe's
            const priceText = $('.priceWrapper').first().text().trim();
            price = this.extractPriceFromString(priceText);
          } else if (site.name === 'Menards') {
            // Selector específico para Menards
            const priceText = $('.price').first().text().trim();
            price = this.extractPriceFromString(priceText);
          }
          
          // Si encontramos un precio válido
          if (price > 0) {
            return {
              available: true,
              amount: price,
              source: `research:${site.name}`,
              confidence: 0.85
            };
          }
        } catch (siteError) {
          console.warn(`Error al buscar en ${site.name}:`, siteError);
          // Continuar con el siguiente sitio
        }
      }
      
      // No se encontró precio en ningún sitio
      return {
        available: false,
        amount: 0,
        source: 'research:not_found',
        confidence: 0
      };
      
    } catch (error) {
      console.error('Error al buscar en sitios de mejoramiento del hogar:', error);
      return {
        available: false,
        amount: 0,
        source: 'research:error',
        confidence: 0
      };
    }
  }
  
  /**
   * Busca precios en agregadores de precios
   */
  private async searchPriceAggregators(materialId: string, location: { zipCode: string }): Promise<PriceResult> {
    // Convertir el ID del material a términos de búsqueda
    const searchTerm = this.materialIdToSearchTerm(materialId);
    
    // Simular búsqueda en agregadores de precios (implementar lógica real aquí)
    // Por ejemplo, obtener datos de APIs como BuildZoom, HomeBlue, etc.
    
    // Este es un placeholder para la implementación real
    return {
      available: false,
      amount: 0,
      source: 'aggregator:not_implemented',
      confidence: 0
    };
  }
  
  /**
   * Utiliza IA para buscar precios basados en datos históricos y patrones
   */
  private async searchWithAI(materialId: string, location: { zipCode: string }): Promise<PriceResult> {
    // Este sería el punto de integración con un servicio de IA
    // que podría analizar datos históricos, tendencias de mercado, etc.
    
    // Por ahora, este es un placeholder para la implementación futura
    return {
      available: false,
      amount: 0,
      source: 'ai:not_implemented',
      confidence: 0
    };
  }
  
  /**
   * Investiga precios actualizados para una lista de materiales en una ubicación específica
   */
  async researchPricesWithAI(
    materials: RequiredMaterial[],
    location: Location
  ): Promise<RequiredMaterial[]> {
    console.log(`Iniciando investigación de precios para ${materials.length} materiales en ${location.city}, ${location.state}`);
    
    // Agrupar materiales en lotes de máximo 10 para no sobrecargar el modelo
    const materialChunks = this.chunkArray(materials, 10);
    const pricedMaterials: RequiredMaterial[] = [];
    
    for (const chunk of materialChunks) {
      const pricePrompt = this.buildPriceResearchPrompt(chunk, location);
      
      try {
        const priceResponse = await this.openAIClient!.complete({
          prompt: pricePrompt,
          maxTokens: 2000
        });
        
        const chunkPrices = this.parsePriceResponse(priceResponse, chunk);
        pricedMaterials.push(...chunkPrices);
      } catch (error) {
        console.error('Error investigando precios para lote de materiales:', error);
        
        // Si falla, usar precios de respaldo
        const fallbackPrices = chunk.map(material => ({
          ...material,
          unitPrice: material.fallbackPrice || 0,
          priceSource: 'fallback'
        }));
        
        pricedMaterials.push(...fallbackPrices);
      }
    }
    
    return pricedMaterials;
  }
  
  /**
   * Construye un prompt detallado para investigación precisa de precios
   */
  private buildPriceResearchPrompt(materials: RequiredMaterial[], location: Location): string {
    const materialsList = materials.map((m, idx) => 
      `${idx + 1}. ${m.name} (${m.unit}): ${m.description || ''}${m.alternativeMaterials ? ' - Alternativas: ' + m.alternativeMaterials.join(', ') : ''}`
    ).join('\n');
    
    return `
      Como experto en la industria de construcción y materiales de construcción, necesito información precisa
      sobre precios actuales de los siguientes materiales en la zona de ${location.city}, ${location.state}, 
      código postal ${location.zipCode} a fecha de hoy:
      
      ${materialsList}
      
      Por favor, proporciona los precios unitarios para cada uno basándote en:
      - Precios de grandes almacenes (Home Depot, Lowe's, etc.)
      - Distribuidores especializados en la zona
      - Precios promedio para contratistas (con descuentos típicos)
      
      Para cada material, proporciona:
      - El precio unitario más preciso y actualizado
      - La fuente o tienda recomendada para comprarlo
      - Notas sobre disponibilidad, descuentos por volumen, o variaciones de precio
      
      Presenta tu investigación como un array JSON donde cada objeto tenga el id del material 
      y el precio unitario investigado. Asegúrate de investigar precios realistas y precisos
      según el mercado actual en esa ubicación específica.
      
      Ejemplo de formato de respuesta:
      [
        {"id": "id-del-material", "unitPrice": 24.99, "source": "Home Depot", "notes": "Disponible en tienda"},
        ...
      ]
    `;
  }
  
  /**
   * Parsea la respuesta del modelo de IA con los precios
   */
  private parsePriceResponse(response: string, originalMaterials: RequiredMaterial[]): RequiredMaterial[] {
    try {
      // Extraer el array JSON de la respuesta
      const jsonMatch = response.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (!jsonMatch) {
        throw new Error('No se encontró una estructura JSON válida en la respuesta de precios');
      }
      
      const pricesJson = jsonMatch[0];
      const pricesData = JSON.parse(pricesJson) as Array<{
        id: string;
        unitPrice: number;
        source?: string;
        notes?: string;
      }>;
      
      // Combinar los precios investigados con los materiales originales
      return originalMaterials.map(material => {
        const priceData = pricesData.find(p => p.id === material.id);
        
        if (priceData) {
          return {
            ...material,
            unitPrice: priceData.unitPrice,
            priceSource: priceData.source || 'IA research',
            priceNotes: priceData.notes
          };
        } else {
          // Si no se encontró precio, usar el precio de fallback
          return {
            ...material,
            unitPrice: material.fallbackPrice || 0,
            priceSource: 'fallback',
            priceNotes: 'Precio de respaldo usado por falta de información actualizada'
          };
        }
      });
    } catch (error) {
      console.error('Error al parsear respuesta de precios:', error);
      
      // En caso de error, devolver los materiales con precios de fallback
      return originalMaterials.map(material => ({
        ...material,
        unitPrice: material.fallbackPrice || 0,
        priceSource: 'fallback',
        priceNotes: 'Error al parsear respuesta de investigación de precios'
      }));
    }
  }
  
  /**
   * Divide un array en chunks de tamaño máximo especificado
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
  
  /**
   * Obtiene un precio estimado basado en promedios históricos
   */
  private async getEstimatedPrice(materialId: string): Promise<PriceResult> {
    // Aquí implementaríamos una tabla de precios estimados por defecto
    // basados en datos históricos o promedios de la industria
    
    // Ejemplo simplificado basado en IDs comunes de materiales
    const estimatedPrices: Record<string, number> = {
      // Materiales para cercas de madera
      'pressure-treated-post-4x4': 15.99,
      'pressure-treated-rail-2x4': 8.99,
      'treated-fence-picket': 3.99,
      
      // Materiales para cercas de vinilo
      'vinyl-post': 29.99,
      'vinyl-rail': 18.99,
      'vinyl-picket': 9.99,
      
      // Materiales para cercas de aluminio
      'aluminum-post': 45.99,
      'aluminum-rail': 22.99,
      'aluminum-picket': 11.99,
      
      // Herrajes y accesorios
      'gate-hardware-kit': 29.99,
      'concrete-mix': 5.99,
      'post-cap': 4.99
    };
    
    // Intentar obtener precio estimado directo
    if (materialId in estimatedPrices) {
      return {
        available: true,
        amount: estimatedPrices[materialId],
        source: 'estimate:direct',
        confidence: 0.7
      };
    }
    
    // Buscar coincidencia parcial
    const partialMatch = Object.keys(estimatedPrices).find(key => 
      materialId.includes(key) || key.includes(materialId)
    );
    
    if (partialMatch) {
      return {
        available: true,
        amount: estimatedPrices[partialMatch],
        source: 'estimate:partial_match',
        confidence: 0.6
      };
    }
    
    // Si no encontramos nada, devolver no disponible
    return {
      available: false,
      amount: 0,
      source: 'estimate:not_found',
      confidence: 0
    };
  }
  
  /**
   * Convierte un ID de material a términos de búsqueda para humanos
   */
  private materialIdToSearchTerm(materialId: string): string {
    // Convertir formato-con-guiones a palabras separadas por espacios
    let searchTerm = materialId.replace(/-/g, ' ');
    
    // Mapeo de términos específicos a términos más buscables
    const termMappings: Record<string, string> = {
      'pressure treated post': 'pressure treated fence post',
      'vinyl post': 'vinyl fence post',
      'aluminum post': 'aluminum fence post',
      'gate hardware': 'fence gate hardware kit'
    };
    
    // Aplicar mapeos
    Object.entries(termMappings).forEach(([key, value]) => {
      if (searchTerm.includes(key)) {
        searchTerm = searchTerm.replace(key, value);
      }
    });
    
    return searchTerm;
  }
  
  /**
   * Extrae un valor numérico de precio desde una cadena
   */
  private extractPriceFromString(priceStr: string): number {
    // Eliminar caracteres no numéricos excepto el punto decimal
    const matches = priceStr.match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
    
    if (matches && matches.length > 1) {
      return parseFloat(matches[1]);
    }
    
    return 0;
  }
}