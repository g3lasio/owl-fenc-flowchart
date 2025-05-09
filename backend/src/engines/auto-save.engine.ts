/**
 * Sistema de guardado automático para el flujo de estimados
 * Preserva el estado entre sesiones y evita pérdida de datos
 */
export class AutoSaveSystem {
  // Almacén de estados guardados
  private sessionStates: Map<string, {
    data: any,
    lastSaved: Date,
    autoSaveCount: number,
    version: number
  }> = new Map();
  
  // Intervalo de guardado automático en milisegundos (default: 30 segundos)
  private autoSaveInterval: number = 30000;
  
  // Limite de versiones a mantener
  private maxVersionsToKeep: number = 10;
  
  // Historial de versiones por sesión
  private versionHistory: Map<string, Array<{
    version: number,
    timestamp: Date,
    snapshot: any
  }>> = new Map();
  
  constructor(autoSaveIntervalMs?: number, maxVersions?: number) {
    if (autoSaveIntervalMs) {
      this.autoSaveInterval = autoSaveIntervalMs;
    }
    if (maxVersions) {
      this.maxVersionsToKeep = maxVersions;
    }
  }
  
  /**
   * Inicia el guardado automático para una sesión
   */
  initializeSession(sessionId: string, initialData: any): void {
    this.sessionStates.set(sessionId, {
      data: initialData,
      lastSaved: new Date(),
      autoSaveCount: 0,
      version: 1
    });
    
    // Inicializar historial de versiones
    this.versionHistory.set(sessionId, [{
      version: 1,
      timestamp: new Date(),
      snapshot: JSON.parse(JSON.stringify(initialData)) // Copia profunda
    }]);
  }
  
  /**
   * Guarda manualmente el estado actual
   */
  saveSession(sessionId: string, data: any): boolean {
    if (!this.sessionStates.has(sessionId)) {
      this.initializeSession(sessionId, data);
      return true;
    }
    
    const session = this.sessionStates.get(sessionId)!;
    const newVersion = session.version + 1;
    
    // Actualizar estado de la sesión
    this.sessionStates.set(sessionId, {
      data,
      lastSaved: new Date(),
      autoSaveCount: session.autoSaveCount,
      version: newVersion
    });
    
    // Añadir a historial de versiones
    this.addVersionToHistory(sessionId, newVersion, data);
    
    return true;
  }
  
  /**
   * Ejecuta guardado automático si ha pasado el tiempo suficiente
   * Retorna true si se realizó el guardado
   */
  checkAndAutoSave(sessionId: string, currentData: any): boolean {
    if (!this.sessionStates.has(sessionId)) {
      this.initializeSession(sessionId, currentData);
      return true;
    }
    
    const session = this.sessionStates.get(sessionId)!;
    const now = new Date();
    const timeSinceLastSave = now.getTime() - session.lastSaved.getTime();
    
    // Verificar si ha pasado suficiente tiempo para auto-guardar
    if (timeSinceLastSave >= this.autoSaveInterval) {
      const newVersion = session.version + 1;
      
      // Actualizar estado de la sesión
      this.sessionStates.set(sessionId, {
        data: currentData,
        lastSaved: now,
        autoSaveCount: session.autoSaveCount + 1,
        version: newVersion
      });
      
      // Añadir a historial de versiones (solo para autoguardados importantes)
      // Para evitar muchas versiones, guardamos solo cada 5 autoguardados o
      // si hay cambios significativos
      if (session.autoSaveCount % 5 === 0 || this.hasSignificantChanges(session.data, currentData)) {
        this.addVersionToHistory(sessionId, newVersion, currentData);
      }
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Restaura una sesión guardada previamente
   */
  restoreSession(sessionId: string): any | null {
    if (!this.sessionStates.has(sessionId)) {
      return null;
    }
    
    return this.sessionStates.get(sessionId)!.data;
  }
  
  /**
   * Restaura una versión específica de una sesión
   */
  restoreVersion(sessionId: string, version: number): any | null {
    if (!this.versionHistory.has(sessionId)) {
      return null;
    }
    
    const versionEntry = this.versionHistory.get(sessionId)!.find(v => v.version === version);
    if (!versionEntry) {
      return null;
    }
    
    // Actualizar versión actual
    const currentSession = this.sessionStates.get(sessionId)!;
    this.sessionStates.set(sessionId, {
      ...currentSession,
      data: versionEntry.snapshot,
      version: versionEntry.version
    });
    
    return versionEntry.snapshot;
  }
  
  /**
   * Obtiene todas las versiones disponibles para una sesión
   */
  getVersionHistory(sessionId: string): Array<{
    version: number,
    timestamp: Date,
    isAutoSave: boolean
  }> {
    if (!this.versionHistory.has(sessionId)) {
      return [];
    }
    
    return this.versionHistory.get(sessionId)!.map(v => ({
      version: v.version,
      timestamp: v.timestamp,
      isAutoSave: v.version % 2 === 0 // Simplificación: versiones pares son autoguardados
    }));
  }
  
  /**
   * Determina si hay cambios significativos entre dos estados
   */
  private hasSignificantChanges(oldData: any, newData: any): boolean {
    // Simplificación: comparar si alguna propiedad de primer nivel cambió
    // En una implementación real, se haría un análisis más profundo
    if (!oldData || !newData) return true;
    
    const oldKeys = Object.keys(oldData);
    const newKeys = Object.keys(newData);
    
    // Si cambió el número de propiedades
    if (oldKeys.length !== newKeys.length) return true;
    
    // Verificar cambios en propiedades críticas
    const criticalProperties = ['client', 'project', 'estimate'];
    for (const prop of criticalProperties) {
      if (JSON.stringify(oldData[prop]) !== JSON.stringify(newData[prop])) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Añade una versión al historial, manteniendo el límite configurado
   */
  private addVersionToHistory(sessionId: string, version: number, data: any): void {
    if (!this.versionHistory.has(sessionId)) {
      this.versionHistory.set(sessionId, []);
    }
    
    const history = this.versionHistory.get(sessionId)!;
    
    // Añadir nueva versión
    history.push({
      version,
      timestamp: new Date(),
      snapshot: JSON.parse(JSON.stringify(data)) // Copia profunda
    });
    
    // Mantener solo el número configurado de versiones
    if (history.length > this.maxVersionsToKeep) {
      // Conservar la primera versión (inicial) y eliminar las más antiguas
      const initialVersion = history[0];
      const recentVersions = history.slice(-(this.maxVersionsToKeep - 1));
      this.versionHistory.set(sessionId, [initialVersion, ...recentVersions]);
    }
  }
  
  /**
   * Obtiene el tiempo desde el último guardado en segundos
   */
  getTimeSinceLastSave(sessionId: string): number {
    if (!this.sessionStates.has(sessionId)) {
      return -1; // Nunca guardado
    }
    
    const lastSaved = this.sessionStates.get(sessionId)!.lastSaved;
    return Math.round((new Date().getTime() - lastSaved.getTime()) / 1000);
  }
  
  /**
   * Obtiene estadísticas de guardado para una sesión
   */
  getAutoSaveStats(sessionId: string): {
    autoSaveCount: number,
    lastSaved: Date,
    versionCount: number,
    currentVersion: number
  } | null {
    if (!this.sessionStates.has(sessionId)) {
      return null;
    }
    
    const session = this.sessionStates.get(sessionId)!;
    const versionCount = this.versionHistory.has(sessionId) ? 
      this.versionHistory.get(sessionId)!.length : 0;
    
    return {
      autoSaveCount: session.autoSaveCount,
      lastSaved: session.lastSaved,
      versionCount,
      currentVersion: session.version
    };
  }
}