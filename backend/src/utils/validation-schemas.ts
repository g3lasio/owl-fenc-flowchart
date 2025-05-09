/**
 * Esquemas de validación para las respuestas de análisis de imágenes y notas
 */
export const responseSchemas = {
  /**
   * Esquema para validar el análisis de imágenes
   */
  imageAnalysisSchema: {
    type: 'object',
    properties: {
      projectType: { type: 'string' },
      materials: {
        type: 'object',
        additionalProperties: { type: 'string' }
      },
      dimensions: {
        type: 'object',
        additionalProperties: { type: ['string', 'number'] }
      },
      conditions: {
        type: 'object',
        additionalProperties: { type: 'string' }
      },
      style: { type: 'string' },
      specialConsiderations: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['projectType']
  },

  /**
   * Esquema para validar el análisis de notas del contratista
   */
  notesAnalysisSchema: {
    type: 'object',
    properties: {
      projectType: { type: 'string' },
      projectSubtype: { type: 'string' },
      dimensions: {
        type: 'object',
        properties: {
          length: { type: ['string', 'number'] },
          height: { type: ['string', 'number'] },
          width: { type: ['string', 'number'] },
          area: { type: ['string', 'number'] }
        }
      },
      materialRequirements: {
        type: 'object',
        additionalProperties: { type: 'string' }
      },
      specialConsiderations: {
        type: ['array', 'string'],
        items: { type: 'string' }
      },
      demolitionNeeded: { type: 'boolean' },
      clientPreferences: {
        type: 'object',
        additionalProperties: { type: 'string' }
      }
    }
  },

  /**
   * Esquema para validar el análisis de ventanas
   */
  windowAnalysisSchema: {
    type: 'object',
    properties: {
      windows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            dimensions: {
              type: 'object',
              properties: {
                width: { type: ['number', 'string'] },
                height: { type: ['number', 'string'] }
              },
              required: ['width', 'height']
            },
            type: { type: 'string' },
            material: { type: 'string' },
            glass: { type: 'string' },
            style: { type: 'string' },
            condition: { type: 'string' },
            location: { type: 'string' },
            features: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['dimensions', 'type']
        }
      }
    }
  },

  /**
   * Esquema para validar la estructura de datos final
   */
  structuredDataSchema: {
    type: 'object',
    properties: {
      projectType: { type: 'string' },
      projectSubtype: { type: 'string' },
      dimensions: {
        type: 'object',
        additionalProperties: { type: 'number' }
      },
      options: {
        type: 'object',
        properties: {
          demolitionNeeded: { type: 'boolean' },
          materials: {
            type: 'object',
            additionalProperties: true
          },
          clientPreferences: {
            type: 'object',
            additionalProperties: true
          }
        }
      },
      detectedElements: {
        type: 'object',
        properties: {
          materials: { type: 'object' },
          conditions: { type: 'object' },
          specialConsiderations: { 
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    },
    required: ['projectType', 'dimensions', 'options', 'detectedElements']
  }
};