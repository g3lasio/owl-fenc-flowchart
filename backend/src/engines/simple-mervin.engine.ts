import { OpenAIClient } from '../services/openai.client';
import { AnthropicClient } from '../services/anthropic.client';

/**
 * Versión simplificada del motor Mervin para generar estimados
 * Esta implementación reducida permite la interacción básica y la demostración
 * de la interfaz de chat sin depender de todos los componentes más complejos
 */
export class SimpleMervinEngine {
  private sessions: Map<string, {
    sessionId: string;
    messages: Array<{ role: string; content: string; timestamp: Date }>;
    projectDetails: any;
    estimateGenerated: boolean;
    askedQuestions: Set<string>; // Registro de preguntas ya realizadas
    lastContextSummary: string; // Resumen del contexto de la última interacción
    conversationState: string; // Estado actual de la conversación
    questionHistory: Array<{ question: string, answered: boolean, timestamp: Date }>; // Historial de preguntas
  }> = new Map();

  constructor(
    private readonly openAIClient?: OpenAIClient,
    private readonly anthropicClient?: AnthropicClient
  ) {
    console.log('🤖 Inicializando SimpleMervinEngine - Motor de conversación inteligente');
  }

  /**
   * Inicia una nueva sesión para la generación de estimados
   */
  async startEstimateProcess(): Promise<{ sessionId: string }> {
    const sessionId = this.generateSessionId();
    
    this.sessions.set(sessionId, {
      sessionId,
      messages: [],
      projectDetails: {},
      estimateGenerated: false,
      askedQuestions: new Set<string>(),
      lastContextSummary: '',
      conversationState: 'initial_greeting',
      questionHistory: []
    });
    
    console.log(`📝 [${sessionId}] Nueva sesión de chat iniciada`);
    
    return { sessionId };
  }

  /**
   * Procesa un mensaje del usuario y genera una respuesta contextual
   * con mejor comprensión y evitando preguntas repetitivas
   */
  async processChatMessage(
    sessionId: string,
    message: string
  ): Promise<{
    response: string;
    intelligentQuestions?: string[];
    projectDetails?: any;
    isActionRequired?: boolean;
    action?: string;
  }> {
    // Verifica que la sesión exista
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`❌ [${sessionId}] Error: Sesión no encontrada`);
      throw new Error(`Sesión no encontrada: ${sessionId}`);
    }
    
    console.log(`📨 [${sessionId}] Mensaje recibido: "${message}"`);
    console.log(`🔄 [${sessionId}] Estado actual: ${session.conversationState}`);
    
    // Guarda el mensaje del usuario
    session.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });
    
    // Generar resumen del contexto actual
    const contextSummary = this.generateContextSummary(session.messages, session.projectDetails);
    session.lastContextSummary = contextSummary;
    console.log(`📊 [${sessionId}] Resumen de contexto: ${contextSummary}`);
    
    // Análisis avanzado del mensaje con contexto
    console.log(`🔍 [${sessionId}] Analizando mensaje para extraer información...`);
    const extractedInfo = this.extractInfoWithContext(message, session.projectDetails, session.messages);
    
    if (Object.keys(extractedInfo).length > 0) {
      console.log(`✅ [${sessionId}] Información extraída:`, JSON.stringify(extractedInfo));
    } else {
      console.log(`ℹ️ [${sessionId}] No se extrajo nueva información del mensaje`);
    }
    
    // Actualiza los detalles del proyecto con la información extraída
    if (extractedInfo && Object.keys(extractedInfo).length > 0) {
      console.log(`📝 [${sessionId}] Actualizando detalles del proyecto con nueva información`);
      
      // Actualizar sólo los campos que realmente cambiaron
      Object.entries(extractedInfo).forEach(([key, value]) => {
        if (key === 'dimensions' && value && typeof value === 'object') {
          // Antes de actualizar, registra los cambios
          const prevDimensions = session.projectDetails.dimensions || {};
          const newDimensions = {...prevDimensions, ...value};
          
          if (JSON.stringify(prevDimensions) !== JSON.stringify(newDimensions)) {
            console.log(`📏 [${sessionId}] Dimensiones actualizadas:`, 
              `Antes=${JSON.stringify(prevDimensions)}, Después=${JSON.stringify(newDimensions)}`);
          }
          
          session.projectDetails.dimensions = newDimensions;
        } else if (key === 'location' && value && typeof value === 'object') {
          const prevLocation = session.projectDetails.location || {};
          const newLocation = {...prevLocation, ...value};
          
          if (JSON.stringify(prevLocation) !== JSON.stringify(newLocation)) {
            console.log(`📍 [${sessionId}] Ubicación actualizada:`, 
              `Antes=${JSON.stringify(prevLocation)}, Después=${JSON.stringify(newLocation)}`);
          }
          
          session.projectDetails.location = newLocation;
        } else if (value !== undefined && value !== null) {
          const prevValue = session.projectDetails[key];
          
          if (prevValue !== value) {
            console.log(`🔄 [${sessionId}] Campo "${key}" actualizado: ${prevValue} → ${value}`);
          }
          
          session.projectDetails[key] = value;
        }
      });
      
      // Transición de estado si se detectó un tipo de proyecto
      if (extractedInfo.type && session.conversationState === 'initial_greeting') {
        session.conversationState = 'collecting_project_details';
        console.log(`🔄 [${sessionId}] Transición de estado: initial_greeting → collecting_project_details`);
      }
      
      // Transición si tenemos suficiente información y estamos recolectando detalles
      if (this.canGenerateEstimate(session.projectDetails) && 
          session.conversationState === 'collecting_project_details') {
        session.conversationState = 'ready_for_estimate';
        console.log(`🔄 [${sessionId}] Transición de estado: collecting_project_details → ready_for_estimate`);
      }
    }
    
    // Obtener información ya conocida y preguntas ya realizadas
    const knownInfo = this.getKnownProjectInfo(session.projectDetails);
    console.log(`📋 [${sessionId}] Información conocida del proyecto:`, knownInfo);
    
    // Determina si hay suficiente información para generar un estimado
    const canGenerateEstimate = this.canGenerateEstimate(session.projectDetails);
    const shouldGenerateEstimate = canGenerateEstimate && !session.estimateGenerated;
    
    console.log(`🧮 [${sessionId}] ¿Puede generar estimado? ${canGenerateEstimate ? 'Sí' : 'No'}`);
    console.log(`🧮 [${sessionId}] ¿Debe generar estimado ahora? ${shouldGenerateEstimate ? 'Sí' : 'No'}`);
    
    // Genera preguntas inteligentes filtradas (sin repetir las ya hechas)
    const allQuestions = this.generateIntelligentQuestions(session.projectDetails);
    console.log(`❓ [${sessionId}] Todas las posibles preguntas generadas (${allQuestions.length}):`, allQuestions);
    
    const filteredQuestions = allQuestions.filter(q => !this.isQuestionAlreadyAsked(q, session.askedQuestions));
    console.log(`❓ [${sessionId}] Preguntas filtradas sin repeticiones (${filteredQuestions.length}):`, filteredQuestions);
    
    // Registra las nuevas preguntas generadas
    filteredQuestions.forEach(q => {
      session.askedQuestions.add(q.toLowerCase().trim());
      session.questionHistory.push({
        question: q,
        answered: false,
        timestamp: new Date()
      });
    });
    
    // Actualiza el estado de las preguntas anteriores para marcar cuáles fueron respondidas
    this.updateAnsweredQuestions(message, session);
    
    // Genera una respuesta basada en el mensaje y la información del proyecto
    let response = '';
    let isActionRequired = false;
    let action = '';
    
    if (shouldGenerateEstimate) {
      console.log(`💰 [${sessionId}] Generando estimado con la información disponible`);
      response = this.generateEstimateResponse(session.projectDetails);
      session.estimateGenerated = true;
      isActionRequired = true;
      action = 'review_estimate';
      session.conversationState = 'estimate_generated';
      console.log(`🔄 [${sessionId}] Transición de estado: ready_for_estimate → estimate_generated`);
    } else if (message.toLowerCase().includes('estimado') || message.toLowerCase().includes('costo')) {
      console.log(`💬 [${sessionId}] Usuario pregunta por estimado pero faltan datos`);
      response = this.generateNeedMoreInfoResponse(session.projectDetails, knownInfo);
    } else {
      console.log(`💬 [${sessionId}] Generando respuesta contextual`);
      response = this.generateEnhancedContextualResponse(message, session.projectDetails, session.messages, knownInfo);
    }
    
    console.log(`📤 [${sessionId}] Respuesta generada: "${response.substring(0, 100)}${response.length > 100 ? '...' : ''}"`);
    
    // Guarda la respuesta en la sesión
    session.messages.push({
      role: 'assistant',
      content: response,
      timestamp: new Date()
    });
    
    // Log del estado final después de procesar el mensaje
    console.log(`📊 [${sessionId}] Estado final: ${session.conversationState}`);
    console.log(`📊 [${sessionId}] Número de mensajes en la conversación: ${session.messages.length}`);
    
    return {
      response,
      intelligentQuestions: filteredQuestions.length > 0 ? filteredQuestions : undefined,
      projectDetails: session.projectDetails,
      isActionRequired,
      action
    };
  }

  /**
   * Actualiza el estado de las preguntas previas para saber cuáles fueron respondidas
   */
  private updateAnsweredQuestions(message: string, session: any): void {
    const lowerMessage = message.toLowerCase();
    const unansweredQuestions = session.questionHistory.filter(q => !q.answered);
    
    if (unansweredQuestions.length === 0) return;
    
    // Lista de palabras clave para diferentes tipos de información
    const keywordMap = {
      'type': ['cerca', 'terraza', 'techo', 'concreto', 'fence', 'deck', 'roof'],
      'material': ['madera', 'vinilo', 'cadena', 'aluminio', 'wood', 'vinyl', 'chain', 'composite', 'compuesto'],
      'dimensions': ['pies', 'metros', 'feet', 'ft', 'largo', 'alto', 'altura', 'longitud', 'área', 'area', 'cuadrados'],
      'location': ['ciudad', 'estado', 'ubicación', 'city', 'state', 'location']
    };
    
    for (const q of unansweredQuestions) {
      // Detectar qué categoría de pregunta es
      let category = '';
      for (const [cat, keywords] of Object.entries(keywordMap)) {
        if (keywords.some(kw => q.question.toLowerCase().includes(kw))) {
          category = cat;
          break;
        }
      }
      
      // Si tenemos una categoría, verificar si la respuesta contiene palabras relacionadas
      if (category && keywordMap[category].some(kw => lowerMessage.includes(kw))) {
        q.answered = true;
        console.log(`✓ [${session.sessionId}] Pregunta respondida: "${q.question}"`);
      }
      
      // También verificar si la respuesta contiene un número (para dimensiones)
      if (category === 'dimensions' && /\d+/.test(lowerMessage)) {
        q.answered = true;
        console.log(`✓ [${session.sessionId}] Pregunta sobre dimensiones respondida: "${q.question}"`);
      }
    }
  }

  /**
   * Obtiene los detalles del proyecto para una sesión
   */
  getProjectDetailsFromContext(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`❌ [${sessionId}] Error: Sesión no encontrada al intentar obtener detalles del proyecto`);
      return null;
    }
    
    console.log(`📋 [${sessionId}] Obteniendo detalles del proyecto desde contexto`);
    return session.projectDetails;
  }

  /**
   * Obtiene un estimado preliminar si hay suficiente información
   */
  async getPreliminaryEstimate(sessionId: string): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`❌ [${sessionId}] Error: Sesión no encontrada al intentar generar estimado`);
      return null;
    }
    
    if (!this.canGenerateEstimate(session.projectDetails)) {
      console.log(`⚠️ [${sessionId}] No hay suficiente información para generar un estimado`);
      return null;
    }
    
    // Genera un estimado simplificado basado en los detalles del proyecto
    console.log(`💰 [${sessionId}] Generando estimado detallado`);
    const projectDetails = session.projectDetails;
    const estimateDetails = this.generateSimpleEstimate(projectDetails);
    
    console.log(`💰 [${sessionId}] Estimado generado: Total=$${estimateDetails.totalCost}`);
    return estimateDetails;
  }

  // Métodos privados de utilidad mejorados
  
  private generateSessionId(): string {
    return 'session_' + Math.random().toString(36).substring(2, 15);
  }
  
  /**
   * Genera un resumen del contexto actual basado en mensajes previos y detalles del proyecto
   */
  private generateContextSummary(messages: Array<{ role: string; content: string; timestamp: Date }>, projectDetails: any): string {
    const lastUserMessages = messages
      .filter(m => m.role === 'user')
      .slice(-3)
      .map(m => m.content);
      
    const projectType = projectDetails.type ? 
      `Proyecto de ${this.getProjectTypeName(projectDetails.type)}` : 
      'Proyecto no especificado';
      
    const dimensions = projectDetails.dimensions ? 
      Object.entries(projectDetails.dimensions).map(([key, value]) => `${this.formatDimensionKey(key)}: ${value}`).join(', ') : 
      'Dimensiones no especificadas';
      
    const material = projectDetails.material ? 
      `Material: ${this.getMaterialName(projectDetails.material)}` : 
      'Material no especificado';
      
    return `${projectType}. ${dimensions}. ${material}. Últimos mensajes: ${lastUserMessages.join(' | ')}`;
  }
  
  /**
   * Extrae información del mensaje del usuario con mayor conciencia del contexto
   */
  private extractInfoWithContext(message: string, existingDetails: any, messages: Array<{ role: string; content: string; timestamp: Date }>): any {
    const info: any = {};
    const lowerMessage = message.toLowerCase();
    
    // Si ya sabemos el tipo de proyecto, no intentamos detectarlo nuevamente
    if (!existingDetails.type) {
      // Detecta tipo de proyecto
      if (lowerMessage.includes('cerca') || lowerMessage.includes('fence') || lowerMessage.includes('valla')) {
        info.type = 'fencing';
      } else if (lowerMessage.includes('terraza') || lowerMessage.includes('deck') || lowerMessage.includes('patio')) {
        info.type = 'decking';
      } else if (lowerMessage.includes('techo') || lowerMessage.includes('roof') || lowerMessage.includes('tejado')) {
        info.type = 'roofing';
      } else if (lowerMessage.includes('concreto') || lowerMessage.includes('cemento') || lowerMessage.includes('concrete')) {
        info.type = 'concrete';
      }
    }
    
    // Si ya conocemos el material, no intentamos detectarlo nuevamente
    if (!existingDetails.material) {
      const projectType = existingDetails.type || info.type;
      
      if (projectType === 'fencing') {
        // Detecta materiales para cercas
        if (lowerMessage.includes('madera') || lowerMessage.includes('wood')) {
          info.material = 'wood';
        } else if (lowerMessage.includes('vinilo') || lowerMessage.includes('vinyl')) {
          info.material = 'vinyl';
        } else if (lowerMessage.includes('cadena') || lowerMessage.includes('chain link') || lowerMessage.includes('eslabones')) {
          info.material = 'chain_link';
        } else if (lowerMessage.includes('aluminio') || lowerMessage.includes('aluminum')) {
          info.material = 'aluminum';
        }
      } else if (projectType === 'decking') {
        // Detecta materiales para terrazas
        if (lowerMessage.includes('compuesto') || lowerMessage.includes('composite')) {
          info.material = 'composite';
        } else if (lowerMessage.includes('tratada') || lowerMessage.includes('pressure treated')) {
          info.material = 'pressure_treated_wood';
        } else if (lowerMessage.includes('cedro') || lowerMessage.includes('cedar')) {
          info.material = 'cedar';
        }
      }
    }
    
    // Detectar respuestas directas a preguntas comunes
    const lastAssistantMessage = messages
      .filter(m => m.role === 'assistant')
      .slice(-1)
      .map(m => m.content)[0] || '';
    
    // Si la última pregunta fue sobre el material
    if (lastAssistantMessage.includes('material prefieres') || lastAssistantMessage.includes('tipo de material')) {
      if (lowerMessage.includes('madera')) info.material = 'wood';
      else if (lowerMessage.includes('vinilo') || lowerMessage.includes('vinyl')) info.material = 'vinyl';
      else if (lowerMessage.includes('cadena') || lowerMessage.includes('eslabones')) info.material = 'chain_link';
      else if (lowerMessage.includes('aluminio')) info.material = 'aluminum';
      else if (lowerMessage.includes('compuesto')) info.material = 'composite';
      else if (lowerMessage.includes('tratada a presión')) info.material = 'pressure_treated_wood';
      else if (lowerMessage.includes('cedro')) info.material = 'cedar';
    }
    
    // Si la última pregunta fue sobre el tipo de proyecto
    if (lastAssistantMessage.includes('tipo de proyecto') || lastAssistantMessage.includes('qué proyecto')) {
      if (lowerMessage.includes('cerca')) info.type = 'fencing';
      else if (lowerMessage.includes('terraza') || lowerMessage.includes('deck')) info.type = 'decking';
      else if (lowerMessage.includes('techo')) info.type = 'roofing';
      else if (lowerMessage.includes('concreto') || lowerMessage.includes('cemento')) info.type = 'concrete';
    }
    
    // Extrae medidas con un sistema mejorado de detección multilingüe
    const dimensions: any = {};
    
    // MEJORA: Sistema robusto para detectar dimensiones en español e inglés con múltiples formatos
    
    // Detectar longitud/largo
    const lengthPatternsEs = [
      /(\d+(?:[.,]\d+)?)\s*(?:pies|pie|metros|metro|m|p|ft|feet|foot)\s*(?:de)?\s*(?:largo|longitud|length)/i,
      /(?:largo|longitud|length)\s*(?:de|is|es)?\s*(\d+(?:[.,]\d+)?)\s*(?:pies|pie|metros|metro|m|p|ft|feet|foot)/i,
      /(?:mide|tiene|es|es de|of)\s*(\d+(?:[.,]\d+)?)\s*(?:pies|pie|metros|metro|m|p|ft|feet|foot)\s*(?:de)?\s*(?:largo|longitud|length)/i,
      /(\d+(?:[.,]\d+)?)\s*(?:pies|pie|metros|metro|m|p|ft|feet|foot)\s*(?:de)?\s*(?:largo|longitud|length)/i,
      /(?:necesito|quiero|para|for|of)\s*(\d+(?:[.,]\d+)?)\s*(?:pies|pie|metros|metro|m|p|ft|feet|foot)\s*(?:de)?\s*(?:cerca|fence|valla)/i
    ];
    
    for (const pattern of lengthPatternsEs) {
      const match = message.match(pattern);
      if (match && match[1]) {
        // Convertir posibles comas decimales a puntos
        const numStr = match[1].replace(',', '.');
        dimensions.length = parseFloat(numStr);
        break;
      }
    }
    
    // Detectar altura/alto
    const heightPatternsEs = [
      /(\d+(?:[.,]\d+)?)\s*(?:pies|pie|metros|metro|m|p|ft|feet|foot)\s*(?:de)?\s*(?:alto|altura|height)/i,
      /(?:alto|altura|height)\s*(?:de|is|es)?\s*(\d+(?:[.,]\d+)?)\s*(?:pies|pie|metros|metro|m|p|ft|feet|foot)/i,
      /(?:altura|alto|height)\s*(?:de|is|es)?\s*(\d+(?:[.,]\d+)?)\s*(?:pies|pie|metros|metro|m|p|ft|feet|foot)/i
    ];
    
    for (const pattern of heightPatternsEs) {
      const match = message.match(pattern);
      if (match && match[1]) {
        const numStr = match[1].replace(',', '.');
        dimensions.height = parseFloat(numStr);
        break;
      }
    }
    
    // Detectar área/superficie
    const areaPatternsEs = [
      /(\d+(?:[.,]\d+)?)\s*(?:pies|pie|metros|metro|m|p|ft|feet|foot)(?:\s*cuadrados|\^2|²|sq|square)/i,
      /(?:área|area|superficie|surface|sq ft|square feet)\s*(?:de|is|es)?\s*(\d+(?:[.,]\d+)?)/i,
      /(\d+(?:[.,]\d+)?)\s*(?:pies|pie|metros|metro|m|p|ft|feet|foot)\s*(?:cuadrados|²|sq|square|squared)/i
    ];
    
    for (const pattern of areaPatternsEs) {
      const match = message.match(pattern);
      if (match && match[1]) {
        const numStr = match[1].replace(',', '.');
        dimensions.squareFeet = parseFloat(numStr);
        break;
      }
    }
    
    // Detectar grosor (para concreto)
    const thicknessPatternsEs = [
      /(\d+(?:[.,]\d+)?)\s*(?:pulgadas|pulgada|inch|inches|in)\s*(?:de)?\s*(?:grosor|espesor|thickness)/i,
      /(?:grosor|espesor|thickness)\s*(?:de|is|es)?\s*(\d+(?:[.,]\d+)?)\s*(?:pulgadas|pulgada|inch|inches|in)/i
    ];
    
    for (const pattern of thicknessPatternsEs) {
      const match = message.match(pattern);
      if (match && match[1]) {
        const numStr = match[1].replace(',', '.');
        dimensions.thickness = parseFloat(numStr);
        break;
      }
    }
    
    // Si la última pregunta fue específicamente sobre dimensiones, intentar extraer un número simple
    if (lastAssistantMessage.includes('longitud') || lastAssistantMessage.includes('largo') || 
        lastAssistantMessage.includes('length') || lastAssistantMessage.includes('long') ||
        lastAssistantMessage.includes('cuántos pies') || lastAssistantMessage.includes('how many feet')) {
      
      // Buscar un número solitario en la respuesta
      const simpleNumberMatch = message.match(/(\d+(?:[.,]\d+)?)/);
      if (simpleNumberMatch && simpleNumberMatch[1] && !dimensions.length) {
        const numStr = simpleNumberMatch[1].replace(',', '.');
        dimensions.length = parseFloat(numStr);
      }
    }
    
    if (lastAssistantMessage.includes('altura') || lastAssistantMessage.includes('alto') || 
        lastAssistantMessage.includes('height') || lastAssistantMessage.includes('tall')) {
        
      const simpleNumberMatch = message.match(/(\d+(?:[.,]\d+)?)/);
      if (simpleNumberMatch && simpleNumberMatch[1] && !dimensions.height) {
        const numStr = simpleNumberMatch[1].replace(',', '.');
        dimensions.height = parseFloat(numStr);
      }
    }
    
    if (lastAssistantMessage.includes('área') || lastAssistantMessage.includes('superficie') || 
        lastAssistantMessage.includes('area') || lastAssistantMessage.includes('square feet')) {
        
      const simpleNumberMatch = message.match(/(\d+(?:[.,]\d+)?)/);
      if (simpleNumberMatch && simpleNumberMatch[1] && !dimensions.squareFeet) {
        const numStr = simpleNumberMatch[1].replace(',', '.');
        dimensions.squareFeet = parseFloat(numStr);
      }
    }
    
    // MEJORA: Detectar números escritos en texto en español e inglés
    const textNumbersEs = {
      'uno': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5,
      'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10,
      'once': 11, 'doce': 12, 'trece': 13, 'catorce': 14, 'quince': 15,
      'dieciséis': 16, 'diecisiete': 17, 'dieciocho': 18, 'diecinueve': 19, 'veinte': 20,
      'treinta': 30, 'cuarenta': 40, 'cincuenta': 50, 'sesenta': 60, 'setenta': 70,
      'ochenta': 80, 'noventa': 90, 'cien': 100
    };
    
    const textNumbersEn = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
      'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
      'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
      'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70,
      'eighty': 80, 'ninety': 90, 'hundred': 100
    };
    
    // Buscar números en texto para dimensiones específicas
    if (!dimensions.length) {
      for (const [word, value] of Object.entries({...textNumbersEs, ...textNumbersEn})) {
        const lengthTextPattern = new RegExp(`${word}\\s*(?:pies|pie|feet|foot|ft)\\s*(?:de)?\\s*(?:largo|longitud|length)`, 'i');
        if (lengthTextPattern.test(lowerMessage)) {
          dimensions.length = value;
          break;
        }
      }
    }
    
    if (!dimensions.height) {
      for (const [word, value] of Object.entries({...textNumbersEs, ...textNumbersEn})) {
        const heightTextPattern = new RegExp(`${word}\\s*(?:pies|pie|feet|foot|ft)\\s*(?:de)?\\s*(?:alto|altura|height)`, 'i');
        if (heightTextPattern.test(lowerMessage)) {
          dimensions.height = value;
          break;
        }
      }
    }
    
    // Si obtuvimos longitud y altura pero no área para una cerca, calcular área
    if (dimensions.length && dimensions.height && !dimensions.squareFeet && (existingDetails.type === 'fencing' || info.type === 'fencing')) {
      dimensions.squareFeet = dimensions.length * dimensions.height;
    }
    
    if (Object.keys(dimensions).length > 0) {
      info.dimensions = dimensions;
    }
    
    // Extrae información de ubicación con más variantes
    let location: any = null;
    
    // Patrones más sofisticados para ubicaciones
    const cityStateMatch = message.match(/(?:en|ubicado en|localizado en|situada? en)\s+([A-Za-z\s]+),\s*([A-Za-z]{2})/i);
    if (cityStateMatch) {
      location = {
        city: cityStateMatch[1].trim(),
        state: cityStateMatch[2].toUpperCase()
      };
    }
    
    // Detección de estados de EE.UU. comunes
    if (!location) {
      const states = {
        'california': 'CA',
        'texas': 'TX',
        'florida': 'FL',
        'nueva york': 'NY',
        'new york': 'NY',
        'washington': 'WA',
        'oregon': 'OR',
        'arizona': 'AZ',
        'colorado': 'CO',
        'illinois': 'IL',
        'georgia': 'GA'
      };
      
      for (const [stateName, stateCode] of Object.entries(states)) {
        if (lowerMessage.includes(stateName)) {
          location = { state: stateCode };
          
          // Intentar extraer la ciudad antes o después del nombre del estado
          const cityPattern = new RegExp(`(?:en|de)\\s+([A-Za-z\\s]+)(?:\\s+${stateName})`, 'i');
          const cityMatch = message.match(cityPattern);
          if (cityMatch && cityMatch[1]) {
            location.city = cityMatch[1].trim();
          }
          
          break;
        }
      }
    }
    
    // Si encontramos información de ubicación, la agregamos
    if (location) {
      info.location = location;
    }
    
    return info;
  }
  
  /**
   * Verifica si una pregunta similar ya se ha realizado
   */
  private isQuestionAlreadyAsked(question: string, askedQuestions: Set<string>): boolean {
    const normalizedQuestion = question.toLowerCase().trim();
    
    // Verificación directa
    if (askedQuestions.has(normalizedQuestion)) {
      return true;
    }
    
    // Verificación de similitud (temas clave)
    const keyTopics = ['longitud', 'largo', 'altura', 'alto', 'area', 'superficie', 'material', 
                      'tipo', 'ubicación', 'ciudad', 'estado', 'dimensiones'];
    
    for (const topic of keyTopics) {
      if (normalizedQuestion.includes(topic)) {
        // Buscar si ya hay alguna pregunta sobre este tema
        for (const asked of askedQuestions) {
          if (asked.includes(topic)) {
            return true;
          }
        }
      }
    }
    
    return false;
  }
  
  /**
   * Obtiene un resumen de la información que ya conocemos del proyecto
   */
  private getKnownProjectInfo(projectDetails: any): string[] {
    const knownInfo = [];
    
    if (projectDetails.type) {
      knownInfo.push(`Tipo de proyecto: ${this.getProjectTypeName(projectDetails.type)}`);
    }
    
    if (projectDetails.material) {
      knownInfo.push(`Material: ${this.getMaterialName(projectDetails.material)}`);
    }
    
    if (projectDetails.dimensions) {
      if (projectDetails.dimensions.length) {
        knownInfo.push(`Longitud: ${projectDetails.dimensions.length} pies`);
      }
      
      if (projectDetails.dimensions.height) {
        knownInfo.push(`Altura: ${projectDetails.dimensions.height} pies`);
      }
      
      if (projectDetails.dimensions.squareFeet) {
        knownInfo.push(`Área: ${projectDetails.dimensions.squareFeet} pies cuadrados`);
      }
    }
    
    if (projectDetails.location) {
      const locationParts = [];
      if (projectDetails.location.city) locationParts.push(projectDetails.location.city);
      if (projectDetails.location.state) locationParts.push(projectDetails.location.state);
      
      if (locationParts.length > 0) {
        knownInfo.push(`Ubicación: ${locationParts.join(', ')}`);
      }
    }
    
    return knownInfo;
  }
  
  /**
   * Determina si hay suficiente información para generar un estimado
   */
  private canGenerateEstimate(projectDetails: any): boolean {
    // Verificación básica de si tenemos suficiente información para un estimado
    if (!projectDetails.type) {
      return false;
    }
    
    // Verificar dimensiones según el tipo de proyecto
    if (projectDetails.type === 'fencing') {
      return projectDetails.dimensions && 
        (projectDetails.dimensions.length || projectDetails.dimensions.squareFeet);
    } else if (projectDetails.type === 'decking') {
      return projectDetails.dimensions && projectDetails.dimensions.squareFeet;
    } else if (projectDetails.type === 'roofing') {
      return projectDetails.dimensions && projectDetails.dimensions.squareFeet;
    } else if (projectDetails.type === 'concrete') {
      return projectDetails.dimensions && projectDetails.dimensions.squareFeet;
    }
    
    return false;
  }
  
  /**
   * Genera preguntas inteligentes basadas en la información faltante
   */
  private generateIntelligentQuestions(projectDetails: any): string[] {
    const questions: string[] = [];
    
    // Preguntas basadas en el tipo de proyecto
    if (!projectDetails.type) {
      questions.push('¿Qué tipo de proyecto estás considerando? ¿Una cerca, terraza, techo o trabajo de concreto?');
      return questions;
    }
    
    // Preguntas específicas para cada tipo de proyecto
    if (projectDetails.type === 'fencing') {
      if (!projectDetails.dimensions?.length) {
        questions.push('¿Cuál es la longitud total de la cerca que necesitas (en pies)?');
      }
      if (!projectDetails.dimensions?.height) {
        questions.push('¿Qué altura necesitas para tu cerca (en pies)?');
      }
      if (!projectDetails.material) {
        questions.push('¿Qué material prefieres para tu cerca? ¿Madera, vinilo, cadena o aluminio?');
      }
    } else if (projectDetails.type === 'decking') {
      if (!projectDetails.dimensions?.squareFeet) {
        questions.push('¿Cuál es el área aproximada de la terraza (en pies cuadrados)?');
      }
      if (!projectDetails.material) {
        questions.push('¿Prefieres madera tratada a presión, cedro o material compuesto para tu terraza?');
      }
    } else if (projectDetails.type === 'roofing') {
      if (!projectDetails.dimensions?.squareFeet) {
        questions.push('¿Cuál es el área aproximada del techo (en pies cuadrados)?');
      }
      if (!projectDetails.material) {
        questions.push('¿Qué tipo de material de techo te interesa? ¿Tejas asfálticas, metal o tejas de cerámica?');
      }
    } else if (projectDetails.type === 'concrete') {
      if (!projectDetails.dimensions?.squareFeet) {
        questions.push('¿Cuál es el área aproximada para el concreto (en pies cuadrados)?');
      }
      if (!projectDetails.dimensions?.thickness) {
        questions.push('¿Qué grosor necesitas para el concreto (en pulgadas)?');
      }
    }
    
    // Preguntas sobre ubicación solo si no tenemos esta información
    if (!projectDetails.location) {
      questions.push('¿En qué ciudad y estado se realizará el proyecto?');
    }
    
    return questions;
  }
  
  /**
   * Genera una respuesta contextual mejorada basada en el historial de la conversación
   */
  private generateEnhancedContextualResponse(
    message: string, 
    projectDetails: any, 
    messages: Array<{ role: string; content: string; timestamp: Date }>, 
    knownInfo: string[]
  ): string {
    // Respuestas basadas en el contexto del proyecto
    if (!projectDetails.type) {
      return '¡Gracias por contactarnos! Para ayudarte con un estimado, necesito saber qué tipo de proyecto estás considerando. ¿Puedes decirme si es una cerca, terraza, techo o trabajo de concreto?';
    }
    
    // Obtener los últimos 2 mensajes del usuario para tener contexto
    const lastUserMessages = messages
      .filter(m => m.role === 'user')
      .slice(-2)
      .map(m => m.content);
    
    // Obtener el último mensaje del asistente para no repetir información
    const lastAssistantMessage = messages
      .filter(m => m.role === 'assistant')
      .slice(-1)
      .map(m => m.content)[0] || '';
    
    // Respuestas más contextuales según el tipo de proyecto
    const lowerMessage = message.toLowerCase();
    
    // Generar una respuesta más personalizada basada en el contexto acumulado
    if (projectDetails.type === 'fencing') {
      // Si ya tenemos suficiente información sobre dimensiones y material
      if (projectDetails.dimensions?.length && projectDetails.dimensions?.height && projectDetails.material) {
        return `Perfecto, ya tengo la información principal para tu cerca de ${this.getMaterialName(projectDetails.material)} de ${projectDetails.dimensions.length} pies de largo y ${projectDetails.dimensions.height} pies de altura. ¿Necesitas alguna característica especial como puertas o acabados específicos?`;
      }
      
      if (lowerMessage.includes('materia') || lowerMessage.includes('tipo')) {
        if (!projectDetails.material) {
          return 'Para cercas, ofrecemos varios materiales como madera, vinilo, aluminio y cadena. Cada uno tiene diferentes ventajas en términos de durabilidad, mantenimiento y costo. ¿Hay algún material que prefieras?';
        } else {
          return `Ya tengo registrado que prefieres una cerca de ${this.getMaterialName(projectDetails.material)}. Es una excelente elección por su ${this.getMaterialAdvantage(projectDetails.material)}.`;
        }
      }
      
      if (projectDetails.material) {
        const missingDimension = !projectDetails.dimensions?.length ? 'longitud' : 
                                (!projectDetails.dimensions?.height ? 'altura' : '');
        
        if (missingDimension) {
          return `Me has comentado que quieres una cerca de ${this.getMaterialName(projectDetails.material)}. Para continuar, necesito saber la ${missingDimension} de la cerca.`;
        }
        
        return `Entiendo que estás interesado en una cerca de ${this.getMaterialName(projectDetails.material)}. Con la información que tengo hasta ahora: ${knownInfo.join(', ')}, estamos cerca de poder generar un estimado preliminar.`;
      }
      
      return 'Las cercas son una gran manera de añadir privacidad y seguridad a tu propiedad. Para darte un estimado preciso, necesitaría conocer la longitud, altura y el material que prefieres.';
    } else if (projectDetails.type === 'decking') {
      if (lowerMessage.includes('dura') || lowerMessage.includes('vida') || lowerMessage.includes('manteni')) {
        return 'Las terrazas de material compuesto suelen durar más de 25 años y requieren menos mantenimiento que las de madera tratada, pero tienen un costo inicial más alto. La madera tratada es más económica pero necesitará sellado y mantenimiento cada 2-3 años.';
      }
      
      // Si ya tenemos suficiente información para la terraza
      if (projectDetails.dimensions?.squareFeet && projectDetails.material) {
        return `Excelente, ya tengo los detalles principales para tu terraza de ${this.getMaterialName(projectDetails.material)} de ${projectDetails.dimensions.squareFeet} pies cuadrados. ¿Necesitarás barandas o escaleras para esta terraza?`;
      }
      
      return `Las terrazas son excelentes para disfrutar de tu espacio exterior. ${knownInfo.length > 0 ? 'Con la información que ya me has proporcionado: ' + knownInfo.join(', ') + ', ' : ''}Para brindarte un estimado preciso, ${this.getNextRequiredInfo(projectDetails)}.`;
    } else if (projectDetails.type === 'roofing') {
      // Si ya tenemos suficiente información para el techo
      if (projectDetails.dimensions?.squareFeet && projectDetails.material) {
        return `Perfecto, ya tengo la información principal para tu proyecto de techo de ${this.getMaterialName(projectDetails.material)} de ${projectDetails.dimensions.squareFeet} pies cuadrados. ¿Hay alguna consideración adicional como claraboyas o chimeneas?`;
      }
      
      return `Para tu proyecto de techo, ${knownInfo.length > 0 ? 'ya tengo registrado: ' + knownInfo.join(', ') + '. ' : ''}${this.getNextRequiredInfo(projectDetails)}.`;
    } else if (projectDetails.type === 'concrete') {
      // Si ya tenemos suficiente información para el proyecto de concreto
      if (projectDetails.dimensions?.squareFeet && projectDetails.dimensions?.thickness) {
        return `Excelente, ya tengo los detalles principales para tu proyecto de concreto de ${projectDetails.dimensions.squareFeet} pies cuadrados y ${projectDetails.dimensions.thickness} pulgadas de grosor. ¿Necesitarás algún acabado especial para el concreto?`;
      }
      
      return `Para tu proyecto de concreto, ${knownInfo.length > 0 ? 'ya tengo registrado: ' + knownInfo.join(', ') + '. ' : ''}${this.getNextRequiredInfo(projectDetails)}.`;
    }
    
    // Respuesta genérica con la información conocida
    return `Gracias por la información sobre tu proyecto de ${this.getProjectTypeName(projectDetails.type)}. ${knownInfo.length > 0 ? 'Hasta ahora tengo registrado: ' + knownInfo.join(', ') + '. ' : ''}Para brindarte un estimado preciso, ${this.getNextRequiredInfo(projectDetails)}.`;
  }
  
  /**
   * Obtiene el siguiente dato requerido para completar el estimado
   */
  private getNextRequiredInfo(projectDetails: any): string {
    if (!projectDetails.type) {
      return "necesito saber qué tipo de proyecto estás considerando";
    }
    
    if (projectDetails.type === 'fencing') {
      if (!projectDetails.dimensions?.length) {
        return "necesito conocer la longitud total de la cerca";
      }
      if (!projectDetails.dimensions?.height) {
        return "necesito saber la altura que deseas para la cerca";
      }
      if (!projectDetails.material) {
        return "necesito saber qué material prefieres para la cerca";
      }
    } else if (projectDetails.type === 'decking') {
      if (!projectDetails.dimensions?.squareFeet) {
        return "necesito conocer el área aproximada de la terraza en pies cuadrados";
      }
      if (!projectDetails.material) {
        return "necesito saber qué material prefieres para la terraza";
      }
    } else if (projectDetails.type === 'roofing') {
      if (!projectDetails.dimensions?.squareFeet) {
        return "necesito conocer el área aproximada del techo en pies cuadrados";
      }
      if (!projectDetails.material) {
        return "necesito saber qué tipo de material prefieres para el techo";
      }
    } else if (projectDetails.type === 'concrete') {
      if (!projectDetails.dimensions?.squareFeet) {
        return "necesito conocer el área aproximada donde se aplicará el concreto";
      }
      if (!projectDetails.dimensions?.thickness) {
        return "necesito saber el grosor deseado para el concreto";
      }
    }
    
    if (!projectDetails.location) {
      return "sería útil conocer la ubicación del proyecto para ajustar los precios según la región";
    }
    
    return "necesito algunos detalles adicionales para completar el estimado";
  }
  
  /**
   * Obtiene una ventaja del material específico
   */
  private getMaterialAdvantage(material: string): string {
    const advantages: {[key: string]: string} = {
      'wood': 'apariencia natural y costo accesible',
      'vinyl': 'bajo mantenimiento y durabilidad',
      'chain_link': 'seguridad y económía',
      'aluminum': 'resistencia a la corrosión y elegancia',
      'composite': 'durabilidad y bajo mantenimiento',
      'pressure_treated_wood': 'resistencia a la intemperie y costo accesible',
      'cedar': 'belleza natural y resistencia a insectos'
    };
    
    return advantages[material] || 'calidad y durabilidad';
  }
  
  /**
   * Genera una respuesta para el caso en que se pueda generar un estimado
   */
  private generateEstimateResponse(projectDetails: any): string {
    return `¡Excelente! Basado en la información que me has proporcionado sobre tu proyecto de ${this.getProjectTypeName(projectDetails.type)}, puedo ofrecerte un estimado preliminar. He creado un cálculo que incluye materiales y mano de obra. Puedes revisar los detalles completos en el panel de la derecha.`;
  }
  
  /**
   * Genera una respuesta cuando se necesita más información, personalizada según lo que ya sabemos
   */
  private generateNeedMoreInfoResponse(projectDetails: any, knownInfo: string[]): string {
    return `Para generar un estimado preciso para tu proyecto de ${this.getProjectTypeName(projectDetails.type)}, ${knownInfo.length > 0 ? 'ya tengo registrado: ' + knownInfo.join(', ') + '. Sin embargo, aún ' : ''}${this.getNextRequiredInfo(projectDetails)}.`;
  }
  
  private formatDimensionKey(key: string): string {
    const keys = {
      'length': 'Longitud',
      'width': 'Ancho',
      'height': 'Altura',
      'squareFeet': 'Área',
      'thickness': 'Grosor'
    };
    return keys[key as keyof typeof keys] || key;
  }
  
  private getProjectTypeName(type: string): string {
    const types: {[key: string]: string} = {
      'fencing': 'cerca',
      'decking': 'terraza',
      'roofing': 'techo',
      'concrete': 'concreto'
    };
    
    return types[type] || type;
  }
  
  private getMaterialName(material: string): string {
    const materials: {[key: string]: string} = {
      'wood': 'madera',
      'vinyl': 'vinilo',
      'chain_link': 'eslabones de cadena',
      'aluminum': 'aluminio',
      'composite': 'material compuesto',
      'pressure_treated_wood': 'madera tratada a presión',
      'cedar': 'cedro'
    };
    
    return materials[material] || material;
  }
  
  private generateSimpleEstimate(projectDetails: any): any {
    let materialCost = 0;
    let laborCost = 0;
    let equipmentCost = 0;
    
    // Cálculos simplificados según el tipo de proyecto
    if (projectDetails.type === 'fencing') {
      // Para cercas: $15-30 por pie lineal según material
      const pricePerFoot = this.getMaterialPrice(projectDetails.material || 'wood', 'fencing');
      const length = projectDetails.dimensions?.length || 100; // valor por defecto
      
      materialCost = length * pricePerFoot * 0.6; // 60% del costo es material
      laborCost = length * pricePerFoot * 0.35; // 35% es mano de obra
      equipmentCost = length * pricePerFoot * 0.05; // 5% es equipo
    } else if (projectDetails.type === 'decking') {
      // Para terrazas: $25-50 por pie cuadrado según material
      const pricePerSqFt = this.getMaterialPrice(projectDetails.material || 'pressure_treated_wood', 'decking');
      const area = projectDetails.dimensions?.squareFeet || 200; // valor por defecto
      
      materialCost = area * pricePerSqFt * 0.55; // 55% del costo es material
      laborCost = area * pricePerSqFt * 0.4; // 40% es mano de obra
      equipmentCost = area * pricePerSqFt * 0.05; // 5% es equipo
    } else if (projectDetails.type === 'roofing') {
      // Para techos: $7-12 por pie cuadrado
      const pricePerSqFt = 10; // precio promedio
      const area = projectDetails.dimensions?.squareFeet || 1500; // valor por defecto
      
      materialCost = area * pricePerSqFt * 0.6; // 60% del costo es material
      laborCost = area * pricePerSqFt * 0.35; // 35% es mano de obra
      equipmentCost = area * pricePerSqFt * 0.05; // 5% es equipo
    } else if (projectDetails.type === 'concrete') {
      // Para concreto: $6-15 por pie cuadrado
      const pricePerSqFt = 10; // precio promedio
      const area = projectDetails.dimensions?.squareFeet || 500; // valor por defecto
      
      materialCost = area * pricePerSqFt * 0.5; // 50% del costo es material
      laborCost = area * pricePerSqFt * 0.4; // 40% es mano de obra
      equipmentCost = area * pricePerSqFt * 0.1; // 10% es equipo
    }
    
    // Redondear a dos decimales
    materialCost = Math.round(materialCost * 100) / 100;
    laborCost = Math.round(laborCost * 100) / 100;
    equipmentCost = Math.round(equipmentCost * 100) / 100;
    
    const totalCost = materialCost + laborCost + equipmentCost;
    
    return {
      projectSummary: `Estimado para ${this.getProjectTypeName(projectDetails.type)}`,
      materialCost,
      laborCost,
      equipmentCost,
      totalCost,
      materials: this.generateSampleMaterials(projectDetails),
      services: this.generateSampleServices(projectDetails),
      constructionMethod: this.generateConstructionMethod(projectDetails),
      constructionSteps: this.generateConstructionSteps(projectDetails),
      timeEstimate: {
        minDays: 3,
        maxDays: 7
      }
    };
  }
  
  private getMaterialPrice(material: string, projectType: string): number {
    const prices: {[key: string]: {[key: string]: number}} = {
      'fencing': {
        'wood': 25,
        'vinyl': 30,
        'chain_link': 15,
        'aluminum': 40
      },
      'decking': {
        'pressure_treated_wood': 25,
        'composite': 40,
        'cedar': 30,
        'tropical_hardwood': 45
      }
    };
    
    return prices[projectType]?.[material] || 
           (projectType === 'fencing' ? 25 : 30); // valores por defecto
  }
  
  private generateSampleMaterials(projectDetails: any): any[] {
    const type = projectDetails.type;
    
    if (type === 'fencing') {
      return [
        {
          name: `Postes de ${this.getMaterialName(projectDetails.material || 'wood')}`,
          quantity: 10,
          unit: 'unidades',
          unitPrice: 15.99,
          description: 'Postes principales para soporte de la cerca'
        },
        {
          name: `Paneles de ${this.getMaterialName(projectDetails.material || 'wood')}`,
          quantity: 20,
          unit: 'unidades',
          unitPrice: 45.99,
          description: 'Paneles para completar secciones de la cerca'
        },
        {
          name: 'Herrajes y fijaciones',
          quantity: 1,
          unit: 'conjunto',
          unitPrice: 120.00,
          description: 'Tornillos, clavos y soportes para instalación'
        },
        {
          name: 'Concreto para postes',
          quantity: 10,
          unit: 'bolsas',
          unitPrice: 8.99,
          description: 'Para fijar postes al suelo'
        }
      ];
    } else if (type === 'decking') {
      return [
        {
          name: `Tablas de ${this.getMaterialName(projectDetails.material || 'pressure_treated_wood')}`,
          quantity: 100,
          unit: 'unidades',
          unitPrice: 12.99,
          description: 'Tablas para la superficie de la terraza'
        },
        {
          name: 'Vigas de soporte',
          quantity: 20,
          unit: 'unidades',
          unitPrice: 18.99,
          description: 'Estructura principal de soporte'
        },
        {
          name: 'Pilares de soporte',
          quantity: 12,
          unit: 'unidades',
          unitPrice: 25.99,
          description: 'Soportes verticales para la estructura'
        },
        {
          name: 'Herrajes y fijaciones',
          quantity: 1,
          unit: 'conjunto',
          unitPrice: 150.00,
          description: 'Tornillos, clavos y soportes para instalación'
        }
      ];
    }
    
    // Materiales genéricos para otros tipos de proyectos
    return [
      {
        name: 'Material principal',
        quantity: 50,
        unit: 'unidades',
        unitPrice: 20.99,
        description: 'Material principal para el proyecto'
      },
      {
        name: 'Materiales de soporte',
        quantity: 25,
        unit: 'unidades',
        unitPrice: 15.99,
        description: 'Materiales para estructura de soporte'
      },
      {
        name: 'Herrajes y fijaciones',
        quantity: 1,
        unit: 'conjunto',
        unitPrice: 100.00,
        description: 'Elementos de fijación y unión'
      }
    ];
  }
  
  private generateSampleServices(projectDetails: any): any[] {
    return [
      {
        name: 'Instalación profesional',
        hours: 20,
        hourlyRate: 45.00,
        description: 'Mano de obra para instalación completa'
      },
      {
        name: 'Preparación del terreno',
        hours: 4,
        hourlyRate: 35.00,
        description: 'Nivelación y preparación del área de trabajo'
      },
      {
        name: 'Limpieza final',
        hours: 2,
        hourlyRate: 30.00,
        description: 'Retirada de materiales sobrantes y limpieza'
      }
    ];
  }
  
  private generateConstructionMethod(projectDetails: any): string {
    const type = projectDetails.type;
    
    if (type === 'fencing') {
      return 'Instalación profesional usando técnica de anclaje profundo para postes y montaje secuencial de paneles para garantizar estabilidad y durabilidad.';
    } else if (type === 'decking') {
      return 'Construcción con sistema de vigas y pilares distribuidos estratégicamente para soportar el peso de manera uniforme, con tablones instalados perpendicularmente a las vigas.';
    } else if (type === 'roofing') {
      return 'Instalación de capas de impermeabilización y material de techo con técnicas de solapamiento para garantizar resistencia a la intemperie.';
    } else if (type === 'concrete') {
      return 'Preparación de encofrado, vertido de mezcla de concreto con aditivos para mayor resistencia, nivelación precisa y curado controlado.';
    }
    
    return 'Método de construcción profesional adaptado a las necesidades específicas del proyecto y condiciones del sitio.';
  }
  
  private generateConstructionSteps(projectDetails: any): string[] {
    const type = projectDetails.type;
    
    if (type === 'fencing') {
      return [
        'Marcar las ubicaciones de los postes',
        'Excavar hoyos para los postes',
        'Colocar postes y fijarlos con concreto',
        'Instalar travesaños horizontales',
        'Montar paneles o tablones',
        'Instalar puertas y herrajes',
        'Aplicar tratamiento protector si es necesario'
      ];
    } else if (type === 'decking') {
      return [
        'Preparar el terreno y nivelarlo',
        'Instalar pilares de soporte',
        'Montar estructura de vigas principales',
        'Colocar vigas secundarias',
        'Instalar tablas de la superficie',
        'Añadir acabados y barandas',
        'Aplicar sellador protector'
      ];
    }
    
    // Pasos genéricos para otros tipos
    return [
      'Preparación del área de trabajo',
      'Instalación de materiales base',
      'Montaje de componentes estructurales',
      'Instalación de acabados',
      'Limpieza y revisión final'
    ];
  }
}