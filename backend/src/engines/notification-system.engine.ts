/**
 * Sistema de notificaciones para el flujo de estimados
 * Gestiona alertas, advertencias y mensajes informativos durante el proceso
 */
export class NotificationSystem {
  // Niveles de notificación
  public readonly LEVELS = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    SUCCESS: 'success'
  };
  
  // Almacenamiento de notificaciones por sesión
  private notificationsBySession: Map<string, {
    unread: Array<{
      id: string;
      level: string;
      message: string;
      timestamp: Date;
      data?: any;
      dismissed?: boolean;
    }>,
    history: Array<{
      id: string;
      level: string;
      message: string;
      timestamp: Date;
      data?: any;
      dismissed: boolean;
    }>
  }> = new Map();
  
  /**
   * Inicializa el sistema de notificaciones para una sesión
   */
  initializeSession(sessionId: string): void {
    this.notificationsBySession.set(sessionId, {
      unread: [],
      history: []
    });
  }
  
  /**
   * Añade una nueva notificación para una sesión
   */
  addNotification(
    sessionId: string, 
    level: string, 
    message: string, 
    data?: any
  ): string {
    // Verificar que la sesión exista
    if (!this.notificationsBySession.has(sessionId)) {
      this.initializeSession(sessionId);
    }
    
    // Generar ID único para la notificación
    const notificationId = `notification_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Crear nueva notificación
    const notification = {
      id: notificationId,
      level,
      message,
      timestamp: new Date(),
      data,
      dismissed: false
    };
    
    // Añadir a notificaciones sin leer
    const sessionNotifications = this.notificationsBySession.get(sessionId)!;
    sessionNotifications.unread.push(notification);
    
    // Añadir a historial
    sessionNotifications.history.push({ ...notification });
    
    this.notificationsBySession.set(sessionId, sessionNotifications);
    
    return notificationId;
  }
  
  /**
   * Marcar una notificación como leída/descartada
   */
  dismissNotification(sessionId: string, notificationId: string): boolean {
    if (!this.notificationsBySession.has(sessionId)) {
      return false;
    }
    
    const sessionNotifications = this.notificationsBySession.get(sessionId)!;
    
    // Buscar y marcar en notificaciones sin leer
    const unreadIndex = sessionNotifications.unread.findIndex(n => n.id === notificationId);
    if (unreadIndex !== -1) {
      // Eliminar de no leídas
      sessionNotifications.unread.splice(unreadIndex, 1);
      
      // Actualizar en historial
      const historyIndex = sessionNotifications.history.findIndex(n => n.id === notificationId);
      if (historyIndex !== -1) {
        sessionNotifications.history[historyIndex].dismissed = true;
      }
      
      this.notificationsBySession.set(sessionId, sessionNotifications);
      return true;
    }
    
    return false;
  }
  
  /**
   * Obtiene las notificaciones no leídas para una sesión
   */
  getUnreadNotifications(sessionId: string): Array<{
    id: string;
    level: string;
    message: string;
    timestamp: Date;
    data?: any;
  }> {
    if (!this.notificationsBySession.has(sessionId)) {
      return [];
    }
    
    return [...this.notificationsBySession.get(sessionId)!.unread];
  }
  
  /**
   * Obtiene el historial completo de notificaciones para una sesión
   */
  getNotificationHistory(sessionId: string): Array<{
    id: string;
    level: string;
    message: string;
    timestamp: Date;
    data?: any;
    dismissed: boolean;
  }> {
    if (!this.notificationsBySession.has(sessionId)) {
      return [];
    }
    
    return [...this.notificationsBySession.get(sessionId)!.history];
  }
  
  /**
   * Atajos para añadir diferentes tipos de notificaciones
   */
  addInfoNotification(sessionId: string, message: string, data?: any): string {
    return this.addNotification(sessionId, this.LEVELS.INFO, message, data);
  }
  
  addWarningNotification(sessionId: string, message: string, data?: any): string {
    return this.addNotification(sessionId, this.LEVELS.WARNING, message, data);
  }
  
  addErrorNotification(sessionId: string, message: string, data?: any): string {
    return this.addNotification(sessionId, this.LEVELS.ERROR, message, data);
  }
  
  addSuccessNotification(sessionId: string, message: string, data?: any): string {
    return this.addNotification(sessionId, this.LEVELS.SUCCESS, message, data);
  }
  
  /**
   * Alertas específicas para el flujo de estimados
   */
  alertDiscrepancyDetected(sessionId: string, issues: string[]): string {
    const message = `Se han detectado posibles discrepancias: ${issues[0]}${issues.length > 1 ? ` y ${issues.length - 1} más` : ''}`;
    return this.addWarningNotification(sessionId, message, { issues });
  }
  
  alertIncompleteInformation(sessionId: string, missingFields: string[]): string {
    const message = `Información incompleta: Falta ${missingFields.join(', ')}`;
    return this.addWarningNotification(sessionId, message, { missingFields });
  }
  
  alertMarketPriceAdjustment(sessionId: string, reason: string, adjustment: number): string {
    const message = `Los precios han sido ajustados (${adjustment > 0 ? '+' : ''}${adjustment}%) debido a ${reason}`;
    return this.addInfoNotification(sessionId, message, { reason, adjustment });
  }
  
  alertEstimateReady(sessionId: string): string {
    return this.addSuccessNotification(sessionId, 'Su estimado preliminar está listo para revisión');
  }
  
  alertEstimateFinalized(sessionId: string, estimateId: string): string {
    return this.addSuccessNotification(
      sessionId, 
      'Su estimado ha sido finalizado exitosamente', 
      { estimateId }
    );
  }
}