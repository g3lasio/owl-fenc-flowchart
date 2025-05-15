import { MicroserviceBase, MessageBroker } from '../architecture/microservices-architecture';
import { OpenAIClient } from '../services/openai.client';
import { config } from '../config/config';

/**
 * Servicio de manejo de errores centralizado para la arquitectura de microservicios
 * 
 * Este servicio se encarga de:
 * 1. Capturar, registrar y clasificar errores de todos los microservicios
 * 2. Implementar estrategias de recuperación automática y reintentos
 * 3. Reportar métricas de errores y alertas
 * 4. Proporcionar sugerencias de solución basadas en IA
 * 5. Coordinar respuestas a errores críticos del sistema
 */
export class ErrorHandlerService extends MicroserviceBase {
  private openAIClient: OpenAIClient;
  private errorLog: Map<string, any[]> = new Map(); // Registro de errores por servicio
  private retryStrategies: Map<string, RetryStrategy> = new Map(); // Estrategias de reintento
  private alertThresholds: Map<string, number> = new Map(); // Umbrales de alerta
  private recoveryInProgress: Set<string> = new Set(); // Recuperaciones en progreso
  
  constructor(
    private readonly messageBroker: MessageBroker
  ) {
    super('ErrorHandlerService', '1.0.0');
    
    // Inicializar cliente OpenAI para análisis de errores
    this.openAIClient = new OpenAIClient(config.openai.apiKey);
    
    // Configurar suscripciones al message broker
    this.configureBrokerSubscriptions();
    
    // Configurar estrategias de reintento predeterminadas
    this.configureDefaultRetryStrategies();
    
    // Configurar umbrales de alerta predeterminados
    this.configureDefaultAlertThresholds();
    
    // Iniciar servicio de monitoreo periódico
    this.startErrorMonitoring();
    
    this.logInfo('Servicio de manejo de errores inicializado correctamente');
  }
  
  /**
   * Configura las suscripciones a todos los canales de error en el message broker
   */
  private configureBrokerSubscriptions(): void {
    // Suscribirse a todos los eventos de error de los servicios
    this.messageBroker.subscribe('*.error', this.handleServiceError.bind(this));
    this.messageBroker.subscribe('error-handler.report-error', this.handleErrorReport.bind(this));
    this.messageBroker.subscribe('error-handler.retry-operation', this.handleRetryRequest.bind(this));
    this.messageBroker.subscribe('error-handler.recovery-completed', this.handleRecoveryCompleted.bind(this));
    this.messageBroker.subscribe('error-handler.update-strategy', this.handleUpdateStrategy.bind(this));
    this.messageBroker.subscribe('error-handler.analyze-errors', this.handleAnalyzeErrors.bind(this));
    this.messageBroker.subscribe('error-handler.clear-errors', this.handleClearErrors.bind(this));
    
    // Suscribirse a errores específicos de servicios críticos
    this.messageBroker.subscribe('estimation-service.error', this.handleEstimationError.bind(this));
    this.messageBroker.subscribe('adaptive-learning.error', this.handleAdaptiveLearningError.bind(this));
    this.messageBroker.subscribe('unstructured-input.error', this.handleUnstructuredInputError.bind(this));
    this.messageBroker.subscribe('deepsearch.error', this.handleDeepSearchError.bind(this));
    
    this.logInfo('Suscripciones a canales de error configuradas');
  }
  
  /**
   * Configura estrategias de reintento predeterminadas para diferentes tipos de errores
   */
  private configureDefaultRetryStrategies(): void {
    // Estrategia para errores de API externa
    this.retryStrategies.set('external-api', {
      maxRetries: 5,
      initialDelayMs: 1000,
      backoffFactor: 2,
      jitter: true,
      timeout: 30000
    });
    
    // Estrategia para errores de base de datos
    this.retryStrategies.set('database', {
      maxRetries: 3,
      initialDelayMs: 500,
      backoffFactor: 1.5,
      jitter: false,
      timeout: 5000
    });
    
    // Estrategia para errores de modelos de IA
    this.retryStrategies.set('ai-model', {
      maxRetries: 2,
      initialDelayMs: 2000,
      backoffFactor: 2,
      jitter: true,
      timeout: 60000
    });
    
    // Estrategia para errores de procesamiento general
    this.retryStrategies.set('processing', {
      maxRetries: 3,
      initialDelayMs: 1000,
      backoffFactor: 1.5,
      jitter: true,
      timeout: 15000
    });
  }
  
  /**
   * Configura umbrales de alerta predeterminados para diferentes servicios
   */
  private configureDefaultAlertThresholds(): void {
    // Umbrales de error para servicios críticos (errores por minuto)
    this.alertThresholds.set('estimation-service', 5);
    this.alertThresholds.set('deepsearch-engine', 5);
    this.alertThresholds.set('unstructured-input', 8);
    this.alertThresholds.set('adaptive-learning', 3);
    this.alertThresholds.set('flow-manager', 10);
    
    // Umbral general para cualquier servicio no especificado
    this.alertThresholds.set('default', 15);
  }
  
  /**
   * Inicia el monitoreo periódico de errores
   */
  private startErrorMonitoring(): void {
    // Monitorear errores cada minuto
    setInterval(() => {
      this.checkErrorRates();
      this.cleanupOldErrors();
    }, 60000);
    
    // Generar resumen de errores cada hora
    setInterval(() => {
      this.generateErrorSummary();
    }, 3600000);
  }
  
  /**
   * Maneja un error reportado por cualquier servicio
   */
  private async handleServiceError(message: any): Promise<void> {
    const { service, errorType, error, context, sessionId, timestamp = Date.now() } = message;
    
    // Extraer el nombre del servicio desde el tópico del mensaje
    const serviceName = this.extractServiceName(service);
    
    this.logInfo(`Recibido error de ${serviceName}: ${errorType} - ${error}`);
    
    // Registrar el error
    this.logError(`[${serviceName}] ${errorType}: ${error}`);
    this.recordError(serviceName, {
      errorType,
      message: error,
      context,
      sessionId,
      timestamp,
      handled: false
    });
    
    // Determinar la estrategia de manejo
    const handlingStrategy = await this.determineHandlingStrategy(serviceName, errorType, error, context);
    
    // Aplicar la estrategia de manejo
    await this.applyErrorHandlingStrategy(handlingStrategy, message);
  }
  
  /**
   * Maneja un informe de error explícito
   */
  private async handleErrorReport(message: any): Promise<void> {
    const { service, errorType, error, context, isCritical, requiresHumanIntervention, sessionId } = message;
    
    this.logInfo(`Reporte de error explícito de ${service}: ${errorType} - ${isCritical ? 'CRÍTICO' : 'Normal'}`);
    
    // Registrar el error con metadata adicional
    this.recordError(service, {
      errorType,
      message: error,
      context,
      sessionId,
      timestamp: Date.now(),
      isCritical: !!isCritical,
      requiresHumanIntervention: !!requiresHumanIntervention,
      handled: false
    });
    
    // Si el error es crítico, enviar alerta inmediata
    if (isCritical) {
      await this.sendCriticalErrorAlert(service, errorType, error, context, sessionId);
    }
    
    // Si requiere intervención humana, crear ticket en sistema de soporte
    if (requiresHumanIntervention) {
      await this.createSupportTicket(service, errorType, error, context, sessionId);
    }
    
    // Determinar la estrategia de manejo
    const handlingStrategy = await this.determineHandlingStrategy(service, errorType, error, context);
    
    // Aplicar la estrategia de manejo
    await this.applyErrorHandlingStrategy(handlingStrategy, message);
  }
  
  /**
   * Maneja una solicitud de reintento de operación
   */
  private async handleRetryRequest(message: any): Promise<void> {
    const { service, operation, payload, originalError, retryCount = 0, sessionId } = message;
    const maxRetries = this.getMaxRetries(service, originalError?.type);
    
    this.logInfo(`Solicitud de reintento para ${service}.${operation}, intento ${retryCount + 1}/${maxRetries}`);
    
    // Verificar si se excedió el número máximo de reintentos
    if (retryCount >= maxRetries) {
      this.logWarning(`Número máximo de reintentos (${maxRetries}) alcanzado para ${service}.${operation}`);
      
      // Publicar error final de reintento agotado
      await this.messageBroker.publish('error-handler.retry-exhausted', {
        service,
        operation,
        originalError,
        maxRetries,
        sessionId
      });
      
      // Iniciar procedimiento de recuperación
      await this.initiateRecoveryProcedure(service, operation, originalError, sessionId);
      return;
    }
    
    // Calcular retraso para este reintento (backoff exponencial con jitter)
    const delay = this.calculateRetryDelay(service, retryCount, originalError?.type);
    
    // Programar el reintento después del retraso
    setTimeout(async () => {
      try {
        // Publicar evento de reintento
        await this.messageBroker.publish(`${service}.${operation}`, {
          ...payload,
          isRetry: true,
          retryCount: retryCount + 1,
          sessionId
        });
        
        this.logInfo(`Reintento ${retryCount + 1} para ${service}.${operation} enviado`);
      } catch (error) {
        this.logError(`Error enviando reintento para ${service}.${operation}`, error);
      }
    }, delay);
  }
  
  /**
   * Maneja la finalización de un procedimiento de recuperación
   */
  private async handleRecoveryCompleted(message: any): Promise<void> {
    const { service, operation, success, sessionId } = message;
    const recoveryId = `${service}:${operation}:${sessionId}`;
    
    this.logInfo(`Recuperación completada para ${service}.${operation}: ${success ? 'Éxito' : 'Fallo'}`);
    
    // Eliminar de la lista de recuperaciones en progreso
    this.recoveryInProgress.delete(recoveryId);
    
    // Registrar resultado
    if (success) {
      // Marcar errores relacionados como manejados
      this.markErrorsAsHandled(service, sessionId);
      
      // Notificar éxito
      await this.messageBroker.publish('error-handler.recovery-succeeded', {
        service,
        operation,
        sessionId,
        timestamp: Date.now()
      });
    } else {
      // Notificar fallo
      await this.messageBroker.publish('error-handler.recovery-failed', {
        service,
        operation,
        sessionId,
        timestamp: Date.now()
      });
      
      // Crear alerta para intervención humana
      await this.createSupportTicket(service, 'recovery-failed', 
        `Falló procedimiento de recuperación para ${service}.${operation}`, 
        { sessionId }, sessionId);
    }
  }
  
  /**
   * Maneja la actualización de estrategia de reintento
   */
  private async handleUpdateStrategy(message: any): Promise<void> {
    const { strategyType, configuration } = message;
    
    this.logInfo(`Actualizando estrategia de reintento para ${strategyType}`);
    
    // Actualizar estrategia si es válida
    if (this.validateRetryStrategy(configuration)) {
      this.retryStrategies.set(strategyType, configuration);
      
      await this.messageBroker.publish('error-handler.strategy-updated', {
        strategyType,
        success: true,
        timestamp: Date.now()
      });
    } else {
      this.logWarning(`Configuración inválida para estrategia ${strategyType}`);
      
      await this.messageBroker.publish('error-handler.strategy-update-failed', {
        strategyType,
        success: false,
        reason: 'Configuración inválida',
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Maneja la solicitud de análisis de errores
   */
  private async handleAnalyzeErrors(message: any): Promise<void> {
    const { service, timeframeMs = 3600000, sessionId } = message; // Por defecto, analizar la última hora
    
    this.logInfo(`Analizando errores de ${service || 'todos los servicios'} en las últimas ${timeframeMs / 60000} minutos`);
    
    // Recopilar errores en el timeframe especificado
    const errors = this.getErrorsInTimeframe(service, timeframeMs);
    
    // Si hay suficientes errores, hacer análisis con IA
    if (errors.length > 0) {
      const analysis = await this.performAIErrorAnalysis(errors);
      
      // Publicar resultados
      await this.messageBroker.publish('error-handler.error-analysis', {
        service,
        timeframeMs,
        errorCount: errors.length,
        analysis,
        sessionId,
        timestamp: Date.now()
      });
    } else {
      // No hay suficientes errores para analizar
      await this.messageBroker.publish('error-handler.error-analysis', {
        service,
        timeframeMs,
        errorCount: 0,
        analysis: null,
        message: 'Datos insuficientes para análisis',
        sessionId,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Maneja una solicitud para limpiar errores
   */
  private async handleClearErrors(message: any): Promise<void> {
    const { service, olderThanMs, sessionId } = message;
    
    if (service) {
      // Limpiar errores de un servicio específico
      if (olderThanMs) {
        const cutoffTime = Date.now() - olderThanMs;
        const errorsToKeep = (this.errorLog.get(service) || []).filter(
          error => error.timestamp >= cutoffTime
        );
        this.errorLog.set(service, errorsToKeep);
        this.logInfo(`Limpiados errores de ${service} más antiguos que ${olderThanMs/60000} minutos`);
      } else {
        // Limpiar todos los errores del servicio
        this.errorLog.delete(service);
        this.logInfo(`Limpiados todos los errores de ${service}`);
      }
    } else if (olderThanMs) {
      // Limpiar errores antiguos de todos los servicios
      const cutoffTime = Date.now() - olderThanMs;
      for (const [svc, errors] of this.errorLog.entries()) {
        const errorsToKeep = errors.filter(error => error.timestamp >= cutoffTime);
        this.errorLog.set(svc, errorsToKeep);
      }
      this.logInfo(`Limpiados errores de todos los servicios más antiguos que ${olderThanMs/60000} minutos`);
    } else {
      // Limpiar todos los errores
      this.errorLog.clear();
      this.logInfo('Limpiados todos los errores de todos los servicios');
    }
    
    // Confirmar limpieza
    await this.messageBroker.publish('error-handler.errors-cleared', {
      service,
      olderThanMs,
      sessionId,
      timestamp: Date.now()
    });
  }
  
  /**
   * Maneja errores específicos del servicio de estimación
   */
  private async handleEstimationError(message: any): Promise<void> {
    const { errorType, error, context, sessionId } = message;
    
    this.logInfo(`Error específico del servicio de estimación: ${errorType}`);
    
    // Manejar tipos específicos de errores
    if (errorType === 'calculation-error') {
      // Para errores de cálculo, intentar estimar con un método alternativo
      await this.messageBroker.publish('estimation-service.use-fallback', {
        sessionId,
        context,
        error
      });
    } else if (errorType === 'pricing-data-unavailable') {
      // Para errores de datos de precios, buscar en caché o usar valores predeterminados
      await this.messageBroker.publish('estimation-service.use-cached-prices', {
        sessionId,
        context
      });
    } else {
      // Para otros errores, aplicar manejo genérico
      await this.handleServiceError({
        service: 'estimation-service',
        errorType,
        error,
        context,
        sessionId
      });
    }
  }
  
  /**
   * Maneja errores específicos del servicio de aprendizaje adaptativo
   */
  private async handleAdaptiveLearningError(message: any): Promise<void> {
    const { errorType, error, context, sessionId } = message;
    
    this.logInfo(`Error específico del servicio de aprendizaje adaptativo: ${errorType}`);
    
    // Manejar tipos específicos de errores
    if (errorType === 'training-failed') {
      // Para errores de entrenamiento, registrar y continuar
      this.logWarning('Fallo en entrenamiento de modelo adaptativo', error);
      
      // Notificar pero no intentar recuperación inmediata
      await this.messageBroker.publish('adaptive-learning.training-skipped', {
        sessionId,
        reason: 'Error en entrenamiento anterior',
        willRetry: true
      });
    } else {
      // Para otros errores, aplicar manejo genérico
      await this.handleServiceError({
        service: 'adaptive-learning',
        errorType,
        error,
        context,
        sessionId
      });
    }
  }
  
  /**
   * Maneja errores específicos del servicio de entrada no estructurada
   */
  private async handleUnstructuredInputError(message: any): Promise<void> {
    const { errorType, error, inputType, content, context, sessionId } = message;
    
    this.logInfo(`Error específico del servicio de entrada no estructurada: ${errorType} para ${inputType}`);
    
    // Manejar tipos específicos de errores según el tipo de entrada
    if (inputType === 'image' && errorType === 'processing-failed') {
      // Intentar con un modelo alternativo para procesamiento de imágenes
      await this.messageBroker.publish('unstructured-input.use-alternative-model', {
        sessionId,
        inputType,
        content,
        previousError: error
      });
    } else if (inputType === 'pdf' && errorType === 'extraction-failed') {
      // Para PDFs, intentar con un modo de extracción más simple
      await this.messageBroker.publish('unstructured-input.use-simple-extraction', {
        sessionId,
        content,
        context
      });
    } else {
      // Para otros errores, aplicar manejo genérico
      await this.handleServiceError({
        service: 'unstructured-input',
        errorType,
        error,
        context: { ...context, inputType },
        sessionId
      });
    }
  }
  
  /**
   * Maneja errores específicos del servicio DeepSearch Engine
   */
  private async handleDeepSearchError(message: any): Promise<void> {
    const { errorType, error, context, sessionId } = message;
    
    this.logInfo(`Error específico del servicio DeepSearch Engine: ${errorType}`);
    
    // Manejar tipos específicos de errores
    if (errorType === 'analysis-timeout') {
      // Para timeouts, simplificar el análisis
      await this.messageBroker.publish('deepsearch.simplify-analysis', {
        sessionId,
        context,
        reason: 'Previous analysis timed out'
      });
    } else if (errorType === 'insufficient-project-details') {
      // Para datos insuficientes, solicitar datos adicionales
      await this.messageBroker.publish('flow-manager.request-additional-details', {
        sessionId,
        missingDetails: context?.missingDetails || ['dimensions', 'materials'],
        priority: 'high'
      });
    } else {
      // Para otros errores, aplicar manejo genérico
      await this.handleServiceError({
        service: 'deepsearch-engine',
        errorType,
        error,
        context,
        sessionId
      });
    }
  }
  
  /**
   * Métodos auxiliares
   */
  
  /**
   * Determina la estrategia de manejo para un error específico
   */
  private async determineHandlingStrategy(
    service: string, 
    errorType: string, 
    errorMsg: string, 
    context?: any
  ): Promise<ErrorHandlingStrategy> {
    // Estrategia predeterminada
    const defaultStrategy: ErrorHandlingStrategy = {
      action: 'log',
      shouldRetry: false,
      retryStrategy: 'none',
      escalate: false,
      alertLevel: 'none'
    };
    
    // Verificar si es un error transitorio conocido
    if (this.isTransientError(errorType, errorMsg)) {
      return {
        action: 'retry',
        shouldRetry: true,
        retryStrategy: this.getRetryStrategyForError(errorType),
        escalate: false,
        alertLevel: 'low'
      };
    }
    
    // Verificar si es un error crítico conocido
    if (this.isCriticalError(service, errorType, errorMsg)) {
      return {
        action: 'alert',
        shouldRetry: false,
        retryStrategy: 'none',
        escalate: true,
        alertLevel: 'high',
        recoveryAction: this.getRecoveryActionForError(service, errorType)
      };
    }
    
    // Para errores desconocidos, usar análisis de IA si está disponible
    if (config.openai.apiKey) {
      try {
        const aiAnalysis = await this.analyzeErrorWithAI(service, errorType, errorMsg, context);
        
        // Si el análisis de IA sugiere una acción específica, usarla
        if (aiAnalysis?.action) {
          return {
            ...defaultStrategy,
            ...aiAnalysis
          };
        }
      } catch (aiError) {
        this.logWarning('Error en análisis de IA para error', aiError);
      }
    }
    
    // Aplicar heurísticas simples basadas en el mensaje de error
    if (errorMsg.includes('timeout') || errorMsg.includes('connection') || errorMsg.includes('network')) {
      return {
        action: 'retry',
        shouldRetry: true,
        retryStrategy: 'external-api',
        escalate: false,
        alertLevel: 'low'
      };
    }
    
    if (errorMsg.includes('insufficient memory') || errorMsg.includes('resource') || errorMsg.includes('limit')) {
      return {
        action: 'escalate',
        shouldRetry: false,
        retryStrategy: 'none',
        escalate: true,
        alertLevel: 'medium',
        recoveryAction: 'optimize-resources'
      };
    }
    
    // Estrategia por defecto para errores desconocidos
    return defaultStrategy;
  }
  
  /**
   * Aplica la estrategia de manejo para un error específico
   */
  private async applyErrorHandlingStrategy(
    strategy: ErrorHandlingStrategy, 
    originalMessage: any
  ): Promise<void> {
    const { action, shouldRetry, retryStrategy, escalate, alertLevel, recoveryAction } = strategy;
    const { service, errorType, sessionId, context } = originalMessage;
    
    // Registrar la acción que se va a tomar
    this.logInfo(`Aplicando estrategia para error ${errorType} en ${service}: ${action}`);
    
    // Ejecutar acción principal
    switch (action) {
      case 'retry':
        if (shouldRetry) {
          await this.messageBroker.publish('error-handler.retry-operation', {
            service,
            operation: originalMessage.operation || 'default-operation',
            payload: context,
            originalError: {
              type: errorType,
              message: originalMessage.error
            },
            retryCount: 0,
            sessionId
          });
        }
        break;
        
      case 'alert':
        // Enviar alerta basada en nivel
        switch (alertLevel) {
          case 'high':
            await this.sendCriticalErrorAlert(service, errorType, originalMessage.error, context, sessionId);
            break;
          case 'medium':
            await this.sendErrorAlert(service, errorType, originalMessage.error, context, sessionId);
            break;
          case 'low':
            // Solo registrar, no notificar
            break;
        }
        break;
        
      case 'escalate':
        if (escalate) {
          await this.createSupportTicket(service, errorType, originalMessage.error, context, sessionId);
        }
        break;
        
      case 'recover':
        if (recoveryAction) {
          await this.executeRecoveryAction(service, recoveryAction, originalMessage);
        }
        break;
        
      default:
        // Solo registrar el error
        break;
    }
    
    // Acciones adicionales si es necesario
    if (recoveryAction && action !== 'recover') {
      await this.executeRecoveryAction(service, recoveryAction, originalMessage);
    }
  }
  
  /**
   * Extrae el nombre del servicio del tópico del evento
   */
  private extractServiceName(topic: string): string {
    if (!topic) return 'unknown-service';
    
    // Formato esperado: serviceName.error
    const parts = topic.split('.');
    if (parts.length >= 1) {
      return parts[0];
    }
    
    return 'unknown-service';
  }
  
  /**
   * Registra un error en el log
   */
  private recordError(service: string, errorData: any): void {
    if (!this.errorLog.has(service)) {
      this.errorLog.set(service, []);
    }
    
    this.errorLog.get(service)!.push(errorData);
    
    // Limitar el número de errores almacenados por servicio
    const errors = this.errorLog.get(service)!;
    if (errors.length > 1000) {
      // Mantener solo los 1000 errores más recientes
      this.errorLog.set(service, errors.slice(-1000));
    }
  }
  
  /**
   * Verifica si un error es transitorio
   */
  private isTransientError(errorType: string, errorMsg: string): boolean {
    const transientTypes = [
      'timeout', 'connection', 'network', 'rate-limit', 'temporary',
      'server-busy', 'overload', 'throttled', 'retry-later'
    ];
    
    // Verificar por tipo
    if (transientTypes.some(type => errorType.toLowerCase().includes(type))) {
      return true;
    }
    
    // Verificar por mensaje
    const transientPhrases = [
      'timeout', 'connection reset', 'network error', 'too many requests',
      'service unavailable', 'try again later', 'temporarily unavailable',
      'overloaded', 'busy', 'throttled', 'rate exceeded'
    ];
    
    return transientPhrases.some(phrase => 
      errorMsg.toLowerCase().includes(phrase)
    );
  }
  
  /**
   * Verifica si un error es crítico
   */
  private isCriticalError(service: string, errorType: string, errorMsg: string): boolean {
    const criticalTypes = [
      'data-corruption', 'security', 'authorization', 'authentication',
      'critical-dependency', 'system-failure', 'memory-exhausted', 'disk-full'
    ];
    
    // Verificar por tipo
    if (criticalTypes.some(type => errorType.toLowerCase().includes(type))) {
      return true;
    }
    
    // Verificar por mensaje
    const criticalPhrases = [
      'data corrupt', 'invalid auth', 'access denied', 'unable to boot',
      'fatal error', 'system halted', 'out of memory', 'disk space',
      'database corruption', 'invalid state', 'data integrity', 'security breach'
    ];
    
    return criticalPhrases.some(phrase => 
      errorMsg.toLowerCase().includes(phrase)
    );
  }
  
  /**
   * Obtiene la estrategia de reintento para un tipo de error
   */
  private getRetryStrategyForError(errorType: string): string {
    if (errorType.includes('api') || errorType.includes('http') || errorType.includes('network')) {
      return 'external-api';
    }
    
    if (errorType.includes('db') || errorType.includes('database') || errorType.includes('sql')) {
      return 'database';
    }
    
    if (errorType.includes('ai') || errorType.includes('model') || errorType.includes('openai')) {
      return 'ai-model';
    }
    
    return 'processing';
  }
  
  /**
   * Obtiene el número máximo de reintentos para un servicio y tipo de error
   */
  private getMaxRetries(service: string, errorType?: string): number {
    if (!errorType) return 3; // valor predeterminado
    
    const strategy = this.getRetryStrategyForError(errorType);
    const retryConfig = this.retryStrategies.get(strategy);
    
    return retryConfig?.maxRetries || 3;
  }
  
  /**
   * Calcula el retraso para un reintento específico
   */
  private calculateRetryDelay(service: string, retryCount: number, errorType?: string): number {
    const strategy = errorType ? this.getRetryStrategyForError(errorType) : 'processing';
    const retryConfig = this.retryStrategies.get(strategy) || this.retryStrategies.get('processing')!;
    
    // Backoff exponencial
    let delay = retryConfig.initialDelayMs * Math.pow(retryConfig.backoffFactor, retryCount);
    
    // Aplicar jitter si está configurado
    if (retryConfig.jitter) {
      // Añadir hasta ±30% de variación aleatoria
      const jitterFactor = 0.7 + (Math.random() * 0.6); // entre 0.7 y 1.3
      delay = Math.floor(delay * jitterFactor);
    }
    
    // Asegurar que no exceda un máximo razonable
    const maxDelay = 30000; // 30 segundos
    return Math.min(delay, maxDelay);
  }
  
  /**
   * Valida que una estrategia de reintento sea válida
   */
  private validateRetryStrategy(strategy: any): boolean {
    if (!strategy) return false;
    
    // Verificar campos requeridos
    if (typeof strategy.maxRetries !== 'number' || 
        typeof strategy.initialDelayMs !== 'number' ||
        typeof strategy.backoffFactor !== 'number') {
      return false;
    }
    
    // Verificar rangos razonables
    if (strategy.maxRetries < 0 || strategy.maxRetries > 10 ||
        strategy.initialDelayMs < 100 || strategy.initialDelayMs > 10000 ||
        strategy.backoffFactor < 1 || strategy.backoffFactor > 3) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Obtiene la acción de recuperación para un error crítico
   */
  private getRecoveryActionForError(service: string, errorType: string): string | undefined {
    // Mapeo de tipos de error a acciones de recuperación
    const recoveryMap: Record<string, Record<string, string>> = {
      'estimation-service': {
        'calculation-error': 'use-fallback-calculator',
        'pricing-data-unavailable': 'use-cached-prices'
      },
      'deepsearch-engine': {
        'analysis-timeout': 'simplify-analysis',
        'insufficient-project-details': 'request-additional-details'
      },
      'unstructured-input': {
        'processing-failed': 'use-alternative-model',
        'extraction-failed': 'use-simple-extraction'
      },
      'adaptive-learning': {
        'training-failed': 'skip-training-cycle'
      }
    };
    
    // Buscar acción específica para el servicio y tipo de error
    if (recoveryMap[service] && recoveryMap[service][errorType]) {
      return recoveryMap[service][errorType];
    }
    
    // Acciones genéricas basadas en el tipo de error
    if (errorType.includes('timeout')) {
      return 'increase-timeout';
    }
    
    if (errorType.includes('memory') || errorType.includes('resource')) {
      return 'optimize-resources';
    }
    
    if (errorType.includes('data') || errorType.includes('input')) {
      return 'validate-data';
    }
    
    return undefined;
  }
  
  /**
   * Ejecuta una acción de recuperación para un error
   */
  private async executeRecoveryAction(
    service: string, 
    action: string, 
    originalMessage: any
  ): Promise<void> {
    const { sessionId, context } = originalMessage;
    const recoveryId = `${service}:${action}:${sessionId}`;
    
    // Verificar si ya hay una recuperación en progreso para esta operación
    if (this.recoveryInProgress.has(recoveryId)) {
      this.logInfo(`Recuperación ya en progreso para ${recoveryId}, no se inicia otra`);
      return;
    }
    
    this.logInfo(`Ejecutando acción de recuperación: ${action} para ${service}`);
    this.recoveryInProgress.add(recoveryId);
    
    // Enviar evento específico según la acción
    const actionTopic = `${service}.${action.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    
    try {
      await this.messageBroker.publish(actionTopic, {
        sessionId,
        context,
        recoveryAttempt: true,
        originalError: originalMessage.error,
        timestamp: Date.now()
      });
      
      this.logInfo(`Acción de recuperación ${action} iniciada para ${service}`);
    } catch (error) {
      this.logError(`Error iniciando acción de recuperación ${action} para ${service}`, error);
      this.recoveryInProgress.delete(recoveryId);
      
      // Notificar error en recuperación
      await this.messageBroker.publish('error-handler.recovery-failed', {
        service,
        action,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Inicia un procedimiento de recuperación después de reintentos agotados
   */
  private async initiateRecoveryProcedure(
    service: string, 
    operation: string, 
    error: any, 
    sessionId?: string
  ): Promise<void> {
    this.logInfo(`Iniciando procedimiento de recuperación para ${service}.${operation}`);
    
    // Determinar acción de recuperación adecuada
    const recoveryAction = this.getRecoveryActionForError(service, error?.type || 'unknown');
    
    if (recoveryAction) {
      // Ejecutar acción de recuperación
      await this.executeRecoveryAction(service, recoveryAction, {
        sessionId,
        context: { operation },
        error: error?.message || 'Error desconocido'
      });
    } else {
      // Si no hay acción de recuperación definida, escalar a soporte
      await this.createSupportTicket(
        service,
        'recovery-needed',
        `Reintentos agotados para ${service}.${operation}`,
        { error },
        sessionId
      );
      
      // Notificar que no se pudo recuperar
      await this.messageBroker.publish('error-handler.no-recovery-available', {
        service,
        operation,
        sessionId,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Envía una alerta crítica para un error grave
   */
  private async sendCriticalErrorAlert(
    service: string, 
    errorType: string, 
    errorMsg: string, 
    context?: any,
    sessionId?: string
  ): Promise<void> {
    this.logInfo(`Enviando alerta CRÍTICA para error en ${service}: ${errorType}`);
    
    // En implementación real, enviaríamos alertas a través de varios canales:
    // 1. Slack/Teams para notificación inmediata
    // 2. Email para el equipo de operaciones
    // 3. SMS/Pager para on-call en casos muy críticos
    
    // Publicar alerta en el bus de eventos
    await this.messageBroker.publish('alert-service.critical-alert', {
      service,
      errorType,
      message: errorMsg,
      context,
      sessionId,
      timestamp: Date.now(),
      alertType: 'critical',
      needsAcknowledgment: true
    });
  }
  
  /**
   * Envía una alerta normal para un error
   */
  private async sendErrorAlert(
    service: string, 
    errorType: string, 
    errorMsg: string, 
    context?: any,
    sessionId?: string
  ): Promise<void> {
    this.logInfo(`Enviando alerta para error en ${service}: ${errorType}`);
    
    // Publicar alerta en el bus de eventos
    await this.messageBroker.publish('alert-service.error-alert', {
      service,
      errorType,
      message: errorMsg,
      context,
      sessionId,
      timestamp: Date.now(),
      alertType: 'error',
      needsAcknowledgment: false
    });
  }
  
  /**
   * Crea un ticket de soporte para intervención humana
   */
  private async createSupportTicket(
    service: string,
    errorType: string,
    errorMsg: string,
    context?: any,
    sessionId?: string
  ): Promise<void> {
    this.logInfo(`Creando ticket de soporte para error en ${service}: ${errorType}`);
    
    // En implementación real, crearíamos un ticket en sistema como JIRA, ServiceNow, etc.
    
    // Publicar evento de creación de ticket
    await this.messageBroker.publish('support-service.create-ticket', {
      service,
      errorType,
      message: errorMsg,
      context,
      sessionId,
      timestamp: Date.now(),
      priority: this.isCriticalError(service, errorType, errorMsg) ? 'high' : 'medium',
      category: 'system-error'
    });
  }
  
  /**
   * Marca los errores de un servicio y sesión como manejados
   */
  private markErrorsAsHandled(service: string, sessionId?: string): void {
    if (!sessionId || !this.errorLog.has(service)) return;
    
    const errors = this.errorLog.get(service)!;
    for (let i = 0; i < errors.length; i++) {
      if (errors[i].sessionId === sessionId) {
        errors[i].handled = true;
      }
    }
  }
  
  /**
   * Verifica las tasas de error y genera alertas si superan los umbrales
   */
  private checkErrorRates(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    for (const [service, errors] of this.errorLog.entries()) {
      // Contar errores en el último minuto
      const recentErrors = errors.filter(e => e.timestamp >= oneMinuteAgo);
      const errorRate = recentErrors.length;
      
      // Obtener umbral para este servicio o usar el predeterminado
      const threshold = this.alertThresholds.get(service) || this.alertThresholds.get('default') || 10;
      
      // Si se supera el umbral, generar alerta
      if (errorRate >= threshold) {
        this.logWarning(`Tasa de error alta detectada en ${service}: ${errorRate} errores/minuto`);
        
        // Publicar alerta de tasa de error
        this.messageBroker.publish('error-handler.high-error-rate', {
          service,
          errorRate,
          threshold,
          timeWindowMs: 60000,
          timestamp: now
        }).catch(e => this.logError('Error publicando alerta de tasa de error', e));
      }
    }
  }
  
  /**
   * Elimina errores antiguos para evitar consumo excesivo de memoria
   */
  private cleanupOldErrors(): void {
    const now = Date.now();
    const oneDayAgo = now - 86400000; // 24 horas
    
    for (const [service, errors] of this.errorLog.entries()) {
      // Mantener solo errores de las últimas 24 horas
      const recentErrors = errors.filter(e => e.timestamp >= oneDayAgo);
      this.errorLog.set(service, recentErrors);
    }
  }
  
  /**
   * Genera un resumen de errores para monitoreo
   */
  private async generateErrorSummary(): Promise<void> {
    // Contar errores por servicio y tipo
    const summary: Record<string, any> = {};
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    
    for (const [service, errors] of this.errorLog.entries()) {
      // Filtrar a la última hora
      const recentErrors = errors.filter(e => e.timestamp >= oneHourAgo);
      
      if (recentErrors.length === 0) continue;
      
      // Agrupar por tipo de error
      const errorTypes: Record<string, number> = {};
      recentErrors.forEach(e => {
        const type = e.errorType || 'unknown';
        errorTypes[type] = (errorTypes[type] || 0) + 1;
      });
      
      summary[service] = {
        totalErrors: recentErrors.length,
        byType: errorTypes,
        handledCount: recentErrors.filter(e => e.handled).length,
        unhandledCount: recentErrors.filter(e => !e.handled).length
      };
    }
    
    // Publicar resumen para monitoreo
    await this.messageBroker.publish('error-handler.error-summary', {
      summary,
      period: '1h',
      timestamp: now
    });
  }
  
  /**
   * Analiza un error con IA para determinar la mejor estrategia
   */
  private async analyzeErrorWithAI(
    service: string, 
    errorType: string, 
    errorMsg: string, 
    context?: any
  ): Promise<Partial<ErrorHandlingStrategy> | null> {
    try {
      const prompt = `
        Analiza el siguiente error y recomienda una estrategia de manejo.
        
        Servicio: ${service}
        Tipo de error: ${errorType}
        Mensaje de error: ${errorMsg}
        Contexto adicional: ${JSON.stringify(context || {})}
        
        Por favor clasifica este error y recomienda la mejor estrategia:
        1. ¿Es un error transitorio que debería reintentarse? (Sí/No)
        2. ¿Qué estrategia de reintento sería apropiada? (external-api, database, ai-model, processing, none)
        3. ¿Debería escalarse este error? (Sí/No)
        4. ¿Cuál debería ser el nivel de alerta? (high, medium, low, none)
        5. ¿Hay alguna acción de recuperación específica que recomiendas?
        
        Responde en formato JSON con las siguientes propiedades:
        {
          "isTransient": boolean,
          "action": "retry" | "alert" | "escalate" | "log" | "recover",
          "shouldRetry": boolean,
          "retryStrategy": string,
          "escalate": boolean,
          "alertLevel": "high" | "medium" | "low" | "none",
          "recoveryAction": string | null,
          "explanation": string
        }
      `;
      
      const response = await this.openAIClient.complete({
        model: config.openai.completionModel,
        messages: [
          {role: 'system', content: 'Eres un experto en análisis y manejo de errores en sistemas distribuidos.'},
          {role: 'user', content: prompt}
        ],
        temperature: 0.2,
        max_tokens: 500
      });
      
      if (response.choices && response.choices.length > 0) {
        const content = response.choices[0].message?.content || '';
        
        // Extraer JSON de la respuesta
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonString = jsonMatch[0];
          const analysis = JSON.parse(jsonString);
          
          // Mapear respuesta a nuestra estructura
          return {
            action: analysis.action,
            shouldRetry: analysis.shouldRetry,
            retryStrategy: analysis.retryStrategy,
            escalate: analysis.escalate,
            alertLevel: analysis.alertLevel,
            recoveryAction: analysis.recoveryAction
          };
        }
      }
      
      this.logWarning('No se pudo obtener un análisis válido de IA');
      return null;
    } catch (error) {
      this.logError('Error analizando con IA', error);
      return null;
    }
  }
  
  /**
   * Obtiene los errores en un timeframe específico
   */
  private getErrorsInTimeframe(service?: string, timeframeMs: number = 3600000): any[] {
    const cutoffTime = Date.now() - timeframeMs;
    const errors: any[] = [];
    
    if (service) {
      // Obtener errores solo de un servicio específico
      const serviceErrors = this.errorLog.get(service) || [];
      return serviceErrors.filter(e => e.timestamp >= cutoffTime);
    } else {
      // Obtener errores de todos los servicios
      for (const [svc, serviceErrors] of this.errorLog.entries()) {
        errors.push(...serviceErrors.filter(e => e.timestamp >= cutoffTime)
          .map(e => ({...e, service: svc})));
      }
      return errors;
    }
  }
  
  /**
   * Realiza un análisis de errores utilizando IA
   */
  private async performAIErrorAnalysis(errors: any[]): Promise<any> {
    if (!config.openai.apiKey || errors.length === 0) {
      return null;
    }
    
    try {
      // Limitar a 50 errores para el análisis para evitar exceder límites de tokens
      const sampleErrors = errors.length > 50 
        ? errors.sort(() => 0.5 - Math.random()).slice(0, 50) 
        : errors;
      
      const prompt = `
        Analiza los siguientes ${sampleErrors.length} errores de sistema y proporciona un análisis detallado:
        
        ${JSON.stringify(sampleErrors.map(e => ({
          service: e.service,
          errorType: e.errorType,
          message: e.message,
          timestamp: new Date(e.timestamp).toISOString()
        })))}
        
        Por favor proporciona:
        1. Los patrones principales de error que observas
        2. Posibles causas raíz de estos errores
        3. Servicios que parecen estar teniendo más problemas
        4. Recomendaciones para mejorar la estabilidad del sistema
        5. Si hay errores críticos que requieren atención inmediata
        
        Responde en formato JSON con las siguientes propiedades:
        {
          "patterns": [string],
          "rootCauses": [string],
          "problematicServices": [string],
          "recommendations": [string],
          "criticalIssues": [string] | null,
          "summary": string
        }
      `;
      
      const response = await this.openAIClient.complete({
        model: config.openai.completionModel,
        messages: [
          {role: 'system', content: 'Eres un experto en análisis de errores de sistemas y diagnóstico de problemas.'},
          {role: 'user', content: prompt}
        ],
        temperature: 0.2,
        max_tokens: 1000
      });
      
      if (response.choices && response.choices.length > 0) {
        const content = response.choices[0].message?.content || '';
        
        // Extraer JSON de la respuesta
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }
      
      return { summary: "No se pudo generar un análisis estructurado de los errores." };
    } catch (error) {
      this.logError('Error realizando análisis de errores con IA', error);
      return { 
        summary: "Ocurrió un error durante el análisis de errores con IA.",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

/**
 * Interfaz para las estrategias de reintento
 */
interface RetryStrategy {
  maxRetries: number;
  initialDelayMs: number;
  backoffFactor: number;
  jitter: boolean;
  timeout: number;
}

/**
 * Interfaz para las estrategias de manejo de errores
 */
interface ErrorHandlingStrategy {
  action: 'retry' | 'alert' | 'escalate' | 'log' | 'recover';
  shouldRetry: boolean;
  retryStrategy: string;
  escalate: boolean;
  alertLevel: 'high' | 'medium' | 'low' | 'none';
  recoveryAction?: string;
}
