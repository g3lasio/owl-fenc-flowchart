import express from 'express';
import { SimpleMervinEngine } from '../engines/simple-mervin.engine';
import { FlowManagerEngine } from '../engines/flow-manager.engine';
import { AdaptiveLearningEngine } from '../engines/adaptive-learning.engine';
import { ProjectDetails, EstimateResult } from '../interfaces/flow-manager.interfaces';
import { ClientInfoExtractor } from '../utils/client-info-extractor';

/**
 * Controlador para el flujo manual de generación de estimados
 * con un enfoque de onboarding paso a paso y aprendizaje adaptativo
 */
export class ManualEstimateController {
  private sessionData: Map<string, any> = new Map();
  
  constructor(
    private readonly estimateEngine: SimpleMervinEngine,
    private readonly flowManager: FlowManagerEngine,
    private readonly adaptiveLearningEngine: AdaptiveLearningEngine
  ) {
    console.log('📝 Inicializando controlador de estimados manuales con aprendizaje adaptativo');
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
      
      // En una implementación real, guardaríamos esto en sesión o base de datos
      // Por ahora, pasamos como parámetro de consulta para simplificar
      res.redirect(`/estimate/materials?projectType=${projectType}`);
    });

    // Paso 4: Revisión y ajuste de materiales y precios
    app.get('/estimate/materials', async (req, res) => {
      const { sessionId } = req.query;
      
      if (!sessionId) {
        return res.redirect('/estimate/start');
      }
      
      try {
        // Obtener datos de la sesión
        const sessionData = this.sessionData.get(sessionId) || {};
        
        // Obtener estimado preliminar
        const preliminaryEstimate = await this.flowManager.generatePreliminaryEstimate(sessionId.toString());
        
        if (!preliminaryEstimate) {
          return res.redirect('/estimate/dimensions');
        }
        
        // Obtener recomendaciones adaptativas desde el motor de aprendizaje
        const projectDetails = this.flowManager.getProjectDetailsFromContext(sessionId.toString());
        const clientId = sessionData.clientId;
        
        // Obtener estadísticas de aprendizaje
        const contractorStats = await this.adaptiveLearningEngine.analyzeContractorSpecialties();
        
        // Obtener historial de precios para materiales
        const materialsWithHistory = await Promise.all(
          preliminaryEstimate.materials.map(async (material) => {
            // Obtener historial de precios para este material
            const priceHistory = await this.getPriceHistory(material.id);
            
            // Obtener precio sugerido basado en aprendizaje previo
            const suggestedPrice = await this.getSuggestedPrice(material.id, projectDetails.type);
            
            return {
              ...material,
              priceHistory,
              suggestedPrice,
            };
          })
        );
        
        // Obtener historial de tarifas para mano de obra
        const laborWithHistory = await Promise.all(
          preliminaryEstimate.labor.map(async (item) => {
            // Obtener historial de tarifas
            const rateHistory = await this.getLaborRateHistory(item.id, projectDetails.type);
            
            // Obtener tarifa sugerida
            const suggestedRate = await this.getSuggestedLaborRate(item.id, projectDetails.type);
            
            return {
              ...item,
              rateHistory,
              suggestedRate
            };
          })
        );
        
        // Calcular estadísticas de aprendizaje para mostrar
        const learningStats = {
          estimatesCount: await this.getEstimatesCount(projectDetails.type),
          materialAccuracy: await this.getMaterialAccuracy(projectDetails.type),
          laborAccuracy: await this.getLaborAccuracy(projectDetails.type),
          overallAccuracy: await this.getOverallAccuracy(projectDetails.type)
        };
        
        res.render('estimate/materials', {
          title: 'Ajuste de Materiales y Precios',
          sessionId,
          materials: materialsWithHistory,
          labor: laborWithHistory,
          materialCost: preliminaryEstimate.materialCost,
          laborCost: preliminaryEstimate.laborCost,
          markupPercentage: preliminaryEstimate.markupPercentage || 20,
          estimatedDays: preliminaryEstimate.timeEstimate?.minDays || 3,
          notes: sessionData.notes || '',
          learningStats
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
        // Preparar ajustes
        const adjustments = {
          materialAdjustments: materials.map(material => ({
            id: material.id,
            quantity: parseFloat(material.quantity),
            unitPrice: parseFloat(material.unitPrice)
          })),
          laborAdjustments: labor.map(item => ({
            id: item.id,
            hours: parseFloat(item.hours),
            rate: parseFloat(item.rate)
          })),
          markupAdjustment: parseFloat(markupPercentage) / 100,
          timeEstimate: {
            minDays: parseInt(estimatedDays),
            maxDays: parseInt(estimatedDays) + 2
          },
          notes
        };
        
        // Guardar en datos de sesión
        this.sessionData.set(sessionId, {
          ...this.sessionData.get(sessionId),
          adjustments,
          notes
        });
        
        // Finalizar el estimado con los ajustes
        const finalEstimate = await this.flowManager.finalizeEstimate(
          sessionId,
          adjustments,
          true, // Aceptado
          null // El precio final se calculará automáticamente
        );          // Si está habilitado el aprendizaje, contribuir al sistema
          if (sendLearningData === 'on' || sendLearningData === true) {
            const projectDetails = {
              type: 'fencing',
              material: 'wood',
              dimensions: {
                length: 100,
                height: 6
              }
            };
            const clientInfo = ClientInfoExtractor.getClientInfo(sessionId);
            
            // Registrar para aprendizaje
            await this.adaptiveLearningEngine.learnFromEstimate(
              finalEstimate,
              projectDetails,
              clientInfo,
              true, // Aceptado
              finalEstimate.totalCost
            );
          }
        
        // Redireccionar a la página de resumen/finalización
        res.redirect(`/estimate/summary?estimateId=${finalEstimate.estimateId}`);
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
    app.post('/estimate/dimensions', (req, res) => {
      const { projectType, material } = req.query;
      const dimensions = req.body;
      
      // Aquí procesaríamos las dimensiones y calcularíamos áreas si es necesario
      // Por ahora, simplemente pasamos al siguiente paso
      
      const queryParams = new URLSearchParams({
        projectType: projectType as string,
        material: material as string,
        dimensions: JSON.stringify(dimensions)
      });
      
      res.redirect(`/estimate/details?${queryParams.toString()}`);
    });

    // Paso 4: Detalles adicionales
    app.get('/estimate/details', (req, res) => {
      const { projectType, material, dimensions } = req.query;
      
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
        dimensions,
        additionalOptions
      });
    });

    // Recibir detalles adicionales
    app.post('/estimate/details', (req, res) => {
      const { projectType, material, dimensions } = req.query;
      const details = req.body;
      
      const queryParams = new URLSearchParams({
        projectType: projectType as string,
        material: material as string,
        dimensions: dimensions as string,
        details: JSON.stringify(details)
      });
      
      res.redirect(`/estimate/location?${queryParams.toString()}`);
    });

    // Paso 5: Ubicación
    app.get('/estimate/location', (req, res) => {
      const params = req.query;
      
      res.render('estimate/location', {
        title: 'Ubicación del proyecto',
        ...params
      });
    });

    // Recibir ubicación
    app.post('/estimate/location', (req, res) => {
      const prevParams = req.query;
      const { city, state, zipCode } = req.body;
      
      const queryParams = new URLSearchParams({
        ...prevParams as any,
        city,
        state,
        zipCode
      });
      
      res.redirect(`/estimate/summary?${queryParams.toString()}`);
    });

    // Paso 6: Resumen
    app.get('/estimate/summary', async (req, res) => {
      const { estimateId } = req.query;
      
      if (!estimateId) {
        return res.redirect('/estimate/start');
      }
      
      try {
        // En una implementación real, buscaríamos el estimado en la base de datos
        // Para esta demo, recrearemos un estimado simulado
        
        const estimate = {
          estimateId,
          clientInfo: {
            name: 'Carlos Rodríguez',
            email: 'carlos@example.com',
            phone: '555-789-1234',
            address: {
              street: '789 Calle del Sol',
              city: 'Miami',
              state: 'FL',
              zipCode: '33101'
            }
          },
          projectType: 'Cerca',
          projectSubtype: 'Madera',
          dimensions: {
            longitud: '100 pies',
            altura: '6 pies'
          },
          materials: [
            {
              id: 'wood-post',
              name: 'Poste de madera tratada 4x4',
              quantity: 20,
              unit: 'unidades',
              unitPrice: 15.99
            },
            {
              id: 'wood-rail',
              name: 'Travesaño de madera tratada 2x4',
              quantity: 60,
              unit: 'unidades',
              unitPrice: 8.75
            },
            {
              id: 'wood-picket',
              name: 'Tablas de cerca de madera tratada',
              quantity: 200,
              unit: 'unidades',
              unitPrice: 5.25
            },
            {
              id: 'concrete',
              name: 'Concreto para postes',
              quantity: 10,
              unit: 'bolsas',
              unitPrice: 7.50
            },
            {
              id: 'hardware',
              name: 'Tornillos y herrajes',
              quantity: 1,
              unit: 'juego',
              unitPrice: 85.00
            }
          ],
          labor: [
            {
              id: 'labor-demolition',
              description: 'Demolición de cerca existente',
              hours: 8,
              rate: 45.00
            },
            {
              id: 'labor-installation',
              description: 'Instalación de postes y estructura',
              hours: 16,
              rate: 55.00
            },
            {
              id: 'labor-finishing',
              description: 'Instalación de tablas y acabado',
              hours: 12,
              rate: 50.00
            }
          ],
          materialCost: 1800.50,
          laborCost: 1760.00,
          markupPercentage: 0.25,
          taxRate: 0.07,
          taxes: 262.24,
          totalCost: 4510.50,
          timeEstimate: {
            minDays: 5,
            maxDays: 7
          },
          pdfUrl: '/samples/estimate-example.pdf',
          notes: 'La cerca incluye una puerta de 4 pies de ancho con herrajes de calidad. Se realizará limpieza completa del área al finalizar el trabajo.',
          createdAt: new Date().toLocaleDateString()
        };
        
        // Renderizar vista de resumen
        res.render('estimate/summary', {
          title: 'Resumen del Estimado',
          ...estimate
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
        
        // Crear una sesión en el motor de estimados
        const { sessionId } = await this.estimateEngine.startEstimateProcess();
        
        // Generar un estimado utilizando el motor existente
        // En una implementación real, procesaríamos todos los datos recopilados
        const estimate = await this.estimateEngine.getPreliminaryEstimate(sessionId);
        
        if (!estimate) {
          throw new Error('No se pudo generar el estimado');
        }
        
        res.render('estimate/result', {
          title: 'Tu estimado está listo',
          estimate,
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

  /**
   * Métodos auxiliares para el sistema de aprendizaje adaptativo
   */
  
  /**
   * Obtiene el historial de precios para un material específico
   */
  private async getPriceHistory(materialId: string): Promise<Array<{date: string, price: number}>> {
    try {
      // Aquí implementaríamos una consulta real a la base de datos
      // Por ahora, devolvemos datos simulados
      return [
        { date: '2 meses atrás', price: 10.55 },
        { date: '1 mes atrás', price: 11.20 },
        { date: 'Semana pasada', price: 11.35 }
      ];
    } catch (error) {
      console.error(`Error obteniendo historial de precios para ${materialId}:`, error);
      return [];
    }
  }
  
  /**
   * Obtiene el precio sugerido para un material basado en aprendizaje previo
   */
  private async getSuggestedPrice(materialId: string, projectType: string): Promise<number | null> {
    try {
      // En una implementación real, esto consultaría al AdaptiveLearningEngine
      // Por ahora, devolvemos un valor simulado
      return 11.25;
    } catch (error) {
      console.error(`Error obteniendo precio sugerido para ${materialId}:`, error);
      return null;
    }
  }
  
  /**
   * Obtiene el historial de tarifas para un tipo de mano de obra específico
   */
  private async getLaborRateHistory(laborId: string, projectType: string): Promise<Array<{date: string, rate: number}>> {
    try {
      // Implementación simulada
      return [
        { date: '3 meses atrás', rate: 45.00 },
        { date: '1 mes atrás', rate: 47.50 },
        { date: 'Semana pasada', rate: 48.00 }
      ];
    } catch (error) {
      console.error(`Error obteniendo historial de tarifas para ${laborId}:`, error);
      return [];
    }
  }
  
  /**
   * Obtiene la tarifa sugerida para mano de obra basada en aprendizaje previo
   */
  private async getSuggestedLaborRate(laborId: string, projectType: string): Promise<number | null> {
    try {
      // Implementación simulada
      return 48.50;
    } catch (error) {
      console.error(`Error obteniendo tarifa sugerida para ${laborId}:`, error);
      return null;
    }
  }
  
  /**
   * Obtiene el número de estimados similares que Mervin ha aprendido
   */
  private async getEstimatesCount(projectType: string): Promise<number> {
    try {
      // En la implementación real, esto consultaría la base de datos
      return 27; // Valor simulado
    } catch (error) {
      console.error(`Error obteniendo conteo de estimados para ${projectType}:`, error);
      return 0;
    }
  }
  
  /**
   * Obtiene la precisión de Mervin para predecir materiales adecuados
   */
  private async getMaterialAccuracy(projectType: string): Promise<number> {
    try {
      // Implementación simulada
      return 78; // 78% de precisión
    } catch (error) {
      console.error(`Error obteniendo precisión de materiales para ${projectType}:`, error);
      return 0;
    }
  }
  
  /**
   * Obtiene la precisión de Mervin para estimar costos de mano de obra
   */
  private async getLaborAccuracy(projectType: string): Promise<number> {
    try {
      // Implementación simulada
      return 82; // 82% de precisión
    } catch (error) {
      console.error(`Error obteniendo precisión de mano de obra para ${projectType}:`, error);
      return 0;
    }
  }
  
  /**
   * Obtiene la precisión general de Mervin para este tipo de proyecto
   */
  private async getOverallAccuracy(projectType: string): Promise<number> {
    try {
      // Implementación simulada
      return 80; // 80% de precisión general
    } catch (error) {
      console.error(`Error obteniendo precisión general para ${projectType}:`, error);
      return 0;
    }
  }
}