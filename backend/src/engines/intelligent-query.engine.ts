import { BaseEngine } from './base.engine';
import { AIService } from '../services/ai-service';
import { ApiUsageService } from '../services/api-usage.service';
import { ProjectDetails } from '../interfaces/flow-manager.interfaces';
import { PROJECT_TYPES, PROJECT_KEYWORDS } from '../constants/shared.constants';
import { config } from '../config/config';

/**
 * Motor de Consulta Inteligente refactorizado que se encarga de formular preguntas precisas
 * y detectar discrepancias o información faltante en los proyectos
 */
export class IntelligentQueryEngine extends BaseEngine {
  private readonly defaultModel = config.openai.completionModel || 'gpt-4o';
  
  private readonly projectSpecificQuestions: Record<string, string[]> = {
    [PROJECT_TYPES.FENCING]: [
      '¿Hay alguna pendiente en el terreno que deba considerarse?',
      '¿Necesita retirar una cerca existente antes de la instalación?',
      '¿Hay líneas de servicios públicos subterráneas que deban marcarse?',
      '¿Hay alguna regulación de HOA o del municipio que deba considerarse?'
    ],
    [PROJECT_TYPES.DECKING]: [
      '¿Hay una estructura existente que se deba retirar?',
      '¿Necesita integrar alguna característica como iluminación o jardineras?',
      '¿Requiere tratamiento especial para resistencia a la intemperie?',
      '¿Qué tipo de barandillas prefiere?'
    ],
    [PROJECT_TYPES.ROOFING]: [
      '¿Cuántas capas de tejas existentes hay actualmente?',
      '¿Ha notado alguna filtración o daño en el techo actual?',
      '¿Necesita reemplazar los canalones o bajantes?',
      '¿Tiene respiraderos de techo, claraboyas o chimeneas?',
      '¿Qué tipo de estructura tiene el techo (inclinación, complejidad)?'
    ],
    [PROJECT_TYPES.CONCRETE]: [
      '¿Hay un área existente que se deba demoler?',
      '¿Qué tipo de acabado prefiere para la superficie?',
      '¿Necesita algún tipo de coloración o estampado?',
      '¿Requerirá drenaje especial?'
    ],
    [PROJECT_TYPES.PAINTING]: [
      '¿Qué condición tienen las superficies actualmente?',
      '¿Hay trabajo de preparación especial como reparación de paneles de yeso?',
      '¿Tiene preferencia por alguna marca específica de pintura?',
      '¿Cuántos colores diferentes se usarán?'
    ]
  };

  // Información técnica específica por tipo de proyecto que el contratista debe conocer
  private readonly projectTechnicalInfo: Record<string, Record<string, string>> = {
    [PROJECT_TYPES.ROOFING]: {
      layers: "El número de capas existentes es crítico. Según muchos códigos de construcción, solo se permiten 2 capas máximo antes de necesitar una remoción completa.",
      pitch: "La inclinación del techo afecta directamente los materiales que se pueden usar y la dificultad de instalación. Techos planos o de baja inclinación requieren materiales especiales.",
      ventilation: "Una ventilación adecuada es esencial para prevenir daños por humedad en el ático y prolongar la vida útil del techo.",
      underlayment: "La membrana impermeabilizante bajo las tejas es crucial, especialmente en áreas propensas a lluvia o nieve.",
      decking_condition: "El estado del entablado/plywood que soporta las tejas puede requerir reemplazo si está dañado o podrido.",
      existing_material: "Diferentes materiales (asfalto, metal, teja) tienen diferentes consideraciones para remoción y reemplazo."
    },
    [PROJECT_TYPES.FENCING]: {
      soil_type: "El tipo de suelo afecta la profundidad y método de instalación de los postes.",
      wind_load: "Áreas con vientos fuertes requieren postes más profundos y posiblemente refuerzos adicionales.",
      frost_line: "En climas fríos, los postes deben instalarse por debajo de la línea de congelamiento para evitar movimientos por heladas.",
      property_lines: "La ubicación exacta de los límites de propiedad es crucial para evitar disputas con vecinos."
    },
    // ... otros tipos de proyectos se mantienen igual
  };

  // Secuencia lógica de preguntas según el tipo de proyecto para una recopilación estructurada
  private readonly questionSequence: Record<string, string[]> = {
    [PROJECT_TYPES.ROOFING]: [
      "type_of_project", // Tipo específico (reemplazo completo, reparación, nueva instalación)
      "existing_material", // Material del techo actual
      "desired_material", // Material deseado para el nuevo techo
      "roof_area", // Área aproximada en pies cuadrados
      "roof_pitch", // Inclinación del techo
      "existing_layers", // Número de capas existentes
      "roof_age", // Edad del techo actual
      "visible_damage", // Daños visibles (goteras, tejas faltantes)
      "penetrations", // Chimeneas, ventilaciones, claraboyas
      "special_requirements" // Requisitos especiales (certificación de resistencia a impactos, etc.)
    ],
    [PROJECT_TYPES.FENCING]: [
      "fence_purpose", // Propósito principal (privacidad, decorativo, seguridad)
      "fence_length", // Longitud total aproximada
      "fence_height", // Altura deseada
      "material_preference", // Material preferido
      "gate_requirements", // Número y ancho de puertas
      "existing_fence", // Si hay una cerca existente para remover
      "terrain_conditions", // Condiciones del terreno (inclinación, tipo de suelo)
      "special_requirements" // Requisitos especiales (cerradura, diseño personalizado)
    ]
  };

  constructor(
    aiService: AIService,
    apiUsageService: ApiUsageService
  ) {
    super(aiService, apiUsageService);
  }

  /**
   * Detecta discrepancias o información faltante en los detalles del proyecto
   */
  async detectDiscrepancies(
    projectType: string,
    projectDetails: ProjectDetails
  ): Promise<{ hasDiscrepancies: boolean, issues: string[], questions: string[] }> {
    try {
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
    } catch (error) {
      throw this.handleError(error, 'IntelligentQueryEngine', 'detectDiscrepancies');
    }
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
    try {
      const normalizedType = this.normalizeProjectType(projectType);
      
      // 1. Obtener preguntas predefinidas para este tipo de proyecto
      const predefinedQuestions = this.projectSpecificQuestions[normalizedType] || [];
      
      // 2. Filtrar preguntas que ya podrían estar respondidas según los detalles
      const filteredQuestions = this.filterAnsweredQuestions(predefinedQuestions, projectDetails);
      
      // 3. Identificar etapa actual en la secuencia de preguntas y generar las siguientes
      const sequenceQuestions = this.getNextQuestionsInSequence(normalizedType, projectDetails);
      
      // 4. Generar preguntas adicionales específicas usando IA, incluyendo conocimiento técnico
      const aiGeneratedQuestions = await this.generateAIQuestions(
        normalizedType, 
        projectDetails, 
        conversationHistory,
        true // Incluir conocimiento técnico
      );
      
      // 5. Combinar y priorizar preguntas (primero las de secuencia, luego AI, luego predefinidas)
      return this.prioritizeQuestions([...sequenceQuestions, ...aiGeneratedQuestions, ...filteredQuestions]);
    } catch (error) {
      throw this.handleError(error, 'IntelligentQueryEngine', 'generateAdditionalQuestions');
    }
  }

  /**
   * Genera preguntas basadas en la información técnica específica
   * que el contratista necesita recopilar para hacer un estimado preciso
   */
  async generateTechnicalQuestions(
    projectType: string,
    projectDetails: ProjectDetails
  ): Promise<{ questions: string[], technicalContext: any }> {
    try {
      const normalizedType = this.normalizeProjectType(projectType);
      
      // Obtener información técnica relevante para este tipo de proyecto
      const technicalInfo = this.projectTechnicalInfo[normalizedType] || {};
      
      if (Object.keys(technicalInfo).length === 0) {
        return {
          questions: [],
          technicalContext: {}
        };
      }
      
      // Determinar qué información técnica aún no se ha cubierto
      const missingTechnicalInfo = this.identifyMissingTechnicalInfo(normalizedType, projectDetails);
      
      // Generar preguntas específicas basadas en la información técnica faltante
      const technicalQuestions = await this.formulateTechnicalQuestions(
        normalizedType,
        projectDetails,
        missingTechnicalInfo
      );
      
      return {
        questions: technicalQuestions,
        technicalContext: missingTechnicalInfo
      };
    } catch (error) {
      throw this.handleError(error, 'IntelligentQueryEngine', 'generateTechnicalQuestions');
    }
  }

  /**
   * Normaliza el tipo de proyecto a una categoría conocida usando constantes compartidas
   */
  private normalizeProjectType(projectType: string): string {
    const type = projectType.toLowerCase();
    
    // Usar las palabras clave definidas en las constantes compartidas
    for (const [projectTypeKey, keywords] of Object.entries(PROJECT_KEYWORDS)) {
      if (keywords.some(keyword => type.includes(keyword))) {
        return projectTypeKey;
      }
    }
    
    // Si no reconocemos el tipo, devolvemos el original
    return type;
  }

  // ... el resto de los métodos privados se mantienen igual, pero utilizando las constantes compartidas
}