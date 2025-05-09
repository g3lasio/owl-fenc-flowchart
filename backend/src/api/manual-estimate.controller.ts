import express from 'express';
import { SimpleMervinEngine } from '../engines/simple-mervin.engine';

/**
 * Controlador para el flujo manual de generación de estimados
 * con un enfoque de onboarding paso a paso
 */
export class ManualEstimateController {
  constructor(private readonly estimateEngine: SimpleMervinEngine) {
    console.log('📝 Inicializando controlador de estimados manuales');
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

    // Paso 2: Selección de materiales
    app.get('/estimate/materials', (req, res) => {
      const { projectType } = req.query;
      let materials = [];
      
      // Materiales según el tipo de proyecto
      switch (projectType) {
        case 'fencing':
          materials = [
            { id: 'wood', name: 'Madera', advantages: 'Natural, económico', disadvantages: 'Requiere mantenimiento' },
            { id: 'vinyl', name: 'Vinilo', advantages: 'Bajo mantenimiento, durable', disadvantages: 'Mayor costo inicial' },
            { id: 'chain_link', name: 'Eslabones de cadena', advantages: 'Económico, seguro', disadvantages: 'Menos privacidad' },
            { id: 'aluminum', name: 'Aluminio', advantages: 'Resistente a corrosión, elegante', disadvantages: 'Costo más elevado' }
          ];
          break;
        case 'decking':
          materials = [
            { id: 'pressure_treated_wood', name: 'Madera tratada', advantages: 'Económico, tradicional', disadvantages: 'Mantenimiento regular' },
            { id: 'composite', name: 'Material compuesto', advantages: 'Muy durable, bajo mantenimiento', disadvantages: 'Mayor costo inicial' },
            { id: 'cedar', name: 'Cedro', advantages: 'Belleza natural, resistente a insectos', disadvantages: 'Precio medio-alto' }
          ];
          break;
        // Otros tipos tendrían sus propios materiales aquí
      }
      
      res.render('estimate/materials', {
        title: 'Selecciona el material',
        projectType,
        materials
      });
    });

    // Recibir selección de material
    app.post('/estimate/materials', (req, res) => {
      const { projectType, material } = req.body;
      
      res.redirect(`/estimate/dimensions?projectType=${projectType}&material=${material}`);
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
    app.get('/estimate/summary', (req, res) => {
      // Recopilar todos los datos de los pasos anteriores
      const projectData = req.query;
      
      res.render('estimate/summary', {
        title: 'Resumen del proyecto',
        projectData
      });
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
}