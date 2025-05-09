export type InputMode = 'manual' | 'chat';
export type ClientSource = 'new' | 'existing' | 'chat';

/**
 * Información de cliente para el estimado
 */
export interface Client {
  id?: string;
  name: string;
  email: string;
  phone: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  company?: string;
  notes?: string;
}

/**
 * Detalles del proyecto para generar el estimado
 */
export interface ProjectDetails {
  type: string;  // fencing, decking, concrete, etc.
  subtype?: string;  // Subtipo o material principal (wood, vinyl, etc.)
  material?: string;  // Material principal si no se especificó como subtype
  dimensions: {
    length?: number;  // Longitud en pies (para cercas, etc.)
    width?: number;   // Ancho en pies
    height?: number;  // Altura en pies (para cercas, etc.)
    squareFeet?: number;  // Pies cuadrados (para terrazas, patios, etc.)
    squareMeters?: number; // Metros cuadrados
    thickness?: number;   // Espesor en pulgadas (para concreto, etc.)
    depth?: number;       // Profundidad
  };
  style?: string;     // Estilo específico del proyecto
  color?: string;     // Color principal
  finish?: string;    // Acabado (smooth, textured, etc.)
  location?: Location; // Ubicación del proyecto
  gates?: {           // Información de puertas (para cercas)
    width?: number;   // Ancho de la puerta en pies
    count?: number;   // Número de puertas
    style?: string;   // Estilo de la puerta
  }[];
  railingType?: string;  // Tipo de barandilla (para terrazas)
  stairs?: boolean;      // Si incluye escaleras (para terrazas)
  demolition?: boolean;  // Si requiere demolición de estructura existente
  permitNeeded?: boolean;  // Si se necesita permiso
  options?: Record<string, any>; // Opciones adicionales específicas
  notes?: string;       // Notas adicionales
  
  // Campos técnicos específicos por tipo de proyecto
  // Campos para proyectos de techos (roofing)
  existingMaterial?: string;       // Material del techo existente
  roofPitch?: number | string;     // Inclinación del techo (en grados, razón, o descriptiva)
  existingLayers?: number;         // Número de capas existentes
  roofAge?: number;                // Edad del techo existente en años
  visibleDamage?: boolean;         // Si hay daños visibles
  deckingCondition?: string;       // Estado del entablado (excelente, bueno, regular, malo)
  roofPenetrations?: {             // Penetraciones en el techo
    chimneys?: number;
    skylights?: number;
    vents?: number;
    other?: number;
  };
  ventilation?: string;            // Tipo de ventilación existente o requerida
  underlaymentType?: string;       // Tipo de membrana impermeabilizante
  valleyType?: string;             // Tipo de valle (metal abierto, tejido, cerrado)
  ridgeVent?: boolean;             // Si el techo necesita ventilación de cumbrera
  specialRequirements?: string[];  // Requisitos especiales (resistencia a impactos, etc.)
  
  // Campos para proyectos de cercas (fencing)
  fencePurpose?: string;            // Propósito principal (privacidad, decorativo, seguridad)
  soilType?: string;                // Tipo de suelo
  windLoad?: string | number;       // Carga de viento en la zona
  postSpacing?: number;             // Espaciado entre postes en pies
  cornerPosts?: number;             // Número de postes de esquina
  terrain?: string;                 // Condiciones del terreno (plano, inclinado, etc.)
  
  // Campos para proyectos de terraza (decking)
  supportStructure?: string;        // Tipo de estructura de soporte
  joistSpacing?: number;            // Espaciado entre vigas en pulgadas
  groundClearance?: number;         // Espacio entre el suelo y la terraza en pulgadas
  fasteningMethod?: string;         // Método de fijación (tornillos visibles, clips ocultos)
  
  // Campos para proyectos de concreto (concrete)
  reinforcement?: string;           // Tipo de refuerzo (malla, barras, fibra)
  expansionJoints?: boolean;        // Si se requieren juntas de expansión
  drainageSlope?: number | string;  // Pendiente para drenaje
  concreteFinish?: string;          // Acabado deseado (pulido, estampado, etc.)
  
  // Campos genéricos para todos los proyectos
  projectSubtype?: string;          // Subtipo específico del proyecto
  timeline?: {                      // Plazos del proyecto
    desiredStartDate?: Date | string;
    deadline?: Date | string;
    flexibleTiming?: boolean;
  };
  budgetRange?: {                   // Rango de presupuesto
    min?: number;
    max?: number;
    flexible?: boolean;
  };
  accessibilityIssues?: string[];   // Problemas de accesibilidad al sitio
}

/**
 * Imagen del proyecto (para análisis o referencia)
 */
export interface ProjectImage {
  id: string;
  url: string;
  type: 'site' | 'reference' | 'sketch';
  notes?: string;
}

/**
 * Resultado final del estimado generado
 */
export interface EstimateResult {
  estimateId: string;
  clientInfo: Client;
  projectSummary: string;
  materialCost: number;
  laborCost: number;
  equipmentCost?: number;
  totalCost: number;
  pdfUrl: string;
  createdAt: Date;
}

/**
 * Respuesta de chatbot con posible acción requerida
 */
export interface ChatResponse {
  response: string;
  isActionRequired: boolean;
  action?: string;
  requiredInfo?: any;
}

/**
 * Actividad registrada para análisis y métricas
 */
export interface ActivityLog {
  type: string;
  sessionId: string;
  mode: InputMode;
  clientId?: string;
  projectType?: string;
  timestamp: Date;
  duration?: number;
  success?: boolean;
  details?: any;
}