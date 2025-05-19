import { AIServiceV2 } from '../services/ai-service-v2';
import { ProjectDetails, EstimateResult, Client } from '../interfaces/flow-manager.interfaces';
import { PersistentCacheService } from '../services/persistent-cache.service';
import { config } from '../config/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Motor de Aprendizaje Adaptativo que aprende del contratista y sus estimados
 * para mejorar progresivamente la precisión y personalización
 * 
 * This version uses the new AIServiceV2 with provider abstractions
 */
export class AdaptiveLearningEngineV2 {
  private persistentCache: PersistentCacheService;
  private aiService: AIServiceV2;
  private readonly defaultModel = config.openai.defaultModel || 'gpt-4o';
  
  // Intervalos de actualización para cada tipo de conocimiento (en días)
  private readonly updateIntervals = {
    materialPrices: 7,    // Actualizar precios de materiales cada 7 días
    laborRates: 30,       // Actualizar tarifas de mano de obra cada 30 días
    projectPatterns: 14,  // Actualizar patrones de proyectos cada 14 días
    clientPreferences: 60 // Actualizar preferencias de clientes cada 60 días
  };

  constructor(
    private readonly contractorId: string,
    aiService?: AIServiceV2
  ) {
    // Use provided AIService or create a new one
    this.aiService = aiService || new AIServiceV2();
    
    // Inicializar caché persistente para el contratista específico
    const cachePath = path.join(config.cache.cachePath, `contractor_${contractorId}`);
    this.persistentCache = new PersistentCacheService(cachePath);
    
    // Asegurar que existan las estructuras de datos necesarias
    this.initializeKnowledgeBase();
  }

  /**
   * Inicializa la base de conocimiento si no existe
   */
  private initializeKnowledgeBase(): void {
    // Verificar si ya existe la base de conocimiento
    const knowledgeBasePath = path.join(this.persistentCache.getCachePath(), 'knowledge_base.json');
    
    if (!fs.existsSync(knowledgeBasePath)) {
      // Crear estructura inicial de la base de conocimiento
      const initialKnowledgeBase = {
        contractorProfile: {
          specialties: [],
          preferredMaterials: {},
          typicalMarkups: {},
          workingRegions: [],
          qualityPreferences: 'standard'
        },
        projectPatterns: {
          common: {},
          seasonal: {},
          lastUpdated: new Date().toISOString()
        },
        materialPrices: {
          tracked: {},
          trends: {},
          lastUpdated: new Date().toISOString()
        },
        laborRates: {
          standard: {},
          specialized: {},
          lastUpdated: new Date().toISOString()
        },
        clientPreferences: {
          segments: {},
          lastUpdated: new Date().toISOString()
        },
        completedProjects: []
      };
      
      // Guardar la estructura inicial
      fs.writeFileSync(knowledgeBasePath, JSON.stringify(initialKnowledgeBase, null, 2));
      console.log(`Base de conocimiento inicializada para contratista ${this.contractorId}`);
    }
  }

  /**
   * Aprende de un proyecto completado
   * @param projectResult Resultado del proyecto para aprender
   * @param contractorId ID del contratista asociado
   */
  async learnFromProject(projectResult: any, contractorId: string): Promise<void> {
    try {
      console.log(`Aprendiendo de proyecto para contratista ${contractorId}`);
      
      // Cargar base de conocimiento actual
      const knowledgeBase = await this.loadKnowledgeBase();
      
      // Añadir el proyecto a la lista de proyectos completados
      knowledgeBase.completedProjects.push({
        ...projectResult,
        learnedAt: new Date().toISOString()
      });
      
      // Limitar el número de proyectos guardados (mantener los últimos 50)
      if (knowledgeBase.completedProjects.length > 50) {
        knowledgeBase.completedProjects = knowledgeBase.completedProjects.slice(-50);
      }
      
      // Identificar patrones en este proyecto
      await this.identifyProjectPatterns(projectResult, knowledgeBase);
      
      // Actualizar precios de materiales si es necesario
      if (this.shouldUpdate('materialPrices', knowledgeBase.materialPrices.lastUpdated)) {
        await this.updateMaterialPrices(projectResult, knowledgeBase);
      }
      
      // Actualizar tarifas de mano de obra si es necesario
      if (this.shouldUpdate('laborRates', knowledgeBase.laborRates.lastUpdated)) {
        await this.updateLaborRates(projectResult, knowledgeBase);
      }
      
      // Guardar cambios en la base de conocimiento
      await this.saveKnowledgeBase(knowledgeBase);
      
      console.log(`Aprendizaje completado para el proyecto`);
    } catch (error) {
      console.error('Error en el proceso de aprendizaje:', error);
    }
  }

  /**
   * Determina si se debe actualizar un tipo de conocimiento basado en su intervalo
   */
  private shouldUpdate(knowledgeType: string, lastUpdated: string): boolean {
    const updateInterval = this.updateIntervals[knowledgeType as keyof typeof this.updateIntervals];
    const lastUpdateDate = new Date(lastUpdated);
    const daysSinceLastUpdate = this.daysBetween(lastUpdateDate, new Date());
    
    return daysSinceLastUpdate >= updateInterval;
  }

  /**
   * Calcula días entre dos fechas
   */
  private daysBetween(date1: Date, date2: Date): number {
    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Carga la base de conocimiento desde el disco
   */
  private async loadKnowledgeBase(): Promise<any> {
    const knowledgeBasePath = path.join(this.persistentCache.getCachePath(), 'knowledge_base.json');
    const data = fs.readFileSync(knowledgeBasePath, 'utf8');
    return JSON.parse(data);
  }

  /**
   * Guarda la base de conocimiento en disco
   */
  private async saveKnowledgeBase(knowledgeBase: any): Promise<void> {
    const knowledgeBasePath = path.join(this.persistentCache.getCachePath(), 'knowledge_base.json');
    fs.writeFileSync(knowledgeBasePath, JSON.stringify(knowledgeBase, null, 2));
  }

  /**
   * Identifica patrones en un proyecto
   */
  private async identifyProjectPatterns(projectResult: any, knowledgeBase: any): Promise<void> {
    try {
      const projectKey = `${projectResult.projectType}_${projectResult.projectSubtype}`;
      
      // Verificar si ya existe este tipo de proyecto en los patrones
      if (!knowledgeBase.projectPatterns.common[projectKey]) {
        knowledgeBase.projectPatterns.common[projectKey] = {
          count: 0,
          typicalOptions: {},
          typicalMaterials: {},
          seasonality: {}
        };
      }
      
      // Incrementar contador y actualizar fecha
      knowledgeBase.projectPatterns.common[projectKey].count += 1;
      knowledgeBase.projectPatterns.lastUpdated = new Date().toISOString();
      
      // Actualizar opciones típicas
      this.updateTypicalOptions(projectResult, knowledgeBase.projectPatterns.common[projectKey]);
      
      // Actualizar materiales típicos
      this.updateTypicalMaterials(projectResult, knowledgeBase.projectPatterns.common[projectKey]);
      
      // Actualizar estacionalidad
      this.updateSeasonality(projectResult, knowledgeBase.projectPatterns.common[projectKey]);
      
      // Analizar con IA para identificar patrones adicionales
      await this.analyzeProjectPatternsWithAI(projectResult, knowledgeBase);
      
    } catch (error) {
      console.error('Error identificando patrones de proyecto:', error);
    }
  }

  /**
   * Actualiza las opciones típicas para un tipo de proyecto
   */
  private updateTypicalOptions(projectResult: any, patternData: any): void {
    const options = projectResult.options || {};
    
    // Para cada opción en el proyecto
    for (const [key, value] of Object.entries(options)) {
      if (!patternData.typicalOptions[key]) {
        patternData.typicalOptions[key] = {
          values: {},
          mostCommon: value
        };
      }
      
      // Incrementar contador para este valor
      if (!patternData.typicalOptions[key].values[value as string]) {
        patternData.typicalOptions[key].values[value as string] = 0;
      }
      patternData.typicalOptions[key].values[value as string] += 1;
      
      // Actualizar valor más común
      let maxCount = 0;
      for (const [optVal, count] of Object.entries(patternData.typicalOptions[key].values)) {
        if ((count as number) > maxCount) {
          maxCount = count as number;
          patternData.typicalOptions[key].mostCommon = optVal;
        }
      }
    }
  }

  /**
   * Actualiza los materiales típicos para un tipo de proyecto
   */
  private updateTypicalMaterials(projectResult: any, patternData: any): void {
    const materials = projectResult.materials || [];
    
    for (const material of materials) {
      const materialKey = material.name;
      
      if (!patternData.typicalMaterials[materialKey]) {
        patternData.typicalMaterials[materialKey] = {
          count: 0,
          averageQuantity: 0,
          categories: {}
        };
      }
      
      // Actualizar contadores
      patternData.typicalMaterials[materialKey].count += 1;
      
      // Actualizar cantidad promedio
      const currentTotal = patternData.typicalMaterials[materialKey].averageQuantity * 
                          (patternData.typicalMaterials[materialKey].count - 1);
      const newTotal = currentTotal + material.quantity;
      patternData.typicalMaterials[materialKey].averageQuantity = 
        newTotal / patternData.typicalMaterials[materialKey].count;
      
      // Actualizar categorías
      if (material.category) {
        if (!patternData.typicalMaterials[materialKey].categories[material.category]) {
          patternData.typicalMaterials[materialKey].categories[material.category] = 0;
        }
        patternData.typicalMaterials[materialKey].categories[material.category] += 1;
      }
    }
  }

  /**
   * Actualiza la estacionalidad para un tipo de proyecto
   */
  private updateSeasonality(projectResult: any, patternData: any): void {
    const month = new Date().getMonth() + 1; // 1-12
    const season = this.getSeason(month);
    
    if (!patternData.seasonality[season]) {
      patternData.seasonality[season] = 0;
    }
    
    patternData.seasonality[season] += 1;
  }

  /**
   * Determina la estación basada en el mes
   */
  private getSeason(month: number): string {
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'fall';
    return 'winter';
  }

  /**
   * Utiliza IA para análisis avanzado de patrones
   */
  private async analyzeProjectPatternsWithAI(projectResult: any, knowledgeBase: any): Promise<void> {
    try {
      // Preparar datos para el análisis
      const projectsForAnalysis = [
        ...knowledgeBase.completedProjects.slice(-10), // Últimos 10 proyectos
        projectResult // Proyecto actual
      ];
      
      // Construir prompt para análisis
      const prompt = this.buildPatternAnalysisPrompt(projectsForAnalysis);
      
      // Llamar al servicio de IA para analizar patrones
      const analysisResult = await this.aiService.smartComplete({
        prompt,
        complexity: 'high',
        promptLength: prompt.length,
        requiresFactualAccuracy: true
      });
      
      // Procesar respuesta para extraer patrones identificados
      const patterns = this.extractPatternsFromAIResponse(analysisResult);
      
      // Actualizar patrones en la base de conocimiento
      if (patterns.seasonal && Object.keys(patterns.seasonal).length > 0) {
        knowledgeBase.projectPatterns.seasonal = {
          ...knowledgeBase.projectPatterns.seasonal,
          ...patterns.seasonal
        };
      }
      
      console.log('Análisis de patrones con IA completado');
    } catch (error) {
      console.error('Error en análisis de patrones con IA:', error);
    }
  }

  /**
   * Construye un prompt para análisis de patrones
   */
  private buildPatternAnalysisPrompt(projects: any[]): string {
    let prompt = `You are a construction industry expert. Analyze the following ${projects.length} construction projects to identify patterns, trends, and insights that could help improve future estimates. Focus on:

1. Seasonal trends in project types and materials
2. Relationships between project options and material quantities
3. Hidden patterns that might not be obvious but could affect cost or timeline

Here are the projects:\n\n`;

    // Añadir datos de los proyectos en formato JSON
    prompt += JSON.stringify(projects, null, 2);

    prompt += `\n\nProvide your analysis in the following JSON format:
{
  "seasonal": {
    "spring": ["Pattern 1", "Pattern 2"],
    "summer": ["Pattern 1", "Pattern 2"],
    "fall": ["Pattern 1", "Pattern 2"],
    "winter": ["Pattern 1", "Pattern 2"]
  },
  "materialRelationships": [
    {
      "if": "condition (e.g., height > 6)",
      "then": "effect (e.g., require 30% more concrete)"
    }
  ],
  "hiddenPatterns": [
    "Pattern 1",
    "Pattern 2"
  ]
}

Be specific and focus on actionable insights that could improve estimation accuracy.`;

    return prompt;
  }

  /**
   * Extrae patrones de la respuesta de IA
   */
  private extractPatternsFromAIResponse(aiResponse: string): any {
    try {
      // Extraer JSON de la respuesta
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('No se pudo extraer JSON de la respuesta de IA');
        return { seasonal: {}, materialRelationships: [], hiddenPatterns: [] };
      }
      
      const patternsJson = jsonMatch[0];
      return JSON.parse(patternsJson);
    } catch (error) {
      console.error('Error al parsear patrones de la respuesta de IA:', error);
      return { seasonal: {}, materialRelationships: [], hiddenPatterns: [] };
    }
  }

  /**
   * Actualiza precios de materiales en la base de conocimiento
   */
  private async updateMaterialPrices(projectResult: any, knowledgeBase: any): Promise<void> {
    try {
      // Lista de materiales del proyecto actual
      const materials = projectResult.materials || [];
      
      // Actualizar precios para cada material
      for (const material of materials) {
        const materialKey = material.name;
        
        if (!knowledgeBase.materialPrices.tracked[materialKey]) {
          knowledgeBase.materialPrices.tracked[materialKey] = {
            prices: [],
            averagePrice: 0,
            trend: 'stable'
          };
        }
        
        // Añadir precio actual
        if (material.unitPrice) {
          knowledgeBase.materialPrices.tracked[materialKey].prices.push({
            price: material.unitPrice,
            date: new Date().toISOString()
          });
          
          // Limitar historial de precios (últimos 10)
          if (knowledgeBase.materialPrices.tracked[materialKey].prices.length > 10) {
            knowledgeBase.materialPrices.tracked[materialKey].prices.shift();
          }
          
          // Calcular precio promedio
          const prices = knowledgeBase.materialPrices.tracked[materialKey].prices.map(p => p.price);
          const sum = prices.reduce((a, b) => a + b, 0);
          knowledgeBase.materialPrices.tracked[materialKey].averagePrice = sum / prices.length;
          
          // Determinar tendencia
          if (prices.length >= 3) {
            const recentAvg = (prices[prices.length - 1] + prices[prices.length - 2]) / 2;
            const olderAvg = (prices[0] + prices[1]) / 2;
            
            if (recentAvg > olderAvg * 1.05) {
              knowledgeBase.materialPrices.tracked[materialKey].trend = 'increasing';
            } else if (recentAvg < olderAvg * 0.95) {
              knowledgeBase.materialPrices.tracked[materialKey].trend = 'decreasing';
            } else {
              knowledgeBase.materialPrices.tracked[materialKey].trend = 'stable';
            }
          }
        }
      }
      
      // Actualizar fecha de última actualización
      knowledgeBase.materialPrices.lastUpdated = new Date().toISOString();
      
      console.log('Precios de materiales actualizados');
    } catch (error) {
      console.error('Error actualizando precios de materiales:', error);
    }
  }

  /**
   * Actualiza tarifas de mano de obra en la base de conocimiento
   */
  private async updateLaborRates(projectResult: any, knowledgeBase: any): Promise<void> {
    try {
      // Lista de servicios del proyecto actual
      const services = projectResult.services || [];
      
      // Actualizar tarifas para cada servicio
      for (const service of services) {
        const serviceKey = service.name;
        const isSpecialized = service.category?.toLowerCase().includes('specialized') || false;
        
        // Determinar categoría de tarifa (estándar o especializada)
        const rateCategory = isSpecialized ? 'specialized' : 'standard';
        
        if (!knowledgeBase.laborRates[rateCategory][serviceKey]) {
          knowledgeBase.laborRates[rateCategory][serviceKey] = {
            rates: [],
            averageRate: 0,
            trend: 'stable'
          };
        }
        
        // Añadir tarifa actual
        if (service.hourlyRate) {
          knowledgeBase.laborRates[rateCategory][serviceKey].rates.push({
            rate: service.hourlyRate,
            date: new Date().toISOString()
          });
          
          // Limitar historial de tarifas (últimas 10)
          if (knowledgeBase.laborRates[rateCategory][serviceKey].rates.length > 10) {
            knowledgeBase.laborRates[rateCategory][serviceKey].rates.shift();
          }
          
          // Calcular tarifa promedio
          const rates = knowledgeBase.laborRates[rateCategory][serviceKey].rates.map(r => r.rate);
          const sum = rates.reduce((a, b) => a + b, 0);
          knowledgeBase.laborRates[rateCategory][serviceKey].averageRate = sum / rates.length;
          
          // Determinar tendencia
          if (rates.length >= 3) {
            const recentAvg = (rates[rates.length - 1] + rates[rates.length - 2]) / 2;
            const olderAvg = (rates[0] + rates[1]) / 2;
            
            if (recentAvg > olderAvg * 1.05) {
              knowledgeBase.laborRates[rateCategory][serviceKey].trend = 'increasing';
            } else if (recentAvg < olderAvg * 0.95) {
              knowledgeBase.laborRates[rateCategory][serviceKey].trend = 'decreasing';
            } else {
              knowledgeBase.laborRates[rateCategory][serviceKey].trend = 'stable';
            }
          }
        }
      }
      
      // Actualizar fecha de última actualización
      knowledgeBase.laborRates.lastUpdated = new Date().toISOString();
      
      console.log('Tarifas de mano de obra actualizadas');
    } catch (error) {
      console.error('Error actualizando tarifas de mano de obra:', error);
    }
  }

  /**
   * Obtiene recomendaciones personalizadas para un nuevo proyecto
   */
  async getRecommendationsForProject(projectType: string, projectSubtype: string, dimensions: any): Promise<any> {
    try {
      // Cargar base de conocimiento
      const knowledgeBase = await this.loadKnowledgeBase();
      
      // Construir prompt para recomendaciones
      const prompt = this.buildRecommendationsPrompt(projectType, projectSubtype, dimensions, knowledgeBase);
      
      // Llamar al servicio de IA para obtener recomendaciones
      const recommendations = await this.aiService.smartComplete({
        prompt,
        complexity: 'medium',
        promptLength: prompt.length,
        requiresFactualAccuracy: true
      });
      
      // Extraer recomendaciones estructuradas
      return this.extractRecommendationsFromAIResponse(recommendations);
    } catch (error) {
      console.error('Error obteniendo recomendaciones:', error);
      return {
        options: {},
        materials: [],
        pricing: {},
        timeline: {}
      };
    }
  }

  /**
   * Construye un prompt para recomendaciones
   */
  private buildRecommendationsPrompt(
    projectType: string, 
    projectSubtype: string, 
    dimensions: any,
    knowledgeBase: any
  ): string {
    // Obtener patrones relacionados con este tipo de proyecto
    const projectKey = `${projectType}_${projectSubtype}`;
    const relevantPatterns = knowledgeBase.projectPatterns.common[projectKey] || {};
    
    // Obtener proyectos similares completados
    const similarProjects = knowledgeBase.completedProjects.filter(
      (p: any) => p.projectType === projectType && p.projectSubtype === projectSubtype
    );
    
    // Construcción del prompt
    let prompt = `You are a construction expert specialized in ${projectType} projects. Based on historical data from a contractor, provide personalized recommendations for a new ${projectSubtype} ${projectType} project with the following dimensions:\n\n`;
    
    // Añadir dimensiones
    prompt += `Dimensions:\n${JSON.stringify(dimensions, null, 2)}\n\n`;
    
    // Añadir información de patrones si está disponible
    if (Object.keys(relevantPatterns).length > 0) {
      prompt += `Historical patterns for this project type:\n${JSON.stringify(relevantPatterns, null, 2)}\n\n`;
    }
    
    // Añadir proyectos similares (máximo 3)
    if (similarProjects.length > 0) {
      prompt += `Similar completed projects (${Math.min(3, similarProjects.length)}):\n${
        JSON.stringify(similarProjects.slice(0, 3), null, 2)
      }\n\n`;
    }
    
    // Añadir información de tendencias de precios
    prompt += `Current material price trends:\n${JSON.stringify(knowledgeBase.materialPrices.tracked, null, 2)}\n\n`;
    
    prompt += `Based on this historical data, provide recommendations in the following JSON format:
{
  "options": {
    "optionName1": "recommendedValue1",
    "optionName2": "recommendedValue2"
  },
  "materials": [
    {
      "name": "Recommended material",
      "reason": "Why this is recommended"
    }
  ],
  "pricing": {
    "recommendedMarkup": 0,
    "pricingStrategy": "Description of recommended pricing approach"
  },
  "timeline": {
    "estimatedDays": 0,
    "seasonalConsiderations": "Any seasonal factors to consider"
  }
}

Ensure your recommendations are specific, practical, and directly based on the historical data provided.`;

    return prompt;
  }

  /**
   * Extrae recomendaciones de la respuesta de IA
   */
  private extractRecommendationsFromAIResponse(aiResponse: string): any {
    try {
      // Extraer JSON de la respuesta
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('No se pudo extraer JSON de la respuesta de IA');
        return {
          options: {},
          materials: [],
          pricing: {},
          timeline: {}
        };
      }
      
      const recommendationsJson = jsonMatch[0];
      return JSON.parse(recommendationsJson);
    } catch (error) {
      console.error('Error al parsear recomendaciones de la respuesta de IA:', error);
      return {
        options: {},
        materials: [],
        pricing: {},
        timeline: {}
      };
    }
  }
}
