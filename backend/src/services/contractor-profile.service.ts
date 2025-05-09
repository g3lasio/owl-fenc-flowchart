/**
 * Servicio para gestionar perfiles de contratistas
 * Proporciona información del contratista para incluirla en estimados
 */
export class ContractorProfileService {
  // Cache de perfiles de contratistas
  private contractorCache: Map<string, ContractorProfile> = new Map();
  
  constructor(
    private readonly dbService: any, // En una implementación real, sería un servicio de base de datos
    private readonly defaultExpirationMs: number = 3600000 // 1 hora por defecto
  ) {}
  
  /**
   * Obtiene el perfil completo de un contratista
   */
  async getContractorProfile(contractorId: string): Promise<ContractorProfile> {
    // Verificar si está en cache y no ha expirado
    if (this.contractorCache.has(contractorId)) {
      const cachedProfile = this.contractorCache.get(contractorId)!;
      if (cachedProfile.cacheExpiresAt > new Date()) {
        return cachedProfile;
      }
    }
    
    // Simulación: en una implementación real, esto obtendría datos de una BD
    // Aquí simulamos obtener el perfil del contratista
    const profile = await this.fetchContractorProfile(contractorId);
    
    // Establecer tiempo de expiración del cache
    const cacheExpiresAt = new Date();
    cacheExpiresAt.setTime(cacheExpiresAt.getTime() + this.defaultExpirationMs);
    
    // Guardar en cache
    const profileWithExpiration: ContractorProfile = {
      ...profile,
      cacheExpiresAt
    };
    
    this.contractorCache.set(contractorId, profileWithExpiration);
    
    return profileWithExpiration;
  }
  
  /**
   * Obtiene configuraciones específicas para estimados
   */
  async getEstimateConfigurations(contractorId: string): Promise<EstimateConfigurations> {
    const profile = await this.getContractorProfile(contractorId);
    return profile.estimateConfigurations || this.getDefaultEstimateConfigurations();
  }
  
  /**
   * Obtiene información de branding para personalizar documentos
   */
  async getBrandingInfo(contractorId: string): Promise<BrandingInfo> {
    const profile = await this.getContractorProfile(contractorId);
    return profile.branding || this.getDefaultBranding();
  }
  
  /**
   * Simula obtención de perfil de contratista desde una base de datos
   */
  private async fetchContractorProfile(contractorId: string): Promise<ContractorProfile> {
    // En una implementación real, esto obtendría datos de una BD
    // Para demostración, devolvemos datos de ejemplo
    
    // Simular latencia de red
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      id: contractorId,
      name: `Contractor ${contractorId}`,
      email: `contact@contractor${contractorId}.com`,
      phone: '555-123-4567',
      address: {
        street: '123 Business Ave',
        city: 'Contractorville',
        state: 'CA',
        zipCode: '95123'
      },
      licenses: [
        { type: 'General Contractor', number: 'GC-12345', state: 'CA', expiresAt: new Date('2025-12-31') }
      ],
      insurance: {
        liability: { provider: 'SafeCo', policyNumber: 'L-98765', coverage: 1000000 },
        workersComp: { provider: 'WorkerShield', policyNumber: 'WC-54321', coverage: 500000 }
      },
      branding: {
        businessName: `${contractorId}'s Professional Contracting`,
        tagline: 'Quality You Can Trust',
        logo: `/assets/logos/${contractorId}.png`,
        primaryColor: '#2c3e50',
        secondaryColor: '#3498db',
        fontFamily: 'Roboto, sans-serif'
      },
      estimateConfigurations: {
        defaultMarkup: 0.25, // 25% markup por defecto
        minimumMarkup: 0.15,
        maximumMarkup: 0.35,
        defaultTerms: 'Estimado válido por 30 días. Se requiere un depósito del 50% para comenzar el trabajo. Saldo a pagar al completar.',
        paymentMethods: ['Check', 'Credit Card', 'Bank Transfer'],
        defaultWarranty: '1 año en mano de obra, materiales según garantía del fabricante.',
        estimateNotes: 'Todos los materiales serán como se especifica. Cualquier alteración o desviación involucrará costos extra.',
        includePhotosInEstimate: true,
        showLineItemPrices: true
      },
      serviceArea: {
        radius: 50, // Radio de servicio en millas
        zipCodes: ['95123', '95124', '95125', '95126', '95127', '95128', '95129', '95130']
      },
      specializations: ['Fencing', 'Decking', 'Outdoor Structures'],
      createdAt: new Date('2022-01-15'),
      updatedAt: new Date()
    };
  }
  
  /**
   * Proporciona configuraciones de estimado por defecto
   */
  private getDefaultEstimateConfigurations(): EstimateConfigurations {
    return {
      defaultMarkup: 0.25,
      minimumMarkup: 0.15,
      maximumMarkup: 0.35,
      defaultTerms: 'Estimado válido por 30 días. 50% de depósito requerido.',
      paymentMethods: ['Check', 'Cash'],
      defaultWarranty: '1 año en mano de obra',
      estimateNotes: '',
      includePhotosInEstimate: false,
      showLineItemPrices: true
    };
  }
  
  /**
   * Proporciona información de branding por defecto
   */
  private getDefaultBranding(): BrandingInfo {
    return {
      businessName: 'Professional Contractor',
      tagline: 'Quality Service',
      logo: '/assets/logos/default.png',
      primaryColor: '#333333',
      secondaryColor: '#666666',
      fontFamily: 'Arial, sans-serif'
    };
  }
}

/**
 * Interfaces para el perfil del contratista
 */
export interface ContractorProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  licenses: Array<{
    type: string;
    number: string;
    state: string;
    expiresAt: Date;
  }>;
  insurance: {
    liability: {
      provider: string;
      policyNumber: string;
      coverage: number;
    };
    workersComp?: {
      provider: string;
      policyNumber: string;
      coverage: number;
    };
  };
  branding: BrandingInfo;
  estimateConfigurations: EstimateConfigurations;
  serviceArea: {
    radius: number;
    zipCodes: string[];
  };
  specializations: string[];
  createdAt: Date;
  updatedAt: Date;
  cacheExpiresAt?: Date;
}

export interface BrandingInfo {
  businessName: string;
  tagline: string;
  logo: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
}

export interface EstimateConfigurations {
  defaultMarkup: number;
  minimumMarkup: number;
  maximumMarkup: number;
  defaultTerms: string;
  paymentMethods: string[];
  defaultWarranty: string;
  estimateNotes: string;
  includePhotosInEstimate: boolean;
  showLineItemPrices: boolean;
}