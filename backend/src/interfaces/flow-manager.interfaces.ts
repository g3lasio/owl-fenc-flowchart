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
    height?: number;  // Altura en pies (para cercas, etc.)
    width?: number;   // Ancho en pies
    squareFeet?: number;  // Pies cuadrados (para terrazas, patios, etc.)
    thickness?: number;   // Espesor en pulgadas (para concreto, etc.)
    [key: string]: number | undefined;  // Otras dimensiones específicas
  };
  style?: string;     // Estilo específico del proyecto
  color?: string;     // Color principal
  finish?: string;    // Acabado (smooth, textured, etc.)
  gates?: {           // Información de puertas (para cercas)
    width: number;    // Ancho de la puerta en pies
    type?: string;    // Tipo de puerta
  }[];
  railingType?: string;  // Tipo de barandilla (para terrazas)
  stairs?: boolean;      // Si incluye escaleras (para terrazas)
  demolition?: boolean;  // Si requiere demolición de estructura existente
  permitNeeded?: boolean;  // Si se necesita permiso
  options?: {           // Opciones adicionales específicas
    [key: string]: any;
  };
  notes?: string;       // Notas adicionales
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