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
import { ContractorProfileService, MaterialPreference } from '../services/contractor-profile.service';
import { AdaptiveLearningEngine } from './adaptive-learning.engine';

/**
 * Advanced DeepSearch Engine with parallel processing and optimizations
 * for accurate and fast estimates, enhanced with contractor-specific learning
 */
export class DeepSearchEngine extends BaseEngine {
  private materialCache: PersistentCacheService;
  private materialCalculator: MaterialCalculator;
  private pricingCalculator: PricingCalculator;
  private timeEstimator: TimeEstimator;
  private adaptiveLearningEngine: AdaptiveLearningEngine | null = null;
  private contractorProfileService: ContractorProfileService | null = null;

  constructor(
    private readonly openAIClient: OpenAIClient,
    private readonly anthropicClient: AnthropicClient,
    private readonly priceApiService: PriceApiService,
    private readonly priceResearchService: PriceResearchService,
    private readonly constructionMethodService: ConstructionMethodService,
    contractorProfileService?: ContractorProfileService,
    contractorId?: string
  ) {
    super('DeepSearchEngine');

    // Initialize persistent cache for improved performance
    this.materialCache = new PersistentCacheService(config.cache.cachePath);

    // Initialize helper classes - now passing AI clients to enable dynamic research
    this.materialCalculator = new MaterialCalculator(
      this.priceApiService,
      this.openAIClient,
      this.anthropicClient
    );
    this.pricingCalculator = new PricingCalculator(this.priceResearchService);
    this.timeEstimator = new TimeEstimator();

    // Initialize contractor profile service if provided
    if (contractorProfileService) {
      this.contractorProfileService = contractorProfileService;

      // Initialize adaptive learning engine if contractor ID is provided
      if (contractorId) {
        this.adaptiveLearningEngine = new AdaptiveLearningEngine(
          this.openAIClient,
          this.anthropicClient,
          contractorId
        );
        this.logInfo('Adaptive learning engine initialized for contractor:', contractorId);
      }
    }

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

        // Get contractor-specific recommendations if available
        let recommendedMaterials: string[] = [];
        let recommendedMarkup: number | null = null;
        let contractorPreferences: MaterialPreference[] = [];

        // If we have a contractor ID and the services are initialized, get recommendations
        if (contractorId && this.adaptiveLearningEngine && this.contractorProfileService) {
          try {
            // Get contractor-specific recommendations from adaptive learning engine
            const recommendations = await this.adaptiveLearningEngine.generateRecommendations(
              projectType,
              {
                type: projectType,
                subtype: projectSubtype,
                dimensions: normalizedDimensions,
                ...normalizedOptions
              },
              clientId
            );

            recommendedMaterials = recommendations.recommendedMaterials;
            recommendedMarkup = recommendations.suggestedMarkup;

            // Get contractor's material preferences for this project type
            contractorPreferences = await this.contractorProfileService.getMaterialPreferences(
              contractorId,
              projectType,
              projectSubtype
            );

            this.logInfo('Using contractor-specific recommendations for:', projectType);
          } catch (error) {
            this.logWarning('Error getting contractor recommendations:', error);
            // Continue without recommendations if there's an error
          }
        }

        // Apply contractor preferences to options if available
        const enhancedOptions = this.applyContractorPreferences(
          normalizedOptions,
          contractorPreferences,
          recommendedMaterials
        );

        // PARALLEL PROCESSING: Execute independent tasks simultaneously
        this.logInfo('Starting parallel project analysis...');

        const [
          materialsAndPrices,
          constructionMethod,
          regionalPricing
        ] = await Promise.all([
          this.analyzeMaterialsAndPrices(projectType, projectSubtype, normalizedDimensions, enhancedOptions, location),
          this.getConstructionMethod(projectType, projectSubtype, normalizedDimensions, enhancedOptions, location),
          this.pricingCalculator.getRegionalPricingData(projectType, projectSubtype, location, enhancedOptions)
        ]);

        // Process results from parallel tasks
        const { materials, services } = materialsAndPrices;
        const { pricePerFoot, hasGates } = regionalPricing;

        // Calculate costs
        const materialCost = this.materialCalculator.calculateMaterialCost(materials);
        const laborCost = this.materialCalculator.calculateLaborCost(services);
        const equipmentCost = this.materialCalculator.calculateEquipmentCost(services);

        // Apply contractor-specific service rates if available
        let adjustedLaborCost = laborCost;
        if (contractorId && this.contractorProfileService) {
          adjustedLaborCost = await this.applyContractorServiceRates(
            services,
            contractorId,
            projectType
          );
        }

        // Calculate total price based on linear foot or square foot with adjustments
        let totalPrice;
        // For some project types we need to change how we calculate total price
        if (this.isLinearFootProject(projectType)) {
          totalPrice = this.pricingCalculator.calculateTotalPriceFromLinearFoot(
            pricePerFoot,
            normalizedDimensions,
            enhancedOptions
          );
        } else {
          // For other project types, use square foot or direct calculation
          totalPrice = this.calculateTotalPriceForNonLinearProject(
            projectType,
            normalizedDimensions,
            materialCost,
            adjustedLaborCost,
            equipmentCost
          );
        }

        // Apply contractor-specific markup if available
        if (recommendedMarkup !== null) {
          const totalDirectCost = materialCost + adjustedLaborCost + equipmentCost;
          totalPrice.totalCost = totalDirectCost * (1 + recommendedMarkup);
        }

        // Calculate implied markup based on the difference between price and costs
        const totalDirectCost = materialCost + adjustedLaborCost + equipmentCost;
        const impliedMarkup = Math.max(0, totalPrice.totalCost - totalDirectCost);
        const recommendedMarkupValue = recommendedMarkup !== null
          ? recommendedMarkup
          : (impliedMarkup / totalDirectCost || this.pricingCalculator.getDefaultMarkup(projectType));

        // Project time estimation
        const timeEstimate = this.timeEstimator.calculateTimeEstimate(services, projectType, normalizedDimensions);

        // Build final result
        const result: ProjectResult = {
          materials,
          services,
          materialCost,
          laborCost: adjustedLaborCost,
          equipmentCost,
          recommendedMarkup: recommendedMarkupValue,
          totalCost: totalPrice.totalCost,
          pricePerUnit: totalPrice.pricePerUnit,
          constructionMethod,
          timeEstimate,
          // Add info about contractor preferences used
          contractorPreferencesApplied: contractorPreferences.length > 0 || recommendedMaterials.length > 0
        };

        // Save to cache with configured TTL
        this.materialCache.set(
          cacheKey,
          result,
          config.cache.ttlSeconds,
          config.cache.persistToDisk
        );

        // Learn from this estimate if we have the learning engine
        if (contractorId && this.adaptiveLearningEngine) {
          // Fire and forget - don't await this
          this.adaptiveLearningEngine.learnFromEstimate(
            {
              materials: materials.map(m => ({
                id: m.name.replace(/\s+/g, '_').toLowerCase(),
                name: m.name,
                quantity: m.quantity,
                unit: m.unit,
                unitPrice: (m.cost || 0) / m.quantity,
                totalPrice: m.cost || 0
              })),
              services: services.map(s => ({
                name: s.name,
                hours: s.hours,
                hourlyRate: adjustedLaborCost / (services.reduce((total, s) => total + s.hours, 0) || 1),
                totalCost: s.hours * (adjustedLaborCost / (services.reduce((total, s) => total + s.hours, 0) || 1))
              })),
              materialCost,
              laborCost: adjustedLaborCost,
              equipmentCost,
              totalCost: totalPrice.totalCost
            },
            {
              type: projectType,
              subtype: projectSubtype,
              dimensions: normalizedDimensions,
              material: enhancedOptions.material || projectSubtype,
              style: enhancedOptions.style,
              color: enhancedOptions.color,
              finish: enhancedOptions.finish,
              demolition: enhancedOptions.tearDown,
              permitNeeded: enhancedOptions.permitRequired,
              gates: enhancedOptions.gates
            },
            {
              id: clientId || 'unknown',
              name: '',
              contact: {},
              location: location
            }
          ).catch(err => {
            this.logWarning('Error during learning from estimate:', err);
          });
        }

        return result;
      } catch (error) {
        this.logError('Error in DeepSearchEngine.analyzeProject:', error);
        throw this.handleError(error, 'Failed to analyze project');
      }
    });
  }

  /**
   * Apply contractor's preferred materials and methods to project options
   */
  private applyContractorPreferences(
    options: any,
    contractorPreferences: MaterialPreference[],
    recommendedMaterials: string[]
  ): any {
    // Create a copy to avoid modifying the original
    const enhancedOptions = { ...options };

    // If no specific preferences, return unmodified options
    if (contractorPreferences.length === 0 && recommendedMaterials.length === 0) {
      return enhancedOptions;
    }

    // Sort contractor preferences by weight (highest first)
    const sortedPreferences = [...contractorPreferences].sort(
      (a, b) => (b.preferenceWeight || 0) - (a.preferenceWeight || 0)
    );

    // Apply material preferences if any exist
    if (sortedPreferences.length > 0) {
      // Take the highest weight preference for material
      const topPreference = sortedPreferences[0];

      // Apply preferred material if not already specified
      if (!enhancedOptions.material && topPreference.materialName) {
        enhancedOptions.material = topPreference.materialName;
      }

      // Apply preferred supplier if available
      if (!enhancedOptions.preferredSupplier && topPreference.supplier) {
        enhancedOptions.preferredSupplier = topPreference.supplier;
      }

      // Add any notes as metadata
      if (topPreference.notes) {
        enhancedOptions.contractorNotes = topPreference.notes;
      }
    }

    // Apply recommended materials from learning engine if no specific preference
    if (recommendedMaterials.length > 0 && !enhancedOptions.material) {
      enhancedOptions.recommendedMaterials = recommendedMaterials;
      // Use top recommendation as default
      enhancedOptions.material = recommendedMaterials[0];
    }

    return enhancedOptions;
  }

  /**
   * Apply contractor-specific service rates to labor cost calculation
   */
  private async applyContractorServiceRates(
    services: RequiredService[],
    contractorId: string,
    projectType: string
  ): Promise<number> {
    if (!this.contractorProfileService) {
      // If no profile service, return original calculation
      return this.materialCalculator.calculateLaborCost(services);
    }

    try {
      // Get contractor's service rates
      const serviceRates = await this.contractorProfileService.getServiceRates(
        contractorId,
        projectType
      );

      // If no rates found, use default calculation
      if (serviceRates.length === 0) {
        return this.materialCalculator.calculateLaborCost(services);
      }

      // Calculate labor cost using contractor's specific rates
      let totalLaborCost = 0;

      for (const service of services) {
        // Find matching rate for this service
        const matchingRate = serviceRates.find(rate =>
          rate.serviceName.toLowerCase() === service.name.toLowerCase() ||
          service.name.toLowerCase().includes(rate.serviceName.toLowerCase())
        );

        if (matchingRate) {
          // Use contractor's specific rate
          totalLaborCost += service.hours * matchingRate.rate;
        } else {
          // Use default rate from config
          totalLaborCost += service.hours * config.estimator.laborCostPerHour;
        }
      }

      return totalLaborCost;
    } catch (error) {
      this.logWarning('Error applying contractor service rates:', error);
      // Fall back to default calculation
      return this.materialCalculator.calculateLaborCost(services);
    }
  }

  /**
   * Record feedback from the contractor about an estimate to improve future estimates
   */
  async recordContractorFeedback(
    contractorId: string,
    estimateId: string,
    feedback: {
      projectType: string;
      projectSubtype?: string;
      overallRating?: number;
      accuracyRating?: number;
      comments?: string;
      materialCorrections?: Array<{
        originalMaterial: string;
        correctMaterial: string;
        preferredSupplier?: string;
      }>;
      serviceRateCorrections?: Array<{
        serviceName: string;
        originalRate: number;
        correctRate: number;
      }>;
    }
  ): Promise<boolean> {
    if (!this.contractorProfileService) {
      this.logWarning('Cannot record feedback: Contractor profile service not initialized');
      return false;
    }

    try {
      // Record the feedback in the contractor's profile
      const success = await this.contractorProfileService.recordContractorFeedback(
        contractorId,
        estimateId,
        feedback
      );

      if (success) {
        this.logInfo('Contractor feedback recorded successfully for estimate:', estimateId);
      } else {
        this.logWarning('Failed to record contractor feedback for estimate:', estimateId);
      }

      return success;
    } catch (error) {
      this.logError('Error recording contractor feedback:', error);
      return false;
    }
  }

  /**
   * Update the contractor's profile when an estimate is approved or rejected
   */
  async updateContractorEstimateResult(
    contractorId: string,
    estimateId: string,
    wasApproved: boolean
  ): Promise<boolean> {
    if (!this.contractorProfileService) {
      this.logWarning('Cannot update estimate result: Contractor profile service not initialized');
      return false;
    }

    try {
      // Update the service rates based on whether the estimate was approved
      const success = await this.contractorProfileService.updateServiceRates(
        contractorId,
        estimateId,
        wasApproved
      );

      if (success) {
        this.logInfo(`Estimate ${estimateId} marked as ${wasApproved ? 'approved' : 'rejected'}`);
      } else {
        this.logWarning(`Failed to update estimate ${estimateId} result`);
      }

      return success;
    } catch (error) {
      this.logError('Error updating estimate result:', error);
      return false;
    }
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
  ): Promise<{ materials: RequiredMaterial[], services: RequiredService[] }> {
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

  /**
   * Check if project is measured primarily in linear feet
   */
  private isLinearFootProject(projectType: string): boolean {
    // Projects that are typically estimated by linear foot
    const linearFootProjects = ['fence', 'railing', 'gutter', 'trim', 'molding',
      'baseboard', 'siding', 'retaining wall'];

    return linearFootProjects.includes(projectType.toLowerCase());
  }

  /**
   * Calculate total price for projects not measured in linear feet
   */
  private calculateTotalPriceForNonLinearProject(
    projectType: string,
    dimensions: any,
    materialCost: number,
    laborCost: number,
    equipmentCost: number
  ): { totalCost: number, pricePerUnit: number } {
    const totalDirectCost = materialCost + laborCost + equipmentCost;
    let area = 0;
    let unit = 'sq ft';

    // Calculate area based on project type
    if (dimensions.squareFeet) {
      area = dimensions.squareFeet;
    } else if (dimensions.width && dimensions.length) {
      area = dimensions.width * dimensions.length;
    } else if (dimensions.area) {
      area = dimensions.area;
    } else {
      // Fall back to total cost if we don't have area
      return {
        totalCost: totalDirectCost * 1.25, // 25% profit margin
        pricePerUnit: 0
      };
    }

    // Add typical markup for this kind of project
    const markup = this.pricingCalculator.getDefaultMarkup(projectType);
    const totalCost = totalDirectCost * (1 + markup);

    return {
      totalCost,
      pricePerUnit: area > 0 ? totalCost / area : 0
    };
  }

  /**
   * Gets the construction method for a specific project
   */
  private async getConstructionMethod(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    location: Location
  ): Promise<string> {
    return this.measurePerformance('getConstructionMethod', async () => {
      try {
        // Try to get construction method from service
        return await this.constructionMethodService.getConstructionMethod(
          projectType,
          projectSubtype,
          dimensions,
          options,
          location
        );
      } catch (error) {
        this.logError('Error getting construction method:', error);
        // Provide a generic construction method if service fails
        return this.getGenericConstructionMethod(projectType, projectSubtype);
      }
    });
  }

  /**
   * Provides a generic construction method description when service fails
   */
  private getGenericConstructionMethod(projectType: string, projectSubtype: string): string {
    return `Standard professional installation of ${projectSubtype} ${projectType} following industry best practices and local building codes.`;
  }

  /**
   * Generates a cache key for a specific project calculation
   */
  private generateCacheKey(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    location: Location
  ): string {
    // Create a simplified version of the location to avoid cache misses due to minor differences
    const simplifiedLocation = {
      zipCode: location.zipCode,
      state: location.state
    };

    // Create key from project details
    return `${projectType.toLowerCase()}_${projectSubtype.toLowerCase()}_${JSON.stringify(dimensions)
      }_${JSON.stringify(options)
      }_${JSON.stringify(simplifiedLocation)
      }`;
  }

  /**
   * Validates project input parameters
   */
  private validateProjectInputs(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    location: Location
  ): void {
    if (!projectType) {
      throw new Error('Project type is required');
    }

    if (!projectSubtype) {
      throw new Error('Project subtype is required');
    }

    if (!dimensions || Object.keys(dimensions).length === 0) {
      throw new Error('Project dimensions are required');
    }

    // Location should have at least state or zip code
    if (!location || (!location.state && !location.zipCode)) {
      throw new Error('Project location (state or zip code) is required');
    }
  }

  /**
   * Normalizes project dimensions based on project type
   */
  private normalizeDimensions(dimensions: any, projectType: string): any {
    const normalizedDimensions = { ...dimensions };

    // Default conversions and validations
    if (this.isLinearFootProject(projectType)) {
      // For fencing and similar, ensure we have linear feet
      if (!normalizedDimensions.perimeter && normalizedDimensions.width && normalizedDimensions.length) {
        normalizedDimensions.perimeter = 2 * (normalizedDimensions.width + normalizedDimensions.length);
      }
    } else {
      // For area-based projects, ensure we have square feet
      if (!normalizedDimensions.squareFeet && normalizedDimensions.width && normalizedDimensions.length) {
        normalizedDimensions.squareFeet = normalizedDimensions.width * normalizedDimensions.length;
      }
    }

    return normalizedDimensions;
  }

  /**
   * Normalizes project options based on project type and subtype
   */
  private normalizeOptions(options: any, projectType: string, projectSubtype: string): any {
    // Create a copy of options to avoid modifying the original
    const normalizedOptions = { ...options };

    // Add default values based on project type
    switch (projectType.toLowerCase()) {
      case 'fence':
        if (!normalizedOptions.postSpacing) {
          normalizedOptions.postSpacing = 8; // Default 8 feet between posts
        }
        break;
      case 'roof':
      case 'roofing':
        if (!normalizedOptions.pitch) {
          normalizedOptions.pitch = '4:12'; // Default 4:12 pitch
        }
        break;
      case 'deck':
        if (!normalizedOptions.height) {
          normalizedOptions.height = 3; // Default 3 feet off ground
        }
        break;
    }

    return normalizedOptions;
  }

  // Other methods moved to specialized helper classes...
}