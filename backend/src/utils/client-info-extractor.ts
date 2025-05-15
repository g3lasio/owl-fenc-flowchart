import { Client } from '../interfaces/flow-manager.interfaces';

/**
 * Extensión del FlowManagerEngine con funcionalidades para obtener información del cliente
 */
export class ClientInfoExtractor {
  /**
   * Obtiene la información del cliente desde el contexto de sesión 
   * @param sessionId ID de la sesión
   * @returns Información del cliente 
   */
  static getClientInfo(sessionId: string): Client {
    // En una implementación real, esto recuperaría la información de una base de datos
    // o del contexto de sesión
    
    // Devolvemos datos simulados para la demo
    return {
      id: 'client_12345',
      name: 'Carlos Rodríguez',
      email: 'carlos@example.com',
      phone: '555-789-1234',
      address: {
        street: '789 Calle del Sol',
        city: 'Miami',
        state: 'FL',
        zipCode: '33101'
      }
    };
  }
}
