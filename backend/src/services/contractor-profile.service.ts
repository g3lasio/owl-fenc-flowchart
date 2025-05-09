/**
 * Servicio para gestionar perfiles de contratistas
 * Proporciona información del contratista para incluirla en estimados
 * Incluye sistema adaptativo para aprender de las preferencias del contratista
 */
export class ContractorProfileService {
  // Cache de perfiles de contratistas
  private contractorCache: Map<string, ContractorProfile> = new Map();

  constructor(
    private readonly dbService: any, // En una implementación real, sería un servicio de base de datos
    private readonly defaultExpirationMs: number = 3600000 // 1 hora por defecto
  ) { }

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
   * Obtiene el historial completo de estimados del contratista para aprendizaje
   */
  async getContractorEstimateHistory(contractorId: string): Promise<EstimateHistory[]> {
    const profile = await this.getContractorProfile(contractorId);
    return profile.estimateHistory || [];
  }

  /**
   * Obtiene preferencias de materiales para un tipo específico de proyecto
   */
  async getMaterialPreferences(
    contractorId: string,
    projectType: string,
    projectSubtype?: string
  ): Promise<MaterialPreference[]> {
    const profile = await this.getContractorProfile(contractorId);

    if (!profile.materialPreferences) {
      return [];
    }

    // Filtrar preferencias por tipo y subtipo de proyecto
    return profile.materialPreferences.filter(pref => {
      if (pref.projectType !== projectType) {
        return false;
      }

      // Si se especificó un subtipo, verificar coincidencia
      if (projectSubtype && pref.projectSubtype && pref.projectSubtype !== projectSubtype) {
        return false;
      }

      return true;
    });
  }

  /**
   * Obtiene tasas de servicio específicas del contratista
   */
  async getServiceRates(
    contractorId: string,
    projectType: string
  ): Promise<ServiceRate[]> {
    const profile = await this.getContractorProfile(contractorId);

    if (!profile.serviceRates) {
      return this.getDefaultServiceRates(projectType);
    }

    // Filtrar tasas por tipo de proyecto
    const rates = profile.serviceRates.filter(rate =>
      rate.projectType === projectType || rate.projectType === 'all'
    );

    return rates.length > 0 ? rates : this.getDefaultServiceRates(projectType);
  }

  /**
   * Actualiza el perfil con nuevas preferencias de materiales aprendidas
   */
  async updateMaterialPreferences(
    contractorId: string,
    newPreferences: MaterialPreference[]
  ): Promise<boolean> {
    try {
      const profile = await this.getContractorProfile(contractorId);

      // Si no hay preferencias existentes, inicializar array
      if (!profile.materialPreferences) {
        profile.materialPreferences = [];
      }

      // Para cada nueva preferencia
      for (const newPref of newPreferences) {
        // Buscar si ya existe preferencia similar
        const existingIndex = profile.materialPreferences.findIndex(p =>
          p.projectType === newPref.projectType &&
          p.projectSubtype === newPref.projectSubtype &&
          p.materialName === newPref.materialName
        );

        if (existingIndex >= 0) {
          // Actualizar preferencia existente con peso incrementado
          const existing = profile.materialPreferences[existingIndex];
          profile.materialPreferences[existingIndex] = {
            ...existing,
            preferenceWeight: existing.preferenceWeight + newPref.preferenceWeight,
            lastUsed: new Date(),
            usageCount: (existing.usageCount || 0) + 1
          };
        } else {
          // Agregar nueva preferencia
          profile.materialPreferences.push({
            ...newPref,
            lastUsed: new Date(),
            usageCount: 1
          });
        }
      }

      // Actualizar perfil en cache
      profile.updatedAt = new Date();
      this.contractorCache.set(contractorId, profile);

      // En implementación real, guardar en BD
      // await this.dbService.updateContractorProfile(contractorId, profile);

      return true;
    } catch (error) {
      console.error('Error updating material preferences:', error);
      return false;
    }
  }

  /**
   * Actualiza las tasas de servicio basadas en estimados aprobados
   */
  async updateServiceRates(
    contractorId: string,
    estimateId: string,
    wasApproved: boolean
  ): Promise<boolean> {
    try {
      const profile = await this.getContractorProfile(contractorId);

      // En implementación real, obtendríamos el estimado de la BD
      // const estimate = await this.dbService.getEstimate(estimateId);

      // Simulamos un estimado para el ejemplo
      const estimate = {
        id: estimateId,
        projectType: 'roofing',
        projectSubtype: 'asphalt_shingles',
        services: [
          { name: 'Roof Tear-Off', hours: 8, rate: 65 },
          { name: 'Roof Installation', hours: 16, rate: 75 }
        ]
      };

      // Solo aprender de estimados aprobados
      if (wasApproved) {
        if (!profile.serviceRates) {
          profile.serviceRates = [];
        }

        // Aprender de cada servicio en el estimado
        for (const service of estimate.services) {
          const existingIndex = profile.serviceRates.findIndex(r =>
            r.projectType === estimate.projectType &&
            r.serviceName === service.name
          );

          if (existingIndex >= 0) {
            // Ajustar tasa existente (promedio ponderado)
            const existing = profile.serviceRates[existingIndex];
            const totalUses = (existing.usageCount || 0) + 1;
            const newRate = ((existing.rate * existing.usageCount) + service.rate) / totalUses;

            profile.serviceRates[existingIndex] = {
              ...existing,
              rate: newRate,
              lastUsed: new Date(),
              usageCount: totalUses
            };
          } else {
            // Agregar nueva tasa
            profile.serviceRates.push({
              projectType: estimate.projectType,
              serviceName: service.name,
              rate: service.rate,
              lastUsed: new Date(),
              usageCount: 1
            });
          }
        }

        // Actualizar perfil en cache
        profile.updatedAt = new Date();
        this.contractorCache.set(contractorId, profile);

        // En implementación real, guardar en BD
        // await this.dbService.updateContractorProfile(contractorId, profile);
      }

      // Agregar este estimado al historial
      if (!profile.estimateHistory) {
        profile.estimateHistory = [];
      }

      profile.estimateHistory.push({
        estimateId,
        projectType: estimate.projectType,
        projectSubtype: estimate.projectSubtype,
        createdAt: new Date(),
        wasApproved,
        approvedAt: wasApproved ? new Date() : undefined
      });

      return true;
    } catch (error) {
      console.error('Error updating service rates:', error);
      return false;
    }
  }

  /**
   * Registra feedback explícito del contratista sobre estimados
   */
  async recordContractorFeedback(
    contractorId: string,
    estimateId: string,
    feedback: ContractorFeedback
  ): Promise<boolean> {
    try {
      const profile = await this.getContractorProfile(contractorId);

      if (!profile.feedbackHistory) {
        profile.feedbackHistory = [];
      }

      // Agregar feedback al historial
      profile.feedbackHistory.push({
        estimateId,
        feedback,
        recordedAt: new Date()
      });

      // Si hay correcciones de materiales, aprender de ellas
      if (feedback.materialCorrections && feedback.materialCorrections.length > 0) {
        const materialPreferences: MaterialPreference[] = feedback.materialCorrections.map(correction => ({
          projectType: feedback.projectType,
          projectSubtype: feedback.projectSubtype,
          materialName: correction.correctMaterial,
          supplier: correction.preferredSupplier,
          preferenceWeight: 2, // Mayor peso para correcciones explícitas
          notes: `Corrección manual: ${correction.originalMaterial} → ${correction.correctMaterial}`
        }));

        await this.updateMaterialPreferences(contractorId, materialPreferences);
      }

      // Si hay correcciones de tasas, aprender de ellas
      if (feedback.serviceRateCorrections && feedback.serviceRateCorrections.length > 0) {
        if (!profile.serviceRates) {
          profile.serviceRates = [];
        }

        for (const correction of feedback.serviceRateCorrections) {
          const existingIndex = profile.serviceRates.findIndex(r =>
            r.projectType === feedback.projectType &&
            r.serviceName === correction.serviceName
          );

          if (existingIndex >= 0) {
            // Sobrescribir con corrección manual (mayor prioridad)
            profile.serviceRates[existingIndex] = {
              ...profile.serviceRates[existingIndex],
              rate: correction.correctRate,
              lastUsed: new Date(),
              usageCount: (profile.serviceRates[existingIndex].usageCount || 0) + 1,
              notes: `Tasa corregida manualmente por el contratista`
            };
          } else {
            // Agregar nueva tasa
            profile.serviceRates.push({
              projectType: feedback.projectType,
              serviceName: correction.serviceName,
              rate: correction.correctRate,
              lastUsed: new Date(),
              usageCount: 1,
              notes: `Tasa especificada manualmente por el contratista`
            });
          }
        }
      }

      // Actualizar perfil en cache
      profile.updatedAt = new Date();
      this.contractorCache.set(contractorId, profile);

      // En implementación real, guardar en BD
      // await this.dbService.updateContractorProfile(contractorId, profile);

      return true;
    } catch (error) {
      console.error('Error recording contractor feedback:', error);
      return false;
    }
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
      // Campos nuevos para perfiles adaptativos
      materialPreferences: [
        {
          projectType: 'fencing',
          projectSubtype: 'wood',
          materialName: 'Western Red Cedar',
          supplier: 'Premium Lumber Co',
          preferenceWeight: 5,
          lastUsed: new Date(),
          usageCount: 12,
          notes: 'Proveedor preferido para proyectos de alta gama'
        },
        {
          projectType: 'fencing',
          projectSubtype: 'wood',
          materialName: 'Pressure Treated Pine',
          supplier: 'Local Hardware Store',
          preferenceWeight: 3,
          lastUsed: new Date(),
          usageCount: 8,
          notes: 'Opción económica para proyectos con presupuesto ajustado'
        }
      ],
      serviceRates: [
        {
          projectType: 'fencing',
          serviceName: 'Fence Installation',
          rate: 45, // $45 por hora
          lastUsed: new Date(),
          usageCount: 20
        },
        {
          projectType: 'fencing',
          serviceName: 'Post Hole Digging',
          rate: 55, // $55 por hora
          lastUsed: new Date(),
          usageCount: 15
        }
      ],
      estimateHistory: [
        {
          estimateId: 'EST-001',
          projectType: 'fencing',
          projectSubtype: 'wood',
          createdAt: new Date('2023-01-15'),
          wasApproved: true,
          approvedAt: new Date('2023-01-20')
        },
        {
          estimateId: 'EST-002',
          projectType: 'decking',
          projectSubtype: 'composite',
          createdAt: new Date('2023-02-10'),
          wasApproved: false
        }
      ],
      feedbackHistory: [
        {
          estimateId: 'EST-003',
          feedback: {
            projectType: 'fencing',
            projectSubtype: 'vinyl',
            overallRating: 4,
            accuracyRating: 3,
            comments: 'Buen estimado en general, pero la tasa para instalación de vinilo debe ser mayor',
            materialCorrections: [
              {
                originalMaterial: 'Standard Vinyl Posts',
                correctMaterial: 'Heavy Duty Vinyl Posts',
                preferredSupplier: 'VinylPro Supply'
              }
            ],
            serviceRateCorrections: [
              {
                serviceName: 'Vinyl Fence Installation',
                originalRate: 40,
                correctRate: 55
              }
            ]
          },
          recordedAt: new Date('2023-03-05')
        }
      ],
      createdAt: new Date('2022-01-15'),
      updatedAt: new Date()
    };
  }

  /**
   * Proporciona tasas de servicio por defecto para diferentes tipos de proyectos
   */
  private getDefaultServiceRates(projectType: string): ServiceRate[] {
    const defaultRates: Record<string, ServiceRate[]> = {
      'fencing': [
        { projectType: 'fencing', serviceName: 'Fence Installation', rate: 40 },
        { projectType: 'fencing', serviceName: 'Post Hole Digging', rate: 50 },
        { projectType: 'fencing', serviceName: 'Gate Installation', rate: 60 }
      ],
      'roofing': [
        { projectType: 'roofing', serviceName: 'Roof Tear-Off', rate: 60 },
        { projectType: 'roofing', serviceName: 'Roof Installation', rate: 70 },
        { projectType: 'roofing', serviceName: 'Flashing Installation', rate: 75 }
      ],
      'electrical': [
        { projectType: 'electrical', serviceName: 'Wiring Installation', rate: 85 },
        { projectType: 'electrical', serviceName: 'Fixture Installation', rate: 75 },
        { projectType: 'electrical', serviceName: 'Panel Upgrade', rate: 95 }
      ],
      'plumbing': [
        { projectType: 'plumbing', serviceName: 'Pipe Installation', rate: 80 },
        { projectType: 'plumbing', serviceName: 'Fixture Installation', rate: 70 },
        { projectType: 'plumbing', serviceName: 'Water Heater Installation', rate: 90 }
      ]
    };

    return defaultRates[projectType] || [
      { projectType: 'general', serviceName: 'General Labor', rate: 45 },
      { projectType: 'general', serviceName: 'Skilled Labor', rate: 65 },
      { projectType: 'general', serviceName: 'Supervision', rate: 85 }
    ];
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

  // Campos nuevos para aprendizaje adaptativo
  materialPreferences?: MaterialPreference[];
  serviceRates?: ServiceRate[];
  estimateHistory?: EstimateHistory[];
  feedbackHistory?: FeedbackRecord[];

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

/**
 * Interfaces para el sistema adaptativo
 */
export interface MaterialPreference {
  projectType: string;
  projectSubtype?: string;
  materialName: string;
  supplier?: string;
  preferenceWeight: number; // 1-10, mayor número indica mayor preferencia
  lastUsed?: Date;
  usageCount?: number;
  notes?: string;
}

export interface ServiceRate {
  projectType: string;
  serviceName: string;
  rate: number; // Tasa por hora
  lastUsed?: Date;
  usageCount?: number;
  notes?: string;
}

export interface EstimateHistory {
  estimateId: string;
  projectType: string;
  projectSubtype?: string;
  createdAt: Date;
  wasApproved: boolean;
  approvedAt?: Date;
}

export interface FeedbackRecord {
  estimateId: string;
  feedback: ContractorFeedback;
  recordedAt: Date;
}

export interface ContractorFeedback {
  projectType: string;
  projectSubtype?: string;
  overallRating?: number; // 1-5
  accuracyRating?: number; // 1-5
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