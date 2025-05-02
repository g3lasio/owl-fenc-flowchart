import { AnthropicClient } from './anthropic.client';
import { ConstructionMethodCacheService } from './construction-method-cache.service';
import { Location } from '../interfaces/fence.interfaces';

/**
 * Servicio para determinar y recomendar métodos óptimos de construcción
 * basados en el tipo de proyecto, ubicación, y especificaciones
 */
export class ConstructionMethodService {
  constructor(
    private readonly anthropicClient: AnthropicClient,
    private readonly constructionMethodCache: ConstructionMethodCacheService
  ) {}
  
  /**
   * Determina el método óptimo de construcción para un proyecto específico
   */
  async getOptimalMethod(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    location: Location
  ): Promise<{
    description: string;
    steps: string[];
    warnings: string[];
    requiredSkillLevel: number;
    estimatedTime: number; // horas
    specialConsiderations: string[];
  }> {
    // Verificar en caché primero
    const cacheKey = `${projectType}-${projectSubtype}-${location.state}`;
    const cachedMethod = this.constructionMethodCache.get(cacheKey);
    
    if (cachedMethod) {
      return this.adaptMethodToSpecificProject(cachedMethod, dimensions, options);
    }
    
    try {
      // Crear un prompt detallado para Claude
      const methodPrompt = this.buildConstructionMethodPrompt(
        projectType, 
        projectSubtype, 
        dimensions, 
        options, 
        location
      );
      
      // Obtener recomendación detallada de Claude
      const methodResponse = await this.anthropicClient.complete({
        prompt: methodPrompt,
        maxTokens: 3000
      });
      
      // Parsear la respuesta para obtener el método de construcción
      const constructionMethod = this.parseConstructionMethodResponse(methodResponse);
      
      // Guardar en caché
      this.constructionMethodCache.set(cacheKey, constructionMethod);
      
      return constructionMethod;
      
    } catch (error) {
      console.error('Error al determinar método de construcción:', error);
      
      // Retornar método genérico en caso de error
      return this.getFallbackConstructionMethod(projectType, projectSubtype);
    }
  }
  
  /**
   * Construye un prompt detallado para determinar el método de construcción
   */
  private buildConstructionMethodPrompt(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    location: Location
  ): string {
    return `
      Como maestro constructor con 30 años de experiencia en ${projectType},
      necesito determinar el método óptimo de construcción para un proyecto de ${projectType}
      (${projectSubtype}) en ${location.city}, ${location.state}.
      
      CARACTERÍSTICAS DEL PROYECTO:
      Dimensiones: ${JSON.stringify(dimensions, null, 2)}
      Especificaciones y opciones: ${JSON.stringify(options, null, 2)}
      
      CONSIDERACIONES LOCALES:
      - Clima y condiciones ambientales típicas de ${location.city}, ${location.state}
      - Códigos de construcción y regulaciones locales
      - Condiciones del suelo comunes en la región
      
      Proporciona una descripción detallada del método de construcción óptimo incluyendo:
      1. Descripción general del enfoque recomendado
      2. Lista ordenada de pasos de construcción
      3. Advertencias y consideraciones especiales
      4. Nivel de habilidad requerido (1-5, donde 5 es experto)
      5. Tiempo estimado para completar (en horas)
      6. Consideraciones especiales basadas en la ubicación
      
      Formatea tu respuesta como un objeto JSON con las propiedades:
      {
        "description": "Descripción general del método",
        "steps": ["Paso 1", "Paso 2", ...],
        "warnings": ["Advertencia 1", "Advertencia 2", ...],
        "requiredSkillLevel": 3,
        "estimatedTime": 24,
        "specialConsiderations": ["Consideración 1", "Consideración 2", ...]
      }
    `;
  }
  
  /**
   * Parsea la respuesta para extraer el método de construcción recomendado
   */
  private parseConstructionMethodResponse(response: string): any {
    try {
      // Buscar estructura JSON en la respuesta
      const jsonMatch = response.match(/\{\s*"[^"]+"\s*:[\s\S]*?\}/);
      
      if (jsonMatch) {
        const methodJson = jsonMatch[0];
        return JSON.parse(methodJson);
      }
      
      // Si no hay JSON, intentar extraer información clave
      const description = this.extractResponsePart(response, ['descripción', 'description', 'enfoque', 'método']);
      const steps = this.extractListItems(response, ['pasos', 'steps', 'procedimiento']);
      const warnings = this.extractListItems(response, ['advertencias', 'warnings', 'precauciones']);
      
      // Buscar nivel de habilidad (1-5)
      const skillLevelMatch = response.match(/[Nn]ivel\s+de\s+habilidad\s*:?\s*(\d)/);
      const skillLevel = skillLevelMatch ? parseInt(skillLevelMatch[1]) : 3;
      
      // Buscar tiempo estimado
      const timeMatch = response.match(/[Tt]iempo\s+estimado\s*:?\s*(\d+)(?:\s*-\s*\d+)?\s*horas/);
      const estimatedTime = timeMatch ? parseInt(timeMatch[1]) : 24;
      
      // Consideraciones especiales
      const specialConsiderations = this.extractListItems(response, ['consideraciones', 'considerations']);
      
      return {
        description: description || 'Método estándar de construcción',
        steps: steps.length > 0 ? steps : ['Preparar el sitio', 'Instalar materiales', 'Acabado y limpieza'],
        warnings: warnings.length > 0 ? warnings : ['Verificar regulaciones locales'],
        requiredSkillLevel: skillLevel,
        estimatedTime: estimatedTime,
        specialConsiderations: specialConsiderations.length > 0 ? specialConsiderations : []
      };
      
    } catch (error) {
      console.error('Error al parsear método de construcción:', error);
      
      // Retornar estructura básica en caso de error
      return {
        description: 'Método estándar de construcción',
        steps: ['Preparar el sitio', 'Instalar materiales', 'Acabado y limpieza'],
        warnings: ['Verificar regulaciones locales'],
        requiredSkillLevel: 3,
        estimatedTime: 24,
        specialConsiderations: []
      };
    }
  }
  
  /**
   * Extrae una parte específica de la respuesta basada en palabras clave
   */
  private extractResponsePart(response: string, keywords: string[]): string {
    const paragraphs = response.split('\n\n');
    
    for (const paragraph of paragraphs) {
      for (const keyword of keywords) {
        if (paragraph.toLowerCase().includes(keyword.toLowerCase())) {
          return paragraph.trim();
        }
      }
    }
    
    return '';
  }
  
  /**
   * Extrae elementos de lista de la respuesta basados en secciones con palabras clave
   */
  private extractListItems(response: string, sectionKeywords: string[]): string[] {
    const items: string[] = [];
    
    // Buscar secciones que contengan las palabras clave
    for (const keyword of sectionKeywords) {
      const pattern = new RegExp(`(?:${keyword}[^\\n]*:\\s*|${keyword}[^\\n]*\\n\\s*)((?:\\d+\\.\\s*[^\\n]+\\n)+)`, 'i');
      const match = response.match(pattern);
      
      if (match && match[1]) {
        // Extraer elementos de lista numerada
        const listText = match[1];
        const listItems = listText.match(/\d+\.\s*([^\n]+)/g);
        
        if (listItems) {
          items.push(...listItems.map(item => item.replace(/^\d+\.\s*/, '').trim()));
          break;
        }
      }
    }
    
    return items;
  }
  
  /**
   * Adapta un método de construcción general a un proyecto específico
   */
  private adaptMethodToSpecificProject(
    method: any,
    dimensions: any,
    options: any
  ): any {
    // Esta función podría ajustar tiempos estimados, pasos específicos, etc.
    // basados en las dimensiones y opciones particulares del proyecto
    
    const adaptedMethod = { ...method };
    
    // Ajustar tiempo estimado basado en dimensiones
    if (dimensions.area || dimensions.squareFeet) {
      const area = dimensions.area || dimensions.squareFeet;
      const sizeMultiplier = this.calculateSizeMultiplier(area);
      adaptedMethod.estimatedTime = Math.ceil(method.estimatedTime * sizeMultiplier);
    }
    
    // Ajustar nivel de habilidad requerido basado en opciones
    if (options.complexity === 'high' || options.customFeatures) {
      adaptedMethod.requiredSkillLevel = Math.min(5, method.requiredSkillLevel + 1);
    }
    
    return adaptedMethod;
  }
  
  /**
   * Calcula un multiplicador basado en el tamaño del proyecto
   */
  private calculateSizeMultiplier(area: number): number {
    if (area < 100) return 0.7;  // Proyecto pequeño
    if (area < 500) return 1.0;  // Proyecto mediano (base)
    if (area < 1000) return 1.3; // Proyecto grande
    return 1.5;                  // Proyecto muy grande
  }
  
  /**
   * Proporciona un método de construcción genérico como fallback
   */
  private getFallbackConstructionMethod(projectType: string, projectSubtype: string): any {
    // Métodos genéricos por tipo de proyecto
    const methodsByType: Record<string, any> = {
      'fencing': {
        description: 'Método estándar de instalación de cerca',
        steps: [
          'Marcar la ubicación de los postes',
          'Cavar hoyos para postes',
          'Fijar postes con concreto',
          'Instalar rieles horizontales',
          'Fijar paneles o tablas a los rieles',
          'Instalar puertas y herrajes'
        ],
        warnings: [
          'Verificar líneas de servicios subterráneos antes de cavar',
          'Respetar límites de propiedad',
          'Verificar regulaciones locales sobre altura de cercas'
        ],
        requiredSkillLevel: 2,
        estimatedTime: 16,
        specialConsiderations: [
          'Asegurar que los postes estén perfectamente verticales',
          'Permitir que el concreto se cure completamente antes de instalar paneles'
        ]
      },
      'decking': {
        description: 'Método estándar de construcción de terraza',
        steps: [
          'Preparar el terreno y establecer el nivel',
          'Instalar vigas de soporte y postes',
          'Colocar vigas de piso',
          'Instalar tablas de la plataforma',
          'Construir escalones si son necesarios',
          'Instalar barandas y acabados'
        ],
        warnings: [
          'Asegurar drenaje adecuado debajo de la plataforma',
          'Usar herrajes resistentes a la corrosión',
          'Verificar códigos de construcción locales para terrazas'
        ],
        requiredSkillLevel: 3,
        estimatedTime: 32,
        specialConsiderations: [
          'Dejar espacio entre tablas para expansión',
          'Asegurar que la estructura soporte el peso esperado'
        ]
      },
      'concrete': {
        description: 'Método estándar para trabajo de concreto',
        steps: [
          'Preparar y nivelar el área',
          'Construir formas y barreras',
          'Colocar malla de refuerzo o barras según necesidad',
          'Mezclar y verter el concreto',
          'Nivelar y dar acabado a la superficie',
          'Curar adecuadamente'
        ],
        warnings: [
          'Monitorear condiciones climáticas antes de verter',
          'Asegurar mezcla adecuada de concreto',
          'Permitir tiempo completo de curado'
        ],
        requiredSkillLevel: 3,
        estimatedTime: 24,
        specialConsiderations: [
          'Incluir juntas de expansión según sea necesario',
          'Asegurar pendiente adecuada para drenaje'
        ]
      }
    };
    
    // Buscar por tipo exacto
    if (methodsByType[projectType]) {
      return methodsByType[projectType];
    }
    
    // Buscar coincidencia parcial
    const matchedKey = Object.keys(methodsByType).find(key => 
      projectType.includes(key) || key.includes(projectType)
    );
    
    if (matchedKey) {
      return methodsByType[matchedKey];
    }
    
    // Método genérico predeterminado
    return {
      description: `Método estándar de construcción para ${projectType}`,
      steps: ['Preparación', 'Instalación de componentes básicos', 'Acabado y limpieza'],
      warnings: ['Verificar regulaciones locales', 'Seguir instrucciones del fabricante'],
      requiredSkillLevel: 3,
      estimatedTime: 24,
      specialConsiderations: []
    };
  }
}