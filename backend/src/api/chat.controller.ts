import { Request, Response } from 'express';
import { SimpleMervinEngine } from '../engines/simple-mervin.engine';
import { v4 as uuidv4 } from 'uuid';

/**
 * Controlador para manejar la interacción con el chatbot Mervin
 * Esta versión simplificada se integra con SimpleMervinEngine para 
 * procesar conversaciones y generar estimados a través de una interfaz de chat
 */
export class ChatController {
  private activeSessions: Map<string, {
    sessionId: string,
    flowSessionId: string,
    lastActivity: Date,
    projectType?: string,
    projectDetails?: any
  }> = new Map();

  constructor(private readonly mervinEngine: SimpleMervinEngine) {}

  /**
   * Configurar las rutas para el controlador de chat
   */
  setupRoutes(app: any) {
    app.get('/chat-dashboard', this.renderChatDashboard.bind(this));
    app.post('/api/chat/start', this.startChatSession.bind(this));
    app.post('/api/chat/message', this.processChatMessage.bind(this));
  }

  /**
   * Renderiza la interfaz de chat
   */
  renderChatDashboard(req: Request, res: Response) {
    res.render('chat-dashboard', {
      title: 'Chat con Mervin - Owl Fence Estimator'
    });
  }

  /**
   * Inicia una nueva sesión de chat
   */
  async startChatSession(req: Request, res: Response) {
    try {
      // Generar un ID de sesión para el chat
      const chatSessionId = uuidv4();
      
      // Iniciar una sesión en el SimpleMervinEngine
      const startResult = await this.mervinEngine.startEstimateProcess();
      
      // Guardar la información de la sesión
      this.activeSessions.set(chatSessionId, {
        sessionId: chatSessionId,
        flowSessionId: startResult.sessionId,
        lastActivity: new Date()
      });
      
      // Limpiar sesiones antiguas (más de 24 horas)
      this.cleanupOldSessions();
      
      // Responder con el ID de sesión
      res.json({
        sessionId: chatSessionId,
        message: '¡Bienvenido al chat con Mervin!'
      });
    } catch (error) {
      console.error('Error al iniciar sesión de chat:', error);
      res.status(500).json({
        error: 'Error al iniciar la sesión de chat'
      });
    }
  }

  /**
   * Procesa un mensaje del usuario en la sesión de chat
   */
  async processChatMessage(req: Request, res: Response) {
    const { sessionId, message } = req.body;
    
    if (!sessionId || !message) {
      return res.status(400).json({
        error: 'Se requiere sessionId y message'
      });
    }
    
    // Verificar que la sesión existe
    const sessionInfo = this.activeSessions.get(sessionId);
    if (!sessionInfo) {
      return res.status(404).json({
        error: 'Sesión no encontrada'
      });
    }
    
    try {
      // Actualizar timestamp de última actividad
      sessionInfo.lastActivity = new Date();
      
      // Procesar el mensaje a través del SimpleMervinEngine
      const response = await this.mervinEngine.processChatMessage(
        sessionInfo.flowSessionId,
        message
      );
      
      // Obtener detalles del proyecto del contexto
      const projectDetails = response.projectDetails || 
                             await this.mervinEngine.getProjectDetailsFromContext(sessionInfo.flowSessionId);
      
      if (projectDetails) {
        // Actualizar los detalles del proyecto en la sesión
        sessionInfo.projectDetails = projectDetails;
        
        if (projectDetails.type) {
          sessionInfo.projectType = projectDetails.type;
        }
      }
      
      // Verificar si hay un estimado preliminar disponible
      let estimateDetails = null;
      if (response.action === 'review_estimate' || response.action === 'finalize_estimate') {
        // Si hay un estimado para revisar, obtenerlo
        estimateDetails = await this.mervinEngine.getPreliminaryEstimate(sessionInfo.flowSessionId);
      }
      
      // Responder con la información procesada
      res.json({
        response: response.response,
        intelligentQuestions: response.intelligentQuestions,
        projectDetails: sessionInfo.projectDetails,
        estimateDetails: estimateDetails,
        isActionRequired: response.isActionRequired,
        action: response.action
      });
    } catch (error) {
      console.error('Error al procesar mensaje:', error);
      res.status(500).json({
        error: 'Error al procesar el mensaje'
      });
    }
  }

  /**
   * Limpia sesiones antiguas para liberar memoria
   */
  private cleanupOldSessions() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    this.activeSessions.forEach((session, key) => {
      if (session.lastActivity < twentyFourHoursAgo) {
        this.activeSessions.delete(key);
      }
    });
  }
}