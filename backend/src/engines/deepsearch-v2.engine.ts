import { BaseEngine } from './base.engine';
import { AIServiceV2 } from '../services/ai-service-v2';
import { AIProviderFactory } from '../factories/ai-provider.factory';
import { AICapability } from '../interfaces/ai-provider.interfaces';
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
import { ContractorProfileService, MaterialPreference } from '../services/contractor-profile.service';
import { AdaptiveLearningEngine } from './adaptive-learning.engine';

/**
 * Advanced DeepSearch Engine with parallel processing and optimizations
 * for accurate and fast estimates, enhanced with contractor-specific learning
 * 
 * This version uses the new AIServiceV2 with provider abstractions
 */
export class DeepSearchEngineV2 extends BaseEngine {
  private materialCache: PersistentCacheService;
  private materialCalculator: MaterialCalculator;
  private pricingCalculator: PricingCalculator;
  private timeEstimator: TimeEstimator;
  private adaptiveLearningEngine: AdaptiveLearningEngine | null = null;
  private contractorProfileService: ContractorProfileService | null = null;
  private aiService: AIServiceV2;

  constructor(
    private readonly priceApiService: PriceApiService,
    private readonly priceResearchService: PriceResearchService,
    private readonly constructionMethodService: ConstructionMethodService,
    contractorProfileService?: ContractorProfileService,
    contractorId?: string
  ) {
    super('DeepSearchEngineV2');

    // Initialize AI service
    this.aiService = new AIServiceV2();

    // Initialize persistent cache for improved performance
    this.materialCache = new PersistentCacheService(config.cache.cachePath);

    // Initialize helper classes
    // Note: We'd need to update MaterialCalculator to use AIServiceV2
    this.materialCalculator = new MaterialCalculator(
      this.priceApiService,
      null, // openAIClient - to be replaced with AIServiceV2
      null  // anthropicClient - to be replaced with AIServiceV2
    );
    this.pricingCalculator = new PricingCalculator(this.priceResearchService);
    this.timeEstimator = new TimeEstimator();

    // Initialize contractor profile service if provided
    if (contractorProfileService) {
      this.contractorProfileService = contractorProfileService;

      // Initialize adaptive learning engine if contractor ID is provided
      if (contractorId) {
        // Note: AdaptiveLearningEngine would need to be updated to use AIServiceV2
        this.adaptiveLearningEngine = new AdaptiveLearningEngine(
          null, // openAIClient - to be replaced with AIServiceV2
          null, // anthropicClient - to be replaced with AIServiceV2
          contractorId
        );
        this.logInfo('Adaptive learning engine initialized for contractor:', contractorId);
      }
    }

    // Check AI provider availability
    this.checkAIProviders();
  }

  /**
   * Verifies that necessary AI providers are configured
   */
  private checkAIProviders(): void {
    const providerFactory = AIProviderFactory.getInstance();
    const availableProviders = providerFactory.getAllProviders();
    
    if (availableProviders.size === 0) {
      this.logWarning('No AI providers configured. Most functions will not work properly.');
      return;
    }
    
    this.logInfo(`Available AI providers: ${Array.from(availableProviders.keys()).join(', ')}`);
    
    // Check for specific capabilities
    if (!this.aiService.hasCapability(AICapability.EMBEDDINGS)) {
      this.logWarning('No AI provider with embeddings capability. Vector search functions will be limited.');
    }
    
    if (!this.aiService.hasCapability(AICapability.VISION)) {
      this.logWarning('No AI provider with vision capability. Image analysis will not be available.');
    }
  }

  /**
   * Analyzes a project to generate a complete estimate
   * Uses parallel processing to maximize efficiency
   * Now supports ANY type of construction project through dynamic research
   * and incorporates contractor-specific preferences and learning
   */
  async analyzeProject(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    location: Location,
    contractorId?: string,
    clientId?: string
  ): Promise<ProjectResult> {
    return this.measurePerformance('analyzeProject', async () => {
      // Create cache key
      const cacheKey = this.generateCacheKey(projectType, projectSubtype, dimensions, options, location);
      
      // Check cache first
      const cachedResult = await this.getCachedResult(cacheKey);
      if (cachedResult) {
        this.logInfo('Retrieved cached result for project analysis');
        return cachedResult;
      }
      
      this.logInfo(`Analyzing ${projectType} project: ${projectSubtype}`);
      
      // Get contractor preferences if available
      const materialPreferences = contractorId && this.contractorProfileService 
        ? await this.contractorProfileService.getMaterialPreferences(contractorId, projectType)
        : null;
        
      // Begin analysis - first determine required materials
      const materials = await this.determineRequiredMaterials(
        projectType, 
        projectSubtype,
        dimensions,
        options,
        materialPreferences
      );
      
      // Calculate labor requirements
      const services = await this.determineRequiredServices(
        projectType,
        projectSubtype, 
        dimensions,
        options,
        location
      );
      
      // Calculate pricing
      const pricing = await this.calculateProjectPricing(materials, services, location);
      
      // Calculate timeline
      const timeline = await this.estimateProjectTimeline(materials, services);
      
      // Construct result
      const result: ProjectResult = {
        projectType,
        projectSubtype,
        dimensions,
        options,
        location,
        materials,
        services,
        pricing,
        timeline,
        generatedAt: new Date().toISOString()
      };
      
      // Cache result
      await this.cacheResult(cacheKey, result);
      
      // If we have adaptive learning enabled, send this result for learning
      if (contractorId && this.adaptiveLearningEngine) {
        this.adaptiveLearningEngine.learnFromProject(result, contractorId).catch(err => {
          this.logError('Error during adaptive learning:', err);
        });
      }
      
      return result;
    });
  }
  
  /**
   * Generates a cache key for a project analysis
   */
  private generateCacheKey(
    projectType: string, 
    projectSubtype: string, 
    dimensions: any, 
    options: any, 
    location: Location
  ): string {
    const data = {
      projectType,
      projectSubtype,
      dimensions,
      options,
      location: {
        city: location.city,
        state: location.state,
        country: location.country
      }
    };
    
    return `project:${projectType}:${projectSubtype}:${JSON.stringify(data)}`;
  }

  /**
   * Retrieves a cached result if available
   */
  private async getCachedResult(cacheKey: string): Promise<ProjectResult | null> {
    try {
      const cached = await this.materialCache.get(cacheKey);
      return cached ? (cached as ProjectResult) : null;
    } catch (err) {
      this.logWarning('Error retrieving from cache:', err);
      return null;
    }
  }

  /**
   * Caches a project result
   */
  private async cacheResult(cacheKey: string, result: ProjectResult): Promise<void> {
    try {
      await this.materialCache.set(cacheKey, result, 60 * 60 * 24 * 7); // Cache for 7 days
    } catch (err) {
      this.logWarning('Error caching result:', err);
    }
  }

  /**
   * Determines the required materials for a project using AI
   */
  private async determineRequiredMaterials(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    materialPreferences: MaterialPreference[] | null
  ): Promise<RequiredMaterial[]> {
    // Build a comprehensive prompt for the AI
    const prompt = this.buildMaterialAnalysisPrompt(
      projectType,
      projectSubtype,
      dimensions,
      options,
      materialPreferences
    );
    
    // Use our new AIService for completion
    const response = await this.aiService.smartComplete({
      prompt,
      complexity: 'high', // This is a complex analysis
      promptLength: prompt.length,
      requiresFactualAccuracy: true
    });
    
    // Parse the response into structured material data
    return this.parseMaterialResponse(response);
  }
  
  /**
   * Builds a comprehensive prompt for material analysis
   */
  private buildMaterialAnalysisPrompt(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    materialPreferences: MaterialPreference[] | null
  ): string {
    // Build a detailed prompt for the model
    let prompt = `Analyze the following ${projectType} project (${projectSubtype}) and provide a detailed list of all required materials with quantities.\n\n`;
    
    // Add dimensions
    prompt += `Dimensions:\n${JSON.stringify(dimensions, null, 2)}\n\n`;
    
    // Add options
    prompt += `Options and Specifications:\n${JSON.stringify(options, null, 2)}\n\n`;
    
    // Add contractor preferences if available
    if (materialPreferences && materialPreferences.length > 0) {
      prompt += `Contractor Material Preferences:\n${JSON.stringify(materialPreferences, null, 2)}\n\n`;
    }
    
    // Add instructions for output format
    prompt += `Please provide a comprehensive and detailed list of ALL required materials, including primary materials, fasteners, concrete, and auxiliary materials. For each material, include quantity, unit of measure, and purpose.\n`;
    prompt += `Format your response as a valid JSON array of material objects with the properties: name, description, quantity, unit, purpose, and category.\n`;
    
    return prompt;
  }
  
  /**
   * Parses the AI response into structured material data
   */
  private parseMaterialResponse(response: string): RequiredMaterial[] {
    try {
      // Extract JSON from the response (handling potential text before/after the JSON)
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logError('Failed to extract JSON from AI response');
        return [];
      }
      
      const materialsJson = jsonMatch[0];
      const materials = JSON.parse(materialsJson) as RequiredMaterial[];
      
      // Validate each material has the required properties
      return materials.filter(material => {
        const isValid = material.name && material.quantity && material.unit;
        if (!isValid) {
          this.logWarning(`Skipping invalid material: ${JSON.stringify(material)}`);
        }
        return isValid;
      });
    } catch (err) {
      this.logError('Error parsing material response:', err);
      return [];
    }
  }

  /**
   * Determines the required services (labor) for a project
   */
  private async determineRequiredServices(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    location: Location
  ): Promise<RequiredService[]> {
    // Implementation similar to determineRequiredMaterials but for services
    // Would use AIServiceV2 for completion
    
    // Placeholder implementation
    return [];
  }

  /**
   * Calculates project pricing based on materials and services
   */
  private async calculateProjectPricing(
    materials: RequiredMaterial[],
    services: RequiredService[],
    location: Location
  ): Promise<any> {
    // Implementation would use the pricing calculator
    // Placeholder implementation
    return {
      materialsCost: 0,
      laborCost: 0,
      additionalCosts: 0,
      subtotal: 0,
      tax: 0,
      total: 0,
      priceBreakdown: {}
    };
  }

  /**
   * Estimates project timeline based on materials and services
   */
  private async estimateProjectTimeline(
    materials: RequiredMaterial[],
    services: RequiredService[]
  ): Promise<any> {
    // Implementation would use the time estimator
    // Placeholder implementation
    return {
      estimatedDays: 0,
      phases: []
    };
  }
}
