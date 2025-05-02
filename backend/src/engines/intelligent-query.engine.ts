import { DeepSearchEngine } from './deepsearch.engine';
import { OpenAIClient } from '../services/openai.client';
import { AnthropicClient } from '../services/anthropic.client';
import { ProjectDetails, ProjectType } from '../interfaces/flow-manager.interfaces';
import { config } from '../config/config';

/**
 * Motor de Consulta Inteligente que se encarga de formular preguntas precisas
 * y detectar discrepancias o información faltante en los proyectos
 */
export class IntelligentQueryEngine {
  private readonly defaultModel = config.openai.defaultModel || 'gpt-4o';
  private readonly projectSpecificQuestions: Record<string, string[]> = {
    fencing: [
      '¿Hay alguna pendiente en el terreno que deba considerarse?',
      '¿Necesita retirar una cerca existente antes de la instalación?',
      '¿Hay líneas de servicios públicos subterráneas que deban marcarse?',
      '¿Hay alguna regulación de HOA o del municipio que deba considerarse?'
    ],
    decking: [
      '¿Hay una estructura existente que se deba retirar?',
      '¿Necesita integrar alguna característica como iluminación o jardineras?',
      '¿Requiere tratamiento especial para resistencia a la intemperie?',
      '¿Qué tipo de barandillas prefiere?'
    ],
    roofing: [
      '¿Cuántas capas de tejas existentes hay actualmente?',
      '¿Ha notado alguna filtración o daño en el techo actual?',
      '¿Necesita reemplazar los canalones o bajantes?',
      '¿Tiene respiraderos de techo, claraboyas o chimeneas?',
      '¿Qué tipo de estructura tiene el techo (inclinación, complejidad)?'
    ],
    concrete: [
      '¿Hay un área existente que se deba demoler?',
      '¿Qué tipo de acabado prefiere para la superficie?',
      '¿Necesita algún tipo de coloración o estampado?',
      '¿Requerirá drenaje especial?'
    ],
    painting: [
      '¿Qué condición tienen las superficies actualmente?',
      '¿Hay trabajo de preparación especial como reparación de paneles de yeso?',
      '¿Tiene preferencia por alguna marca específica de pintura?',
      '¿Cuántos colores diferentes se usarán?'
    ]
  };

  constructor(
    private readonly openAIClient: OpenAIClient,
    private readonly anthropicClient: AnthropicClient
  ) {}

  /**
   * Detecta discrepancias o información faltante en los detalles del proyecto
   */
  async detectDiscrepancies(
    projectType: string,
    projectDetails: ProjectDetails
  ): Promise<{ hasDiscrepancies: boolean, issues: string[], questions: string[] }> {
    const normalizedType = this.normalizeProjectType(projectType);
    
    // 1. Validar los campos esenciales para este tipo de proyecto
    const validationIssues = this.validateEssentialFields(normalizedType, projectDetails);
    
    // 2. Usar IA para detectar posibles inconsistencias lógicas
    const aiDetectedIssues = await this.detectLogicalInconsistencies(normalizedType, projectDetails);
    
    // 3. Combinar todos los problemas encontrados
    const allIssues = [...validationIssues, ...aiDetectedIssues];
    
    // 4. Generar preguntas específicas basadas en los problemas y tipo de proyecto
    const questions = await this.generateQuestions(normalizedType, projectDetails, allIssues);
    
    return {
      hasDiscrepancies: allIssues.length > 0,
      issues: allIssues,
      questions
    };
  }

  /**
   * Genera preguntas adicionales relevantes basadas en el tipo de proyecto
   * para obtener información más detallada y precisa
   */
  async generateAdditionalQuestions(
    projectType: string,
    projectDetails: ProjectDetails,
    conversationHistory?: string[]
  ): Promise<string[]> {
    const normalizedType = this.normalizeProjectType(projectType);
    
    // 1. Obtener preguntas predefinidas para este tipo de proyecto
    const predefinedQuestions = this.projectSpecificQuestions[normalizedType] || [];
    
    // 2. Filtrar preguntas que ya podrían estar respondidas según los detalles
    const filteredQuestions = this.filterAnsweredQuestions(predefinedQuestions, projectDetails);
    
    // 3. Generar preguntas adicionales específicas usando IA
    const aiGeneratedQuestions = await this.generateAIQuestions(
      normalizedType, 
      projectDetails, 
      conversationHistory
    );
    
    // 4. Combinar y priorizar preguntas
    return this.prioritizeQuestions([...filteredQuestions, ...aiGeneratedQuestions]);
  }

  /**
   * Normaliza el tipo de proyecto a una categoría conocida
   */
  private normalizeProjectType(projectType: string): string {
    // Normalizar el tipo de proyecto para hacer coincidencias con nuestras categorías conocidas
    const type = projectType.toLowerCase();
    
    if (type.includes('fence') || type.includes('cerc')) return 'fencing';
    if (type.includes('deck') || type.includes('terraz')) return 'decking';
    if (type.includes('roof') || type.includes('techo') || type.includes('tejado')) return 'roofing';
    if (type.includes('concr') || type.includes('cement') || type.includes('patio')) return 'concrete';
    if (type.includes('paint') || type.includes('pint')) return 'painting';
    
    // Si no reconocemos el tipo, devolvemos el original
    return type;
  }

  /**
   * Valida que los campos esenciales para un tipo de proyecto estén presentes
   */
  private validateEssentialFields(projectType: string, details: ProjectDetails): string[] {
    const issues: string[] = [];
    
    const dimensionsValidation = this.validateDimensions(projectType, details);
    if (dimensionsValidation) issues.push(dimensionsValidation);
    
    // Validaciones específicas según tipo de proyecto
    switch (projectType) {
      case 'fencing':
        if (!details.material && !details.subtype) {
          issues.push('No se ha especificado el tipo de material para la cerca');
        }
        if (!details.dimensions.height) {
          issues.push('No se ha especificado la altura de la cerca');
        }
        break;
        
      case 'roofing':
        if (!details.material && !details.subtype) {
          issues.push('No se ha especificado el tipo de material para el techo');
        }
        if (!details.dimensions.squareFeet) {
          issues.push('No se ha especificado el área del techo en pies cuadrados');
        }
        break;
        
      case 'decking':
        if (!details.material && !details.subtype) {
          issues.push('No se ha especificado el tipo de material para la terraza');
        }
        break;
        
      case 'concrete':
        if (!details.dimensions.thickness) {
          issues.push('No se ha especificado el espesor del concreto');
        }
        break;
    }
    
    return issues;
  }

  /**
   * Verifica que las dimensiones adecuadas estén presentes según tipo de proyecto
   */
  private validateDimensions(projectType: string, details: ProjectDetails): string | null {
    if (!details.dimensions) {
      return 'No se han proporcionado dimensiones para el proyecto';
    }
    
    switch (projectType) {
      case 'fencing':
        if (!details.dimensions.length) {
          return 'No se ha especificado la longitud de la cerca';
        }
        break;
        
      case 'roofing':
      case 'decking':
      case 'concrete':
      case 'painting':
        if (!details.dimensions.squareFeet && 
            !(details.dimensions.length && details.dimensions.width)) {
          return `No se ha especificado el área en pies cuadrados o las dimensiones para el proyecto de ${projectType}`;
        }
        break;
    }
    
    return null;
  }

  /**
   * Utiliza IA para detectar inconsistencias lógicas en los detalles del proyecto
   */
  private async detectLogicalInconsistencies(
    projectType: string,
    details: ProjectDetails
  ): Promise<string[]> {
    try {
      const prompt = `
      Analiza los siguientes detalles para un proyecto de ${projectType} y detecta cualquier inconsistencia lógica,
      información contradictoria o valores improbables/cuestionables:
      
      ${JSON.stringify(details, null, 2)}
      
      Por ejemplo, detecta:
      1. Dimensiones que parecen incorrectas (demasiado grandes o pequeñas para ser realistas)
      2. Combinaciones ilógicas de materiales o características
      3. Requisitos contradictorios
      4. Cualquier otra anomalía que debería verificarse antes de proceder
      
      Responde SOLO con un array de problemas específicos en formato JSON. Si no hay problemas, devuelve un array vacío.
      Ejemplo: ["La altura de 20 pies para una cerca residencial parece excesiva", "El material X no es compatible con acabado Y"]
      `;
      
      const response = await this.openAIClient.complete({
        prompt,
        model: this.defaultModel,
        maxTokens: 500,
        temperature: 0.2
      });
      
      // Extraer el array JSON de la respuesta
      try {
        const match = response.match(/\[.*\]/s);
        if (match) {
          return JSON.parse(match[0]);
        }
      } catch (e) {
        console.error('Error al parsear respuesta de inconsistencias:', e);
      }
      
      return [];
    } catch (error) {
      console.error('Error al detectar inconsistencias lógicas:', error);
      return [];
    }
  }

  /**
   * Genera preguntas basadas en issues encontrados y tipo de proyecto
   */
  private async generateQuestions(
    projectType: string,
    details: ProjectDetails,
    issues: string[]
  ): Promise<string[]> {
    if (issues.length === 0) return [];
    
    try {
      const prompt = `
      Para un proyecto de ${projectType}, se han detectado los siguientes problemas o información faltante:
      ${issues.map(issue => `- ${issue}`).join('\n')}
      
      Basado en estos problemas, genera preguntas específicas y claras que un profesional en estimados
      de construcción debería hacer para resolver estas inconsistencias o completar la información.
      
      Las preguntas deben:
      1. Ser directas y específicas
      2. Ser fáciles de entender para un cliente
      3. Obtener información precisa para resolver el problema mencionado
      4. No duplicar información que ya conocemos: ${JSON.stringify(details, null, 2)}
      
      Responde SOLO con un array de preguntas en formato JSON.
      Ejemplo: ["¿Cuál es la altura exacta que desea para su cerca?", "¿Prefiere un acabado liso o texturizado?"]
      `;
      
      const response = await this.openAIClient.complete({
        prompt,
        model: this.defaultModel,
        maxTokens: 500,
        temperature: 0.3
      });
      
      // Extraer el array JSON de la respuesta
      try {
        const match = response.match(/\[.*\]/s);
        if (match) {
          return JSON.parse(match[0]);
        }
      } catch (e) {
        console.error('Error al parsear respuesta de preguntas:', e);
      }
      
      return [];
    } catch (error) {
      console.error('Error al generar preguntas basadas en issues:', error);
      return [];
    }
  }

  /**
   * Filtra preguntas que ya podrían estar respondidas según los detalles
   */
  private filterAnsweredQuestions(questions: string[], details: ProjectDetails): string[] {
    // Muy simplificado - en la implementación real necesitaría un análisis más sofisticado
    return questions.filter(question => {
      // Lógica para determinar si la pregunta ya está respondida
      // Implementación básica que ejemplifica el concepto
      if (question.includes('existente') && details.demolition !== undefined) {
        return false; // Pregunta sobre demolición y ya tenemos esa información
      }
      if (question.includes('HOA') && details.notes && details.notes.toLowerCase().includes('hoa')) {
        return false; // Ya hay notas sobre HOA
      }
      return true;
    });
  }

  /**
   * Genera preguntas adicionales específicas usando IA
   */
  private async generateAIQuestions(
    projectType: string,
    details: ProjectDetails,
    conversationHistory?: string[]
  ): Promise<string[]> {
    try {
      let historyContext = '';
      if (conversationHistory && conversationHistory.length > 0) {
        historyContext = `
        Historial de conversación:
        ${conversationHistory.join('\n')}
        `;
      }
      
      const prompt = `
      Eres un experto en construcción especializado en proyectos de ${projectType}.
      Necesitas generar preguntas adicionales para obtener información más detallada sobre el siguiente proyecto:
      
      ${JSON.stringify(details, null, 2)}
      
      ${historyContext}
      
      Genera 3-5 preguntas específicas que:
      1. Obtengan información crítica que aún no tengamos para hacer un estimado más preciso
      2. Sean relevantes específicamente para este tipo de proyecto
      3. Ayuden a entender mejor las necesidades y expectativas del cliente
      4. No pregunten por información que ya tenemos
      5. Sean las preguntas que un contratista experto haría para entender completamente el proyecto
      
      Para un proyecto de ${projectType}, piensa en detalles como:
      - Particularidades del sitio que afecten la instalación
      - Preferencias específicas de acabados o estilos
      - Requisitos de cronograma o logística
      - Consideraciones de presupuesto o calidad
      
      Responde SOLO con un array de preguntas en formato JSON.
      Ejemplo: ["¿Cuál es su presupuesto aproximado para este proyecto?", "¿Para cuándo necesita que el proyecto esté completado?"]
      `;
      
      const response = await this.anthropicClient.complete({
        prompt,
        model: 'claude-instant-1',
        maxTokens: 500,
        temperature: 0.4
      });
      
      // Extraer el array JSON de la respuesta
      try {
        const match = response.match(/\[.*\]/s);
        if (match) {
          return JSON.parse(match[0]);
        }
      } catch (e) {
        console.error('Error al parsear respuesta de preguntas AI:', e);
      }
      
      return [];
    } catch (error) {
      console.error('Error al generar preguntas adicionales:', error);
      return [];
    }
  }

  /**
   * Prioriza y elimina duplicados de las preguntas
   */
  private prioritizeQuestions(questions: string[]): string[] {
    // Eliminar duplicados
    const uniqueQuestions = Array.from(new Set(questions));
    
    // Aquí se podría implementar lógica adicional para ordenar las preguntas
    // por relevancia o prioridad
    
    return uniqueQuestions;
  }
}