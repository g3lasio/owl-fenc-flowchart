import { PriceApiService } from '../../services/price-api.service';
import { RequiredMaterial, RequiredService, FenceDimensions, FenceOptions, Location } from '../../interfaces/fence.interfaces';
import { config } from '../../config/config';
import { AIServiceV2 } from '../../services/ai-service-v2';

/**
 * Helper class for calculating materials needed for different project types
 * Uses the new AIServiceV2 for all AI-related operations
 */
export class MaterialCalculatorV2 {
  private aiService: AIServiceV2;
  private materialCache: Map<string, {materials: RequiredMaterial[], services: RequiredService[]}>;

  constructor(
    private readonly priceApiService: PriceApiService,
    aiService?: AIServiceV2
  ) {
    this.aiService = aiService || new AIServiceV2();
    this.materialCache = new Map();
  }

  /**
   * Calculate materials and services needed for a project
   */
  async calculateMaterialsAndServices(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    location: Location
  ): Promise<{materials: RequiredMaterial[], services: RequiredService[]}> {
    // Create cache key for this specific calculation
    const cacheKey = this.createCacheKey(projectType, projectSubtype, dimensions, options);
    
    // Check if we have cached results
    const cachedResult = this.materialCache.get(cacheKey);
    if (cachedResult) {
      console.log(`Using cached materials and services for ${projectType} - ${projectSubtype}`);
      return cachedResult;
    }
    
    // Different calculation strategies based on project type
    try {
      let result;
      
      switch (projectType.toLowerCase()) {
        case 'fence':
          result = await this.calculateFenceMaterials(projectSubtype, dimensions, options, location);
          break;
        case 'deck':
          result = await this.calculateDeckMaterials(projectSubtype, dimensions, options, location);
          break;
        case 'patio':
          result = await this.calculatePatioMaterials(projectSubtype, dimensions, options, location);
          break;
        case 'retaining wall':
          result = await this.calculateRetainingWallMaterials(projectSubtype, dimensions, options, location);
          break;
        default:
          // For unknown project types, use AI to generate recommendations
          result = await this.calculateGenericMaterials(projectType, projectSubtype, dimensions, options, location);
      }
      
      // Cache the results
      this.materialCache.set(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error(`Error calculating materials for ${projectType} - ${projectSubtype}:`, error);
      // Return empty results in case of error
      return { materials: [], services: [] };
    }
  }

  /**
   * Creates a cache key based on project parameters
   */
  private createCacheKey(
    projectType: string, 
    projectSubtype: string, 
    dimensions: any, 
    options: any
  ): string {
    return `${projectType}:${projectSubtype}:${JSON.stringify(dimensions)}:${JSON.stringify(options)}`;
  }

  /**
   * Calculates materials for fence projects
   */
  private async calculateFenceMaterials(
    fenceType: string,
    dimensions: FenceDimensions,
    options: FenceOptions,
    location: Location
  ): Promise<{materials: RequiredMaterial[], services: RequiredService[]}> {
    const materials: RequiredMaterial[] = [];
    const services: RequiredService[] = [];
    
    // For complex fence types or custom options, use AI to generate materials list
    if (options.customDesign || fenceType === 'custom' || options.complexFeatures) {
      return this.generateAIBasedMaterialsList('fence', fenceType, dimensions, options, location);
    }
    
    // Standard fence types calculations
    switch (fenceType.toLowerCase()) {
      case 'wood':
        return this.calculateWoodFenceMaterials(dimensions, options, location);
      case 'vinyl':
        return this.calculateVinylFenceMaterials(dimensions, options, location);
      case 'chain link':
        return this.calculateChainLinkFenceMaterials(dimensions, options, location);
      case 'aluminum':
        return this.calculateAluminumFenceMaterials(dimensions, options, location);
      case 'wrought iron':
        return this.calculateWroughtIronFenceMaterials(dimensions, options, location);
      default:
        // For unknown fence types, use AI to generate recommendations
        return this.generateAIBasedMaterialsList('fence', fenceType, dimensions, options, location);
    }
  }
  
  /**
   * Calculates materials for wooden fence
   */
  private async calculateWoodFenceMaterials(
    dimensions: FenceDimensions, 
    options: FenceOptions,
    location: Location
  ): Promise<{materials: RequiredMaterial[], services: RequiredService[]}> {
    const materials: RequiredMaterial[] = [];
    const services: RequiredService[] = [];
    
    // Basic calculations
    const linearFeet = dimensions.length;
    const heightFeet = dimensions.height;
    const postSpacing = options.postSpacing || 8; // Default 8 feet between posts
    
    // Calculate number of posts needed (including corner posts)
    const numPosts = Math.ceil(linearFeet / postSpacing) + 1;
    
    // Add posts to materials list
    materials.push({
      name: `${options.postMaterial || 'Pressure Treated'} Fence Posts`,
      description: `${options.postSize || '4x4'} ${options.postMaterial || 'Pressure Treated'} Posts`,
      quantity: numPosts,
      unit: 'Each',
      category: 'Structural',
      purpose: 'Main structural support for fence'
    });
    
    // Calculate rails needed
    const railsPerSection = options.railsPerSection || 2;
    const totalRails = Math.ceil(linearFeet / 8) * railsPerSection;
    
    // Add rails to materials list
    materials.push({
      name: `${options.railMaterial || 'Pressure Treated'} Fence Rails`,
      description: `${options.railSize || '2x4'} ${options.railMaterial || 'Pressure Treated'} Rails`,
      quantity: totalRails,
      unit: 'Each',
      category: 'Structural',
      purpose: 'Horizontal supports between posts'
    });
    
    // Calculate pickets needed
    if (options.fenceStyle !== 'horizontal') {
      // For vertical picket style
      const picketWidth = options.picketWidth || 5.5; // Inches
      const picketSpacing = options.picketSpacing || 0.5; // Inches
      const picketWidthWithSpacing = picketWidth + picketSpacing;
      const totalWidthInInches = linearFeet * 12;
      const numPickets = Math.ceil(totalWidthInInches / picketWidthWithSpacing);
      
      // Add pickets to materials list
      materials.push({
        name: `${options.picketMaterial || 'Pressure Treated'} Fence Pickets`,
        description: `${heightFeet}' ${options.picketMaterial || 'Pressure Treated'} Fence Pickets`,
        quantity: numPickets,
        unit: 'Each',
        category: 'Facing',
        purpose: 'Main fence facing material'
      });
    } else {
      // For horizontal fence style (different calculation)
      const numBoardRows = Math.ceil(heightFeet * 12 / (options.picketWidth || 5.5));
      const boardLength = 8; // Typical board length in feet
      const totalBoardsNeeded = Math.ceil(linearFeet / boardLength) * numBoardRows;
      
      // Add horizontal boards to materials list
      materials.push({
        name: `${options.picketMaterial || 'Pressure Treated'} Fence Boards`,
        description: `${options.picketSize || '1x6'} ${options.picketMaterial || 'Pressure Treated'} Fence Boards`,
        quantity: totalBoardsNeeded,
        unit: 'Each',
        category: 'Facing',
        purpose: 'Main fence facing material'
      });
    }
    
    // Add hardware
    materials.push({
      name: 'Galvanized Screws/Nails',
      description: `${options.screwType || 'Galvanized'} ${options.screwSize || '3"'} ${options.screwType ? 'Screws' : 'Nails'}`,
      quantity: linearFeet * 3, // Approximation
      unit: 'Pounds',
      category: 'Hardware',
      purpose: 'Fasteners for fence assembly'
    });
    
    // Calculate concrete for posts
    const concretePerPost = 0.2; // Cubic feet per post (approximate)
    const totalConcrete = numPosts * concretePerPost;
    
    materials.push({
      name: 'Concrete Mix',
      description: 'Fast-setting concrete mix for fence posts',
      quantity: Math.ceil(totalConcrete / 0.6), // Convert to 60lb bags
      unit: 'Bags',
      category: 'Foundation',
      purpose: 'Secure posts in ground'
    });
    
    // Add services
    services.push({
      name: 'Post Hole Digging',
      description: 'Dig holes for fence posts',
      quantity: numPosts,
      unit: 'Holes',
      category: 'Labor',
      estimatedHours: numPosts * 0.25 // 15 minutes per hole
    });
    
    services.push({
      name: 'Fence Installation',
      description: 'Install posts, rails, and pickets',
      quantity: linearFeet,
      unit: 'Linear Feet',
      category: 'Labor',
      estimatedHours: linearFeet * 0.2 // Approximately 12 minutes per linear foot
    });
    
    // Add staining/sealing if specified
    if (options.finish === 'stained' || options.finish === 'sealed') {
      const fenceArea = linearFeet * heightFeet;
      const coveragePerGallon = 200; // Square feet per gallon
      const gallonsNeeded = Math.ceil(fenceArea / coveragePerGallon);
      
      materials.push({
        name: options.finish === 'stained' ? 'Fence Stain' : 'Wood Sealer',
        description: `${options.finishBrand || 'Premium'} ${options.finishColor || 'Natural'} ${options.finish === 'stained' ? 'Wood Stain' : 'Wood Sealer'}`,
        quantity: gallonsNeeded,
        unit: 'Gallons',
        category: 'Finish',
        purpose: options.finish === 'stained' ? 'Color and protect wood' : 'Protect wood from elements'
      });
      
      services.push({
        name: options.finish === 'stained' ? 'Fence Staining' : 'Fence Sealing',
        description: `Apply ${options.finish === 'stained' ? 'stain' : 'sealer'} to fence`,
        quantity: fenceArea,
        unit: 'Square Feet',
        category: 'Labor',
        estimatedHours: fenceArea * 0.01 // Approximately 1 hour per 100 square feet
      });
    }
    
    return { materials, services };
  }
  
  /**
   * Uses AI to generate a materials list for complex or unusual projects
   */
  private async generateAIBasedMaterialsList(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    location: Location
  ): Promise<{materials: RequiredMaterial[], services: RequiredService[]}> {
    // Build a comprehensive prompt
    const prompt = this.buildMaterialAnalysisPrompt(
      projectType,
      projectSubtype,
      dimensions,
      options,
      location
    );
    
    try {
      // Use our AIServiceV2 for this complex task
      const response = await this.aiService.smartComplete({
        prompt,
        complexity: 'high',
        promptLength: prompt.length,
        requiresFactualAccuracy: true
      });
      
      // Parse the response to extract materials and services
      return this.parseMaterialResponse(response);
    } catch (error) {
      console.error('Error generating AI-based materials list:', error);
      return { materials: [], services: [] };
    }
  }
  
  /**
   * Builds a prompt for material analysis
   */
  private buildMaterialAnalysisPrompt(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    location: Location
  ): string {
    let prompt = `You are a professional construction estimator specializing in ${projectType} projects.\n\n`;
    
    prompt += `Please analyze the following ${projectType} project (${projectSubtype}) and provide a comprehensive list of all required materials and services needed for construction.\n\n`;
    
    prompt += `Project Location: ${location.city}, ${location.state}, ${location.country}\n\n`;
    
    // Add dimensions
    prompt += `Dimensions:\n${JSON.stringify(dimensions, null, 2)}\n\n`;
    
    // Add options
    prompt += `Options and Specifications:\n${JSON.stringify(options, null, 2)}\n\n`;
    
    // Add specific instructions for output format
    prompt += `Please provide your response in the following format:
{
  "materials": [
    {
      "name": "Material Name",
      "description": "Detailed description of the material",
      "quantity": 0,
      "unit": "Unit of measure (e.g., Each, Pounds, Gallons)",
      "category": "Material category (e.g., Structural, Hardware, Finish)",
      "purpose": "What the material is used for"
    }
  ],
  "services": [
    {
      "name": "Service Name",
      "description": "Description of the service",
      "quantity": 0,
      "unit": "Unit of measure (e.g., Hours, Square Feet)",
      "category": "Labor category",
      "estimatedHours": 0
    }
  ]
}\n\n`;
    
    prompt += `Ensure quantities are accurate and appropriate for the dimensions provided. Include all necessary materials and services, even minor ones like fasteners, concrete, sealants, site preparation, cleanup, etc.`;
    
    return prompt;
  }
  
  /**
   * Parses the AI response to extract materials and services
   */
  private parseMaterialResponse(response: string): {materials: RequiredMaterial[], services: RequiredService[]} {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('Failed to extract JSON from AI response');
        return { materials: [], services: [] };
      }
      
      const jsonStr = jsonMatch[0];
      const result = JSON.parse(jsonStr);
      
      // Validate the structure
      if (!result.materials || !Array.isArray(result.materials)) {
        result.materials = [];
      }
      
      if (!result.services || !Array.isArray(result.services)) {
        result.services = [];
      }
      
      return {
        materials: result.materials as RequiredMaterial[],
        services: result.services as RequiredService[]
      };
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return { materials: [], services: [] };
    }
  }
  
  // Placeholder implementations for other fence types
  private async calculateVinylFenceMaterials(dimensions: FenceDimensions, options: FenceOptions, location: Location) {
    return this.generateAIBasedMaterialsList('fence', 'vinyl', dimensions, options, location);
  }
  
  private async calculateChainLinkFenceMaterials(dimensions: FenceDimensions, options: FenceOptions, location: Location) {
    return this.generateAIBasedMaterialsList('fence', 'chain link', dimensions, options, location);
  }
  
  private async calculateAluminumFenceMaterials(dimensions: FenceDimensions, options: FenceOptions, location: Location) {
    return this.generateAIBasedMaterialsList('fence', 'aluminum', dimensions, options, location);
  }
  
  private async calculateWroughtIronFenceMaterials(dimensions: FenceDimensions, options: FenceOptions, location: Location) {
    return this.generateAIBasedMaterialsList('fence', 'wrought iron', dimensions, options, location);
  }
  
  // Placeholder implementations for other project types
  private async calculateDeckMaterials(deckType: string, dimensions: any, options: any, location: Location) {
    return this.generateAIBasedMaterialsList('deck', deckType, dimensions, options, location);
  }
  
  private async calculatePatioMaterials(patioType: string, dimensions: any, options: any, location: Location) {
    return this.generateAIBasedMaterialsList('patio', patioType, dimensions, options, location);
  }
  
  private async calculateRetainingWallMaterials(wallType: string, dimensions: any, options: any, location: Location) {
    return this.generateAIBasedMaterialsList('retaining wall', wallType, dimensions, options, location);
  }
  
  private async calculateGenericMaterials(projectType: string, projectSubtype: string, dimensions: any, options: any, location: Location) {
    return this.generateAIBasedMaterialsList(projectType, projectSubtype, dimensions, options, location);
  }
}
