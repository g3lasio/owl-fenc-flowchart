import express from 'express';
import { MicroservicesOrchestrator, ApiGatewayService } from '../architecture/microservices-architecture';
import { ClientInfoExtractor } from '../utils/client-info-extractor';
import { config } from '../config/config';

/**
 * Controlador para el flujo manual de generación de estimados
 * adaptado para trabajar con la arquitectura de microservicios
 */
export class MicroservicesManualEstimateController {
  private apiGateway: ApiGatewayService;
  private orchestrator: MicroservicesOrchestrator;
  
  constructor() {
    // Inicializar el orquestador de microservicios
    this.orchestrator = new MicroservicesOrchestrator(config.messageBroker.connectionString);
    
    // Obtener referencia al API Gateway
    this.apiGateway = this.orchestrator.getService('api-gateway') as ApiGatewayService;
    
    console.log('📝 Inicializando controlador de estimados manuales con arquitectura de microservicios');
  }

  /**
   * Inicializa y arranca todos los microservicios necesarios
   */
  async initialize(): Promise<void> {
    await this.orchestrator.start();
    console.log('🚀 Orquestador de microservicios inicializado correctamente');
  }

  /**
   * Detiene todos los microservicios de forma ordenada
   */
  async shutdown(): Promise<void> {
    await this.orchestrator.stop();
    console.log('🛑 Orquestador de microservicios detenido correctamente');
  }

  /**
   * Configura las rutas para el flujo de onboarding del estimado
   */
  setupRoutes(app: express.Application): void {
    // Ruta inicial - Dashboard de inicio
    app.get('/estimate/start', (req, res) => {
      res.render('estimate/start', {
        title: 'Bienvenido - Crea tu estimado'
      });
    });

    // Paso 1: Selección de tipo de proyecto
    app.get('/estimate/project-type', (req, res) => {
      res.render('estimate/project-type', {
        title: 'Selecciona tu proyecto',
        projectTypes: [
          { 
            id: 'fencing', 
            name: 'Cerca', 
            description: 'Ideal para delimitar propiedad y añadir privacidad',
            imageUrl: '/images/fence-icon.jpg'
          },
          { 
            id: 'decking', 
            name: 'Terraza', 
            description: 'Crea un espacio exterior para disfrutar',
            imageUrl: '/images/deck-icon.jpg'
          },
          { 
            id: 'roofing', 
            name: 'Techo', 
            description: 'Protege tu hogar con un techo duradero',
            imageUrl: '/images/roof-icon.jpg'
          },
          { 
            id: 'concrete', 
            name: 'Concreto', 
            description: 'Superficies duraderas para patios o caminos',
            imageUrl: '/images/concrete-icon.jpg'
          }
        ]
      });
    });

    // Recibir selección de tipo de proyecto
    app.post('/estimate/project-type', (req, res) => {
      const { projectType } = req.body;
      
      // En una implementación real, guardaríamos esto en sesión o en nuestra base de datos
      res.redirect(`/estimate/materials?projectType=${projectType}`);
    });

    // Paso 4: Revisión y ajuste de materiales y precios
    app.get('/estimate/materials', async (req, res) => {
      const { sessionId } = req.query;
      
      if (!sessionId) {
        return res.redirect('/estimate/start');
      }
      
      try {
        // Enviar solicitud al flujo de microservicios a través del API Gateway
        const result = await this.apiGateway.routeRequest('/estimate/materials/get', {
          sessionId: sessionId.toString()
        }, req.headers.authorization);

        if (!result.success) {
          return res.redirect('/estimate/dimensions');
        }
        
        // Renderizar vista con los datos obtenidos de los microservicios
        res.render('estimate/materials', {
          title: 'Ajuste de Materiales y Precios',
          sessionId,
          materials: result.data.materials,
          labor: result.data.labor,
          materialCost: result.data.materialCost,
          laborCost: result.data.laborCost,
          markupPercentage: result.data.markupPercentage || 20,
          estimatedDays: result.data.timeEstimate?.minDays || 3,
          notes: result.data.notes || '',
          learningStats: result.data.learningStats
        });
      } catch (error) {
        console.error('Error preparando vista de materiales:', error);
        res.redirect('/estimate/dimensions');
      }
    });

    // Recibir ajustes de materiales y precios
    app.post('/estimate/materials', async (req, res) => {
      const { sessionId, materials, labor, markupPercentage, estimatedDays, notes, sendLearningData } = req.body;
      
      if (!sessionId) {
        return res.redirect('/estimate/start');
      }
      
      try {
        // Preparar ajustes para enviar a los microservicios
        const adjustments = {
          materialAdjustments: materials.map((material: any) => ({
            id: material.id,
            quantity: parseFloat(material.quantity),
            unitPrice: parseFloat(material.unitPrice)
          })),
          laborAdjustments: labor.map((item: any) => ({
            id: item.id,
            hours: parseFloat(item.hours),
            rate: parseFloat(item.rate)
          })),
          markupAdjustment: parseFloat(markupPercentage) / 100,
          timeEstimate: {
            minDays: parseInt(estimatedDays),
            maxDays: parseInt(estimatedDays) + 2
          },
          notes,
          contributeToLearning: sendLearningData === 'on' || sendLearningData === true
        };
        
        // Enviar ajustes al flujo de microservicios
        const result = await this.apiGateway.routeRequest('/estimate/materials/update', {
          sessionId,
          adjustments,
          clientInfo: ClientInfoExtractor.getClientInfo(sessionId)
        }, req.headers.authorization);

        if (result.success) {
          // Redireccionar a la página de resumen
          res.redirect(`/estimate/summary?estimateId=${result.data.estimateId}`);
        } else {
          // Manejar error
          res.redirect(`/estimate/materials?sessionId=${sessionId}&error=true`);
        }
      } catch (error) {
        console.error('Error procesando ajustes de materiales:', error);
        res.redirect(`/estimate/materials?sessionId=${sessionId}&error=true`);
      }
    });

    // Paso 3: Entrada de dimensiones
    app.get('/estimate/dimensions', (req, res) => {
      const { projectType, material } = req.query;
      
      // Campos de dimensiones según el tipo de proyecto
      let dimensionFields = [];
      
      if (projectType === 'fencing') {
        dimensionFields = [
          { id: 'length', name: 'Longitud', unit: 'pies', required: true },
          { id: 'height', name: 'Altura', unit: 'pies', required: true }
        ];
      } else if (projectType === 'decking') {
        dimensionFields = [
          { id: 'length', name: 'Longitud', unit: 'pies', required: true },
          { id: 'width', name: 'Ancho', unit: 'pies', required: true },
          { id: 'height', name: 'Altura desde el suelo', unit: 'pies', required: false }
        ];
      } else if (projectType === 'concrete') {
        dimensionFields = [
          { id: 'length', name: 'Longitud', unit: 'pies', required: true },
          { id: 'width', name: 'Ancho', unit: 'pies', required: true },
          { id: 'thickness', name: 'Grosor', unit: 'pulgadas', required: true }
        ];
      } else {
        dimensionFields = [
          { id: 'squareFeet', name: 'Área total', unit: 'pies cuadrados', required: true }
        ];
      }
      
      res.render('estimate/dimensions', {
        title: 'Ingresa las dimensiones',
        projectType,
        material,
        dimensionFields,
        calculator: (projectType === 'fencing' || projectType === 'decking')
      });
    });

    // Recibir dimensiones
    app.post('/estimate/dimensions', async (req, res) => {
      const { projectType, material } = req.query;
      const dimensions = req.body;
      
      try {
        // Iniciar una nueva sesión de estimado a través del API Gateway
        const result = await this.apiGateway.routeRequest('/estimate/start', {
          mode: 'manual',
          initialData: {
            projectType,
            material,
            dimensions
          }
        }, req.headers.authorization);

        if (result.success) {
          // Guardar sessionId para usarlo en los siguientes pasos
          const sessionId = result.data.sessionId;
          
          const queryParams = new URLSearchParams({
            sessionId,
            projectType: projectType as string,
            material: material as string
          });
          
          res.redirect(`/estimate/details?${queryParams.toString()}`);
        } else {
          res.redirect('/estimate/start?error=session');
        }
      } catch (error) {
        console.error('Error iniciando sesión de estimado:', error);
        res.redirect('/estimate/start?error=session');
      }
    });

    // Paso 4: Detalles adicionales
    app.get('/estimate/details', (req, res) => {
      const { projectType, material, sessionId } = req.query;
      
      // Opciones adicionales según el tipo de proyecto
      let additionalOptions = [];
      
      if (projectType === 'fencing') {
        additionalOptions = [
          { id: 'gate', name: '¿Incluir puerta?', type: 'checkbox' },
          { id: 'gateCount', name: 'Cantidad de puertas', type: 'number', dependsOn: 'gate' },
          { id: 'postCaps', name: '¿Incluir tapas decorativas para postes?', type: 'checkbox' }
        ];
      } else if (projectType === 'decking') {
        additionalOptions = [
          { id: 'railing', name: '¿Incluir barandas?', type: 'checkbox' },
          { id: 'stairs', name: '¿Incluir escaleras?', type: 'checkbox' },
          { id: 'stairCount', name: 'Número de escalones', type: 'number', dependsOn: 'stairs' }
        ];
      }
      
      res.render('estimate/details', {
        title: 'Detalles adicionales',
        projectType,
        material,
        sessionId,
        additionalOptions
      });
    });

    // Recibir detalles adicionales
    app.post('/estimate/details', async (req, res) => {
      const { sessionId, projectType, material } = req.query;
      const details = req.body;
      
      if (!sessionId) {
        return res.redirect('/estimate/start');
      }
      
      try {
        // Actualizar sesión con detalles adicionales
        const result = await this.apiGateway.routeRequest('/estimate/details/update', {
          sessionId,
          details
        }, req.headers.authorization);

        if (result.success) {
          res.redirect(`/estimate/location?sessionId=${sessionId}`);
        } else {
          res.redirect(`/estimate/details?sessionId=${sessionId}&error=true`);
        }
      } catch (error) {
        console.error('Error actualizando detalles del proyecto:', error);
        res.redirect(`/estimate/details?sessionId=${sessionId}&error=true`);
      }
    });

    // Paso 5: Ubicación
    app.get('/estimate/location', (req, res) => {
      const { sessionId } = req.query;
      
      res.render('estimate/location', {
        title: 'Ubicación del proyecto',
        sessionId
      });
    });

    // Recibir ubicación
    app.post('/estimate/location', async (req, res) => {
      const { sessionId } = req.query;
      const { city, state, zipCode } = req.body;
      
      if (!sessionId) {
        return res.redirect('/estimate/start');
      }
      
      try {
        // Actualizar sesión con datos de ubicación
        const result = await this.apiGateway.routeRequest('/estimate/location/update', {
          sessionId,
          location: { city, state, zipCode }
        }, req.headers.authorization);

        if (result.success) {
          // Ahora podemos generar un estimado preliminar
          const estimateResult = await this.apiGateway.routeRequest('/estimate/generate-preliminary', {
            sessionId
          }, req.headers.authorization);
          
          if (estimateResult.success) {
            res.redirect(`/estimate/materials?sessionId=${sessionId}`);
          } else {
            res.redirect(`/estimate/location?sessionId=${sessionId}&error=estimate`);
          }
        } else {
          res.redirect(`/estimate/location?sessionId=${sessionId}&error=true`);
        }
      } catch (error) {
        console.error('Error actualizando ubicación del proyecto:', error);
        res.redirect(`/estimate/location?sessionId=${sessionId}&error=true`);
      }
    });

    // Paso 6: Resumen
    app.get('/estimate/summary', async (req, res) => {
      const { estimateId } = req.query;
      
      if (!estimateId) {
        return res.redirect('/estimate/start');
      }
      
      try {
        // Obtener detalles del estimado a través del API Gateway
        const result = await this.apiGateway.routeRequest('/estimate/get', {
          estimateId: estimateId.toString()
        }, req.headers.authorization);

        if (!result.success) {
          return res.redirect('/estimate/start?error=summary');
        }
        
        // Renderizar vista de resumen con los datos obtenidos
        res.render('estimate/summary', {
          title: 'Resumen del Estimado',
          ...result.data
        });
      } catch (error) {
        console.error('Error mostrando resumen del estimado:', error);
        res.redirect('/estimate/start?error=summary');
      }
    });

    // Confirmar y generar estimado
    app.post('/estimate/generate', async (req, res) => {
      try {
        // Recopilar todos los datos del proyecto
        const projectData = req.body;
        
        // Iniciar un nuevo proceso de estimado a través del API Gateway
        const sessionResult = await this.apiGateway.routeRequest('/estimate/start', {
          mode: 'manual',
          initialData: projectData
        }, req.headers.authorization);

        if (!sessionResult.success) {
          throw new Error('No se pudo iniciar el proceso de estimado');
        }
        
        // Generar un estimado final
        const estimateResult = await this.apiGateway.routeRequest('/estimate/generate-final', {
          sessionId: sessionResult.data.sessionId
        }, req.headers.authorization);

        if (!estimateResult.success) {
          throw new Error('No se pudo generar el estimado final');
        }
        
        res.render('estimate/result', {
          title: 'Tu estimado está listo',
          estimate: estimateResult.data,
          projectData
        });
      } catch (error) {
        console.error('Error al generar estimado:', error);
        res.status(500).render('error', {
          message: 'Hubo un problema al generar tu estimado'
        });
      }
    });
  }
}
