/**
 * Gestor de progreso para el flujo de estimados
 * Permite hacer seguimiento del avance en el proceso de generación
 */
export class ProgressTracker {
  // Estados posibles del flujo
  private readonly flowStates = [
    'initialized', 
    'client_info_collected',
    'project_type_selected',
    'basic_dimensions_collected',
    'additional_details_collected',
    'all_information_validated',
    'preliminary_estimate_generated',
    'estimate_reviewed',
    'estimate_finalized',
    'document_generated',
    'completed'
  ];
  
  // Mapeo de porcentajes para cada estado
  private readonly statePercentages: Record<string, number> = {
    'initialized': 0,
    'client_info_collected': 15,
    'project_type_selected': 25,
    'basic_dimensions_collected': 40,
    'additional_details_collected': 55,
    'all_information_validated': 65,
    'preliminary_estimate_generated': 75,
    'estimate_reviewed': 85,
    'estimate_finalized': 95,
    'document_generated': 98,
    'completed': 100
  };
  
  // Seguimiento del progreso por sesión
  private progressBySession: Map<string, { 
    currentState: string, 
    lastUpdated: Date, 
    history: { state: string, timestamp: Date }[]
  }> = new Map();
  
  /**
   * Inicializa el seguimiento para una sesión
   */
  initializeSession(sessionId: string): void {
    this.progressBySession.set(sessionId, {
      currentState: 'initialized',
      lastUpdated: new Date(),
      history: [{ state: 'initialized', timestamp: new Date() }]
    });
  }
  
  /**
   * Actualiza el estado de progreso de una sesión
   */
  updateProgress(sessionId: string, newState: string): void {
    // Verificar que la sesión exista
    if (!this.progressBySession.has(sessionId)) {
      this.initializeSession(sessionId);
    }
    
    // Verificar que el estado sea válido
    if (!this.flowStates.includes(newState)) {
      console.warn(`Estado de progreso inválido: ${newState}`);
      return;
    }
    
    const progress = this.progressBySession.get(sessionId)!;
    const now = new Date();
    
    // Actualizar estado actual
    progress.currentState = newState;
    progress.lastUpdated = now;
    
    // Añadir a historial
    progress.history.push({ state: newState, timestamp: now });
    
    this.progressBySession.set(sessionId, progress);
  }
  
  /**
   * Obtiene el porcentaje de progreso actual
   */
  getProgressPercentage(sessionId: string): number {
    if (!this.progressBySession.has(sessionId)) {
      return 0;
    }
    
    const currentState = this.progressBySession.get(sessionId)!.currentState;
    return this.statePercentages[currentState] || 0;
  }
  
  /**
   * Obtiene el estado actual del progreso
   */
  getCurrentState(sessionId: string): string {
    if (!this.progressBySession.has(sessionId)) {
      return 'not_started';
    }
    
    return this.progressBySession.get(sessionId)!.currentState;
  }
  
  /**
   * Obtiene un resumen del progreso para mostrar al usuario
   */
  getProgressSummary(sessionId: string): { 
    percentage: number, 
    state: string, 
    nextStep: string, 
    timeElapsed: number 
  } {
    if (!this.progressBySession.has(sessionId)) {
      return {
        percentage: 0,
        state: 'not_started',
        nextStep: 'Iniciar proceso de estimado',
        timeElapsed: 0
      };
    }
    
    const progress = this.progressBySession.get(sessionId)!;
    const currentState = progress.currentState;
    const percentage = this.statePercentages[currentState];
    
    // Calcular tiempo transcurrido en minutos
    const startTime = progress.history[0].timestamp;
    const timeElapsed = Math.round((new Date().getTime() - startTime.getTime()) / 60000);
    
    // Determinar siguiente paso
    const nextStep = this.determineNextStep(currentState);
    
    return {
      percentage,
      state: currentState,
      nextStep,
      timeElapsed
    };
  }
  
  /**
   * Determina cuál es el siguiente paso en el flujo
   */
  private determineNextStep(currentState: string): string {
    const stateIndex = this.flowStates.indexOf(currentState);
    
    if (stateIndex === -1 || stateIndex === this.flowStates.length - 1) {
      return 'Proceso completado';
    }
    
    const nextState = this.flowStates[stateIndex + 1];
    
    // Mensajes amigables para cada transición
    const nextStepMessages: Record<string, string> = {
      'client_info_collected': 'Seleccionar tipo de proyecto',
      'project_type_selected': 'Proporcionar dimensiones básicas',
      'basic_dimensions_collected': 'Proporcionar detalles adicionales',
      'additional_details_collected': 'Validar toda la información',
      'all_information_validated': 'Generar estimado preliminar',
      'preliminary_estimate_generated': 'Revisar estimado',
      'estimate_reviewed': 'Finalizar estimado',
      'estimate_finalized': 'Generar documento final',
      'document_generated': 'Completar proceso'
    };
    
    return nextStepMessages[nextState] || 'Continuar con el proceso';
  }
  
  /**
   * Obtiene el historial completo de progreso
   */
  getProgressHistory(sessionId: string): { state: string, timestamp: Date }[] {
    if (!this.progressBySession.has(sessionId)) {
      return [];
    }
    
    return [...this.progressBySession.get(sessionId)!.history];
  }
}