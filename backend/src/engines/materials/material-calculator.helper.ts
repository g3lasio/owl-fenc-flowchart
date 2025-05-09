import { PriceApiService } from '../../services/price-api.service';
import { RequiredMaterial, RequiredService, FenceDimensions, FenceOptions, Location } from '../../interfaces/fence.interfaces';
import { config } from '../../config/config';

/**
 * Helper class for calculating materials needed for different project types
 * Extracts material calculation logic from DeepSearchEngine
 */
export class MaterialCalculator {
  constructor(private readonly priceApiService: PriceApiService) {}

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
    // Different calculation strategies based on project type
    switch (projectType.toLowerCase()) {
      case 'fence':
        return this.calculateFenceMaterialsAndServices(projectSubtype, dimensions, options, location);
      case 'deck':
        return this.calculateDeckMaterialsAndServices(projectSubtype, dimensions, options, location);
      case 'pergola':
        return this.calculatePergolaMaterialsAndServices(projectSubtype, dimensions, options, location);
      default:
        throw new Error(`Unsupported project type: ${projectType}`);
    }
  }

  /**
   * Calculate fence-specific materials and services
   */
  private async calculateFenceMaterialsAndServices(
    fenceType: string,
    dimensions: FenceDimensions,
    options: FenceOptions,
    location: Location
  ): Promise<{materials: RequiredMaterial[], services: RequiredService[]}> {
    const materials: RequiredMaterial[] = [];
    const services: RequiredService[] = [];
    
    // Calculate linear feet
    const linearFeet = this.calculateLinearFeet(dimensions);
    
    // Basic fence components based on type
    switch (fenceType.toLowerCase()) {
      case 'wood':
        this.addWoodFenceMaterials(materials, dimensions, options, linearFeet);
        break;
      case 'vinyl':
        this.addVinylFenceMaterials(materials, dimensions, options, linearFeet);
        break;
      case 'chain link':
        this.addChainLinkFenceMaterials(materials, dimensions, options, linearFeet);
        break;
      case 'aluminum':
      case 'metal':
        this.addMetalFenceMaterials(materials, dimensions, options, linearFeet);
        break;
      default:
        throw new Error(`Unsupported fence type: ${fenceType}`);
    }
    
    // Add standard services
    this.addStandardFenceServices(services, dimensions, options, linearFeet, fenceType);
    
    // Add optional features
    if (options.gates && options.gates.length > 0) {
      this.addGateMaterialsAndServices(materials, services, options.gates, fenceType);
    }
    
    // Handle post installation based on ground type
    this.addPostInstallationServices(services, dimensions, options, location);
    
    return { materials, services };
  }

  /**
   * Calculate deck-specific materials and services
   */
  private async calculateDeckMaterialsAndServices(
    deckType: string,
    dimensions: any,
    options: any,
    location: Location
  ): Promise<{materials: RequiredMaterial[], services: RequiredService[]}> {
    // Deck calculations implementation
    const materials: RequiredMaterial[] = [];
    const services: RequiredService[] = [];
    
    // Calculate square footage
    const squareFeet = dimensions.width * dimensions.length;
    
    // Add deck-specific materials and services based on type
    // Implementation would go here

    return { materials, services };
  }

  /**
   * Calculate pergola-specific materials and services
   */
  private async calculatePergolaMaterialsAndServices(
    pergolaType: string,
    dimensions: any,
    options: any,
    location: Location
  ): Promise<{materials: RequiredMaterial[], services: RequiredService[]}> {
    // Pergola calculations implementation
    const materials: RequiredMaterial[] = [];
    const services: RequiredService[] = [];
    
    // Implementation would go here

    return { materials, services };
  }

  /**
   * Add wood fence specific materials
   */
  private addWoodFenceMaterials(
    materials: RequiredMaterial[],
    dimensions: FenceDimensions,
    options: FenceOptions,
    linearFeet: number
  ): void {
    // Calculate number of posts needed (posts at every 8 feet + corners + end caps)
    const numPosts = Math.ceil(linearFeet / 8) + 1 + (dimensions.corners || 0);
    
    // Add posts
    materials.push({
      name: options.postType || '4x4 Pressure Treated Posts',
      quantity: numPosts,
      unit: 'each',
      length: dimensions.height + 2, // Extra 2 feet for ground embedding
      description: `${dimensions.height + 2}' ${options.postType || 'Pressure Treated'} posts`
    });
    
    // Add rails (typically 3 rails per section for 6ft fence)
    const railsPerSection = dimensions.height >= 6 ? 3 : 2;
    const numRails = Math.ceil(linearFeet / 8) * railsPerSection;
    
    materials.push({
      name: options.railType || '2x4 Pressure Treated Rails',
      quantity: numRails,
      unit: 'each',
      length: 8, // Standard 8' rails
      description: `${options.railType || 'Pressure Treated'} horizontal rails`
    });
    
    // Add pickets (1 picket per 6 inches)
    const numPickets = Math.ceil(linearFeet * 2); // 2 pickets per foot
    
    materials.push({
      name: options.picketType || '1x6 Pressure Treated Pickets',
      quantity: numPickets,
      unit: 'each',
      length: dimensions.height,
      description: `${dimensions.height}' ${options.picketType || 'Pressure Treated'} pickets`
    });
    
    // Add concrete for post holes
    materials.push({
      name: 'Concrete Mix',
      quantity: numPosts,
      unit: 'bag',
      description: 'Fast-setting concrete mix for post installation'
    });
    
    // Add hardware
    materials.push({
      name: 'Galvanized Nails/Screws',
      quantity: 1,
      unit: 'box',
      description: 'Fasteners for fence assembly'
    });
  }

  // Additional methods for other fence types...

  /**
   * Add standard fence services
   */
  private addStandardFenceServices(
    services: RequiredService[],
    dimensions: FenceDimensions,
    options: FenceOptions,
    linearFeet: number,
    fenceType: string
  ): void {
    // Layout and measurement service
    services.push({
      name: 'Site Layout and Measurement',
      description: 'Marking fence line, post locations, and property boundaries',
      hours: Math.max(2, linearFeet / 100), // Minimum 2 hours
      equipmentNeeded: ['Measuring Tape', 'Marking Stakes', 'String Line']
    });
    
    // Post hole digging
    const numPosts = Math.ceil(linearFeet / 8) + 1 + (dimensions.corners || 0);
    services.push({
      name: 'Post Hole Digging',
      description: `Digging ${numPosts} post holes to proper depth`,
      hours: numPosts * 0.25, // 15 minutes per hole
      equipmentNeeded: ['Post Hole Digger', 'Auger']
    });
    
    // Fence installation
    services.push({
      name: 'Fence Installation',
      description: `Installing ${fenceType} fence sections, rails, and pickets`,
      hours: linearFeet * 0.15, // 9 minutes per linear foot
      equipmentNeeded: ['Power Drill', 'Circular Saw', 'Level', 'Nail Gun']
    });
    
    // Clean up service
    services.push({
      name: 'Clean Up',
      description: 'Removal of debris and final site clean up',
      hours: Math.max(1, linearFeet / 200), // Minimum 1 hour
      equipmentNeeded: ['Wheelbarrow', 'Rake']
    });
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