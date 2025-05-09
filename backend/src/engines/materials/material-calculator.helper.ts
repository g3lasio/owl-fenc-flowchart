import { PriceApiService } from '../../services/price-api.service';
import { RequiredMaterial, RequiredService, FenceDimensions, FenceOptions, Location } from '../../interfaces/fence.interfaces';
import { config } from '../../config/config';
import { OpenAIClient } from '../../services/openai.client';
import { AnthropicClient } from '../../services/anthropic.client';

/**
 * Helper class for calculating materials needed for different project types
 * Extracts material calculation logic from DeepSearchEngine
 */
export class MaterialCalculator {
  private openAIClient: OpenAIClient | null;
  private anthropicClient: AnthropicClient | null;
  private materialCache: Map<string, {materials: RequiredMaterial[], services: RequiredService[]}>;

  constructor(
    private readonly priceApiService: PriceApiService,
    openAIClient?: OpenAIClient,
    anthropicClient?: AnthropicClient
  ) {
    this.openAIClient = openAIClient || null;
    this.anthropicClient = anthropicClient || null;
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
          result = await this.calculateFenceMaterialsAndServices(projectSubtype, dimensions, options, location);
          break;
        case 'deck':
          result = await this.calculateDeckMaterialsAndServices(projectSubtype, dimensions, options, location);
          break;
        case 'pergola':
          result = await this.calculatePergolaMaterialsAndServices(projectSubtype, dimensions, options, location);
          break;
        case 'roof':
        case 'roofing':
          result = await this.calculateRoofMaterialsAndServices(projectSubtype, dimensions, options, location);
          break;
        default:
          // For any other project type, use dynamic AI-based investigation
          if (!this.canUseAIResearch()) {
            throw new Error(`Unsupported project type: ${projectType} - No AI clients configured for research`);
          }
          
          console.log(`Using AI research for unknown project type: ${projectType} - ${projectSubtype}`);
          result = await this.researchProjectMaterialsAndServices(
            projectType, 
            projectSubtype, 
            dimensions, 
            options, 
            location
          );
      }
      
      // Cache the result
      this.materialCache.set(cacheKey, result);
      return result;
      
    } catch (error) {
      console.error(`Error calculating materials for ${projectType} - ${projectSubtype}:`, error);
      throw error;
    }
  }

  /**
   * Check if AI research capability is available
   */
  private canUseAIResearch(): boolean {
    return !!(this.openAIClient || this.anthropicClient);
  }
  
  /**
   * Create a unique cache key for a calculation
   */
  private createCacheKey(
    projectType: string, 
    projectSubtype: string, 
    dimensions: any, 
    options: any
  ): string {
    return `${projectType}|${projectSubtype}|${JSON.stringify(dimensions)}|${JSON.stringify(options)}`;
  }
  
  /**
   * Research materials and services dynamically using AI for any project type
   * This allows the system to handle construction project types that weren't 
   * explicitly coded
   */
  private async researchProjectMaterialsAndServices(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    location: Location
  ): Promise<{materials: RequiredMaterial[], services: RequiredService[]}> {
    console.log(`Researching materials and services for ${projectType} - ${projectSubtype}...`);
    
    try {
      // Try with Anthropic first due to better researching capabilities
      if (this.anthropicClient) {
        return await this.anthropicResearchProject(projectType, projectSubtype, dimensions, options, location);
      }
      
      // Fall back to OpenAI if Anthropic not available
      if (this.openAIClient) {
        return await this.openaiResearchProject(projectType, projectSubtype, dimensions, options, location);
      }
      
      throw new Error('No AI service available for project research');
    } catch (error) {
      console.error('Error during AI research:', error);
      
      // If we fail with one service, try the other as fallback
      if (error.message.includes('Anthropic') && this.openAIClient) {
        console.log('Falling back to OpenAI for research');
        return await this.openaiResearchProject(projectType, projectSubtype, dimensions, options, location);
      }
      
      if (error.message.includes('OpenAI') && this.anthropicClient) {
        console.log('Falling back to Anthropic for research');
        return await this.anthropicResearchProject(projectType, projectSubtype, dimensions, options, location);
      }
      
      throw error;
    }
  }
  
  /**
   * Research project materials and services using Anthropic's Claude
   */
  private async anthropicResearchProject(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    location: Location
  ): Promise<{materials: RequiredMaterial[], services: RequiredService[]}> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not configured');
    }
    
    const prompt = this.createResearchPrompt(projectType, projectSubtype, dimensions, options, location);
    
    try {
      const response = await this.anthropicClient.complete({
        prompt,
        maxTokensToSample: 4000,
        model: 'claude-3-opus-20240229' // Use the most capable model for research
      });
      
      return this.parseAIResearchResponse(response);
    } catch (error) {
      console.error('Anthropic research error:', error);
      throw new Error(`Anthropic research failed: ${error.message}`);
    }
  }
  
  /**
   * Research project materials and services using OpenAI's GPT
   */
  private async openaiResearchProject(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    location: Location
  ): Promise<{materials: RequiredMaterial[], services: RequiredService[]}> {
    if (!this.openAIClient) {
      throw new Error('OpenAI client not configured');
    }
    
    const prompt = this.createResearchPrompt(projectType, projectSubtype, dimensions, options, location);
    
    try {
      const response = await this.openAIClient.complete({
        prompt,
        maxTokens: 4000,
        temperature: 0.1, // Keep temperature low for factual responses
        model: 'gpt-4o' // Use the most capable model for research
      });
      
      return this.parseAIResearchResponse(response);
    } catch (error) {
      console.error('OpenAI research error:', error);
      throw new Error(`OpenAI research failed: ${error.message}`);
    }
  }
  
  /**
   * Create a detailed research prompt to get materials and services for any construction project
   */
  private createResearchPrompt(
    projectType: string,
    projectSubtype: string,
    dimensions: any,
    options: any,
    location: Location
  ): string {
    // Format dimensions and options for better readability in the prompt
    const dimensionsStr = Object.entries(dimensions)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    
    const optionsStr = Object.entries(options)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    
    return `
I need a detailed analysis of materials and services required for a construction project with the following specifications:

PROJECT TYPE: ${projectType}
PROJECT SUBTYPE: ${projectSubtype}
DIMENSIONS: ${dimensionsStr}
OPTIONS: ${optionsStr}
LOCATION: ${location.city || ''}, ${location.state || ''}, ${location.zipCode || ''}

Please analyze this construction project and provide:

1. A comprehensive list of materials needed, including:
   - Material name
   - Quantity required (with appropriate units)
   - Brief description of each material's purpose

2. A list of services required to complete this project, including:
   - Service name
   - Estimated hours required
   - Equipment needed for each service
   - Brief description of each service

Please structure your response as a JSON object with two main arrays: "materials" and "services".
Each material should have: name, quantity, unit, description
Each service should have: name, hours, equipmentNeeded (array), description

For quantities, please calculate based on the dimensions provided and include a small waste factor (typically 10-15%).
For services/labor, please estimate realistic hours based on industry standards.

Example format (but with complete data for this specific project):
{
  "materials": [
    {
      "name": "Material Name",
      "quantity": 10,
      "unit": "unit type (e.g., piece, sqft, board, etc.)",
      "description": "Description of material and purpose"
    }
  ],
  "services": [
    {
      "name": "Service Name",
      "hours": 5,
      "equipmentNeeded": ["Equipment 1", "Equipment 2"],
      "description": "Description of service"
    }
  ]
}

Please be as specific and comprehensive as possible, considering all aspects of the ${projectType} project including foundation work, structural elements, finishing, and any special requirements implied by the project type and options.
`;
  }
  
  /**
   * Parse the AI response and convert it to the expected format
   */
  private parseAIResearchResponse(response: string): {materials: RequiredMaterial[], services: RequiredService[]} {
    try {
      // Find JSON object in the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('No valid JSON found in AI response');
      }
      
      const jsonStr = jsonMatch[0];
      const parsedResponse = JSON.parse(jsonStr);
      
      // Validate the response structure
      if (!parsedResponse.materials || !Array.isArray(parsedResponse.materials)) {
        throw new Error('Invalid materials array in AI response');
      }
      
      if (!parsedResponse.services || !Array.isArray(parsedResponse.services)) {
        throw new Error('Invalid services array in AI response');
      }
      
      // Convert to our interface types
      const materials: RequiredMaterial[] = parsedResponse.materials.map((m: any) => ({
        name: m.name,
        quantity: m.quantity,
        unit: m.unit,
        description: m.description
      }));
      
      const services: RequiredService[] = parsedResponse.services.map((s: any) => ({
        name: s.name,
        hours: s.hours,
        equipmentNeeded: s.equipmentNeeded,
        description: s.description
      }));
      
      return { materials, services };
    } catch (error) {
      console.error('Error parsing AI research response:', error);
      throw new Error(`Failed to parse AI research response: ${error.message}`);
    }
  }

  /**
   * Calculate the total material cost for a project
   */
  calculateMaterialCost(materials: RequiredMaterial[]): number {
    return materials.reduce((total, material) => {
      return total + (material.cost || 0) * material.quantity;
    }, 0);
  }

  /**
   * Calculate the total labor cost for a project
   */
  calculateLaborCost(services: RequiredService[]): number {
    const hourlyRate = config.estimator.laborCostPerHour;
    return services.reduce((total, service) => {
      return total + (service.hours * hourlyRate);
    }, 0);
  }

  /**
   * Calculate the total equipment cost for a project
   */
  calculateEquipmentCost(services: RequiredService[]): number {
    return services.reduce((total, service) => {
      let equipmentCost = 0;
      if (service.equipmentNeeded) {
        // Calculate rental or usage cost for each piece of equipment
        equipmentCost = service.equipmentNeeded.length * config.estimator.equipmentCostPerItem;
      }
      return total + equipmentCost;
    }, 0);
  }

  /**
   * Calculate linear feet from dimensions
   */
  private calculateLinearFeet(dimensions: FenceDimensions): number {
    if (dimensions.perimeter) {
      return dimensions.perimeter;
    }
    
    // Calculate based on width, length, and sides if perimeter is not provided
    if (dimensions.width && dimensions.length) {
      return 2 * (dimensions.width + dimensions.length);
    }
    
    if (dimensions.sides && dimensions.sideLength) {
      return dimensions.sides * dimensions.sideLength;
    }
    
    throw new Error('Insufficient dimension information to calculate linear feet');
  }

  /**
   * Add gate materials and services
   */
  private addGateMaterialsAndServices(
    materials: RequiredMaterial[],
    services: RequiredService[],
    gates: any[],
    fenceType: string
  ): void {
    // Implementation depends on gate specifications
    for (const gate of gates) {
      const width = gate.width || 3; // Default to 3 feet
      
      // Add gate frame material
      materials.push({
        name: `${fenceType} Gate Frame`,
        quantity: 1,
        unit: 'each',
        width: width,
        description: `${width}' wide gate frame`
      });
      
      // Add gate hardware
      materials.push({
        name: 'Gate Hardware Kit',
        quantity: 1,
        unit: 'kit',
        description: 'Includes hinges, latch, and handle'
      });
      
      // Add gate installation service
      services.push({
        name: 'Gate Installation',
        description: `Installing ${width}' wide gate with hardware`,
        hours: 2, // Standard 2 hours per gate
        equipmentNeeded: ['Power Drill', 'Level']
      });
    }
  }

  /**
   * Add post installation services based on ground type
   */
  private addPostInstallationServices(
    services: RequiredService[],
    dimensions: FenceDimensions,
    options: FenceOptions,
    location: Location
  ): void {
    const numPosts = Math.ceil(this.calculateLinearFeet(dimensions) / 8) + 1 + (dimensions.corners || 0);
    const groundType = options.groundType || 'normal';
    
    let hoursPerPost = 0.5; // Default 30 minutes per post
    let description = 'Setting posts in concrete';
    let additionalEquipment: string[] = [];
    
    switch (groundType.toLowerCase()) {
      case 'rocky':
        hoursPerPost = 0.75;
        description = 'Setting posts in rocky ground conditions';
        additionalEquipment = ['Rock Bar', 'Heavy Duty Auger'];
        break;
      case 'clay':
        hoursPerPost = 0.6;
        description = 'Setting posts in clay soil';
        additionalEquipment = ['Clay Spade', 'Water Source'];
        break;
      case 'sandy':
        hoursPerPost = 0.4;
        description = 'Setting posts in sandy soil';
        break;
      default:
        // Use defaults for normal ground
        break;
    }
    
    services.push({
      name: 'Post Setting',
      description,
      hours: numPosts * hoursPerPost,
      equipmentNeeded: ['Level', 'Post Level', 'Tamper', ...additionalEquipment]
    });
  }
}