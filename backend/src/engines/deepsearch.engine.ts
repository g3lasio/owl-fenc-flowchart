import { BaseEngine } from './base.engine';
import { OpenAIClient } from '../services/openai.client';
import { AnthropicClient } from '../services/anthropic.client';
import { FenceDimensions, FenceOptions, FenceType, RequiredMaterial, Location, ProjectResult, RequiredService } from '../interfaces/fence.interfaces';
import { MaterialCache } from '../interfaces/calculators.interfaces';
import { PriceApiService } from '../services/price-api.service';
import { PriceResearchService } from '../services/price-research.service';
import { ConstructionMethodService } from '../services/construction-method.service';
import { PersistentCacheService } from '../services/persistent-cache.service';
import { config } from '../config/config';
import { MaterialCalculator } from './materials/material-calculator.helper';
import { PricingCalculator } from './materials/pricing-calculator.helper';
import { TimeEstimator } from './materials/time-estimator.helper';

/**
 * Advanced DeepSearch Engine with parallel processing and optimizations
 * for accurate and fast estimates
 */
export class DeepSearchEngine extends BaseEngine {
  private materialCache: PersistentCacheService;
  private materialCalculator: MaterialCalculator;
  private pricingCalculator: PricingCalculator;
  private timeEstimator: TimeEstimator;
  
  constructor(
    private readonly openAIClient: OpenAIClient,
    private readonly anthropicClient: AnthropicClient,
    private readonly priceApiService: PriceApiService,
    private readonly priceResearchService: PriceResearchService,
    private readonly constructionMethodService: ConstructionMethodService
  ) {
    super('DeepSearchEngine');
    
    // Initialize persistent cache for improved performance
    this.materialCache = new PersistentCacheService(config.cache.cachePath);
    
    // Initialize helper classes
    this.materialCalculator = new MaterialCalculator(this.priceApiService);
    this.pricingCalculator = new PricingCalculator(this.priceResearchService);
    this.timeEstimator = new TimeEstimator();
    
    // Check API keys configuration
    this.checkApiKeys();
  }

  /**
   * Verifies that necessary API keys are configured
   */
  private checkApiKeys(): void {
    if (!config.openai.apiKey) {
      this.logWarning('OpenAI API key not configured. Some functions will have limited performance.');
    }
    
    if (!config.anthropic.apiKey) {
      this.logWarning('Anthropic API key not configured. Some functions will have limited performance.');
    }
  }
  
  /**
   * Analyzes a project to generate a complete estimate
   * Uses parallel processing to maximize efficiency
   */
  async analyzeProject(
    projectType: string, 
    projectSubtype: string, 
    dimensions: any, 
    options: any, 
    location: Location
  ): Promise<ProjectResult> {
    return this.measurePerformance('analyzeProject', async () => {
      // Create cache key
      const cacheKey = this.generateCacheKey(projectType, projectSubtype, dimensions, options, location);
      
      // Check cache
      const cachedResult = this.materialCache.get<ProjectResult>(cacheKey);
      if (cachedResult) {
        this.logInfo('Using cached result for:', projectType, projectSubtype);
        return cachedResult;
      }
      
      try {
        // Validate input parameters
        this.validateProjectInputs(projectType, projectSubtype, dimensions, location);
        
        // Normalize input data
        const normalizedDimensions = this.normalizeDimensions(dimensions, projectType);
        const normalizedOptions = this.normalizeOptions(options, projectType, projectSubtype);
        
        // PARALLEL PROCESSING: Execute independent tasks simultaneously
        this.logInfo('Starting parallel project analysis...');
        
        const [
          materialsAndPrices,
          constructionMethod,
          regionalPricing
        ] = await Promise.all([
          this.analyzeMaterialsAndPrices(projectType, projectSubtype, normalizedDimensions, normalizedOptions, location),
          this.getConstructionMethod(projectType, projectSubtype, normalizedDimensions, normalizedOptions, location),
          this.pricingCalculator.getRegionalPricingData(projectType, projectSubtype, location, normalizedOptions)
        ]);
        
        // Process results from parallel tasks
        const { materials, services } = materialsAndPrices;
        const { pricePerFoot, hasGates } = regionalPricing;
        
        // Calculate costs
        const materialCost = this.materialCalculator.calculateMaterialCost(materials);
        const laborCost = this.materialCalculator.calculateLaborCost(services);
        const equipmentCost = this.materialCalculator.calculateEquipmentCost(services);
        
        // Calculate total price based on linear foot with adjustments
        const totalPrice = this.pricingCalculator.calculateTotalPriceFromLinearFoot(
          pricePerFoot,
          normalizedDimensions,
          normalizedOptions
        );
        
        // Calculate implied markup based on the difference between price per linear foot
        // and calculated costs
        const totalDirectCost = materialCost + laborCost + equipmentCost;
        const impliedMarkup = Math.max(0, totalPrice.totalCost - totalDirectCost);
        const recommendedMarkup = impliedMarkup / totalDirectCost || this.pricingCalculator.getDefaultMarkup(projectType);
        
        // Project time estimation
        const timeEstimate = this.timeEstimator.calculateTimeEstimate(services, projectType, normalizedDimensions);
        
        // Build final result
        const result: ProjectResult = {
          materials,
          services,
          materialCost,
          laborCost, 
          equipmentCost,
          recommendedMarkup,
          totalCost: totalPrice.totalCost,
          pricePerUnit: totalPrice.pricePerUnit,
          constructionMethod,
          timeEstimate
        };
        
        // Save to cache with configured TTL
        this.materialCache.set(
          cacheKey, 
          result, 
          config.cache.ttlSeconds,
          config.cache.persistToDisk
        );
        
        return result;
      } catch (error) {
        this.logError('Error in DeepSearchEngine.analyzeProject:', error);
        throw this.handleError(error, 'Failed to analyze project');
      }
    });
  }
  
  /**
   * Optimized method to analyze materials and prices in parallel
   */
  private async analyzeMaterialsAndPrices(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    location: Location
  ): Promise<{materials: RequiredMaterial[], services: RequiredService[]}> {
    return this.measurePerformance('analyzeMaterialsAndPrices', async () => {
      try {
        // Delegate to material calculator
        return this.materialCalculator.calculateMaterialsAndServices(
          projectType,
          projectSubtype,
          dimensions,
          options,
          location
        );
      } catch (error) {
        this.logError('Error analyzing materials and prices:', error);
        throw this.handleError(error, 'Failed to analyze materials and services');
      }
    });
  }

  // Other methods moved to specialized helper classes...
}