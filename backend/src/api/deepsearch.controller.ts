import { Request, Response } from 'express';
import { DeepSearchEngine } from '../engines/deepsearch.engine';
import { OpenAIClient } from '../services/openai.client';
import { AnthropicClient } from '../services/anthropic.client';
import { PriceApiService } from '../services/price-api.service';
import { PriceResearchService } from '../services/price-research.service';
import { ConstructionMethodService } from '../services/construction-method.service';
import { ConstructionMethodCacheService } from '../services/construction-method-cache.service';
import { config } from '../config/config';

// Inicializar servicios necesarios para el motor DeepSearch
const openAIClient = new OpenAIClient(config.openai.apiKey);
const anthropicClient = new AnthropicClient(config.anthropic.apiKey);
const constructionMethodCache = new ConstructionMethodCacheService();
const constructionMethodService = new ConstructionMethodService(anthropicClient, constructionMethodCache);
const priceApiService = new PriceApiService();
const priceResearchService = new PriceResearchService(openAIClient);

// Crear instancia del motor DeepSearch
const deepSearchEngine = new DeepSearchEngine(
  openAIClient,
  anthropicClient,
  priceApiService,
  priceResearchService,
  constructionMethodService
);

/**
 * Controlador para operaciones relacionadas con el motor DeepSearch
 * Proporciona endpoints para análisis de proyectos y gestión de precios
 */
export class DeepSearchController {
  constructor(private readonly deepSearchEngine: DeepSearchEngine) {}

  /**
   * Renderiza la página principal de la interfaz de pruebas
   */
  static renderTestUI(req: Request, res: Response) {
    res.render('deepsearch-test', {
      title: 'DeepSearch Engine - Interfaz de Pruebas'
    });
  }

  /**
   * Analiza un proyecto y devuelve un estimado detallado
   */
  async analyzeProject(req: Request, res: Response): Promise<void> {
    try {
      const { projectType, projectSubtype, dimensions, options, location } = req.body;

      // Validación básica
      if (!projectType || !projectSubtype || !dimensions || !location) {
        res.status(400).json({ error: 'Faltan parámetros requeridos' });
        return;
      }

      // Analizar proyecto con DeepSearch
      const result = await this.deepSearchEngine.analyzeProject(
        projectType,
        projectSubtype,
        dimensions,
        options,
        location
      );

      res.status(200).json(result);
    } catch (error) {
      console.error('Error en DeepSearchController.analyzeProject:', error);
      res.status(500).json({ error: `Error al analizar proyecto: ${(error as Error).message}` });
    }
  }

  /**
   * Obtiene los tipos de proyectos disponibles y sus subtipos
   */
  static getProjectTypes(req: Request, res: Response) {
    // Lista de tipos de proyectos soportados con sus subtipos
    const projectTypes = {
      fencing: {
        name: 'Vallas y Cercas',
        subtypes: [
          { id: 'wood', name: 'Madera' },
          { id: 'vinyl', name: 'Vinilo' },
          { id: 'chain_link', name: 'Eslabones' },
          { id: 'aluminum', name: 'Aluminio' },
          { id: 'iron', name: 'Hierro' },
          { id: 'concrete', name: 'Concreto/Hormigón' },
          { id: 'mesh', name: 'Malla' }
        ]
      },
      decking: {
        name: 'Terrazas y Deck',
        subtypes: [
          { id: 'pressure_treated_wood', name: 'Madera Tratada a Presión' },
          { id: 'composite', name: 'Material Compuesto' },
          { id: 'cedar', name: 'Cedro' },
          { id: 'redwood', name: 'Secoya' },
          { id: 'tropical_hardwood', name: 'Madera Tropical Dura' }
        ]
      },
      concrete: {
        name: 'Proyectos de Concreto',
        subtypes: [
          { id: 'driveway', name: 'Entrada (Driveway)' },
          { id: 'patio', name: 'Patio' },
          { id: 'sidewalk', name: 'Acera' },
          { id: 'foundation', name: 'Cimentación' },
          { id: 'steps', name: 'Escaleras' }
        ]
      },
      roofing: {
        name: 'Techos',
        subtypes: [
          { id: 'asphalt_shingles', name: 'Tejas Asfálticas' },
          { id: 'metal', name: 'Metal' },
          { id: 'tile', name: 'Tejas' },
          { id: 'flat', name: 'Techo Plano' },
          { id: 'slate', name: 'Pizarra' }
        ]
      }
    };

    res.json(projectTypes);
  }

  /**
   * Obtiene precios por pie lineal para diferentes tipos de proyectos y regiones
   * Permite a la UI mostrar y modificar estos precios
   */
  async getLinearFootPrices(req: Request, res: Response): Promise<void> {
    try {
      const { region } = req.query;

      // Si se especifica una región, devolver solo los precios de esa región
      if (region && typeof region === 'string') {
        const priceData = (this.deepSearchEngine as any).REGIONAL_PRICES_PER_LINEAR_FOOT[region] || 
                          (this.deepSearchEngine as any).REGIONAL_PRICES_PER_LINEAR_FOOT.default;

        res.status(200).json(priceData);
        return;
      }

      // Devolver todos los precios por región
      res.status(200).json((this.deepSearchEngine as any).REGIONAL_PRICES_PER_LINEAR_FOOT);
    } catch (error) {
      console.error('Error al obtener precios por pie lineal:', error);
      res.status(500).json({ error: `Error al obtener precios: ${(error as Error).message}` });
    }
  }

  /**
   * Actualiza los precios por pie lineal para un tipo de proyecto específico
   * Permite a los contratistas personalizar sus precios según su experiencia
   */
  async updateLinearFootPrices(req: Request, res: Response): Promise<void> {
    try {
      const { region, projectType, subType, withGates, withoutGates } = req.body;

      if (!region || !projectType || !subType) {
        res.status(400).json({ error: 'Faltan parámetros requeridos' });
        return;
      }

      // Verificar que los precios sean números válidos
      if ((withGates !== undefined && (isNaN(withGates) || withGates <= 0)) || 
          (withoutGates !== undefined && (isNaN(withoutGates) || withoutGates <= 0))) {
        res.status(400).json({ error: 'Los precios deben ser números positivos' });
        return;
      }

      // Accedemos a la propiedad privada usando casting
      const priceData = (this.deepSearchEngine as any).REGIONAL_PRICES_PER_LINEAR_FOOT;

      // Asegurarse de que existen las estructuras necesarias
      if (!priceData[region]) {
        priceData[region] = {};
      }

      if (!priceData[region][projectType]) {
        priceData[region][projectType] = {};
      }

      if (!priceData[region][projectType][subType]) {
        priceData[region][projectType][subType] = { withGates: 0, withoutGates: 0 };
      }

      // Actualizar precios
      if (withGates !== undefined) {
        priceData[region][projectType][subType].withGates = parseFloat(withGates);
      }

      if (withoutGates !== undefined) {
        priceData[region][projectType][subType].withoutGates = parseFloat(withoutGates);
      }

      res.status(200).json({
        message: 'Precios actualizados correctamente',
        updatedPrices: priceData[region][projectType][subType]
      });
    } catch (error) {
      console.error('Error al actualizar precios por pie lineal:', error);
      res.status(500).json({ error: `Error al actualizar precios: ${(error as Error).message}` });
    }
  }
}