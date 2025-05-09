import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { MistralAIClient } from '../../src/services/mistral.client';

// Mock de axios para pruebas
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MistralAIClient', () => {
  let mistralClient: MistralAIClient;
  const mockApiKey = 'test-api-key-12345';
  
  // Respuestas simuladas para las pruebas
  const mockCompleteResponse = {
    data: {
      choices: [
        {
          message: {
            content: 'Respuesta de prueba para completado de texto'
          }
        }
      ]
    }
  };
  
  const mockOcrResponse = {
    data: {
      choices: [
        {
          message: {
            content: 'Texto extraído de la imagen: Especificaciones técnicas...'
          }
        }
      ]
    }
  };
  
  const mockBlueprintAnalysisResponse = {
    data: {
      choices: [
        {
          message: {
            content: JSON.stringify({
              dimensions: {
                width: '10m',
                length: '15m',
                area: '150m²'
              },
              elements: [
                { type: 'wall', length: '5m' },
                { type: 'door', width: '1.2m' }
              ],
              materials: ['wood', 'metal']
            })
          }
        }
      ]
    }
  };
  
  // Configuración previa a cada prueba
  beforeEach(() => {
    mistralClient = new MistralAIClient(mockApiKey);
    jest.clearAllMocks();
  });
  
  describe('complete', () => {
    it('debe realizar una petición POST correcta a la API de Mistral', async () => {
      // Configurar mock de axios
      mockedAxios.post.mockResolvedValueOnce(mockCompleteResponse);
      
      // Ejecutar método
      const result = await mistralClient.complete({
        prompt: 'Texto de prueba',
        temperature: 0.7
      });
      
      // Verificar llamada a axios
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/chat/completions',
        expect.objectContaining({
          model: 'mistral-large-latest',
          messages: [{ role: 'user', content: 'Texto de prueba' }],
          temperature: 0.7
        }),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mockApiKey}`
          }
        })
      );
      
      // Verificar respuesta
      expect(result).toBe('Respuesta de prueba para completado de texto');
    });
    
    it('debe incluir el mensaje del sistema cuando se proporciona', async () => {
      // Configurar mock de axios
      mockedAxios.post.mockResolvedValueOnce(mockCompleteResponse);
      
      // Ejecutar método con mensaje del sistema
      await mistralClient.complete({
        prompt: 'Texto de prueba',
        systemMessage: 'Eres un asistente especializado en construcción'
      });
      
      // Verificar que el mensaje del sistema se incluya
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'Eres un asistente especializado en construcción' },
            { role: 'user', content: 'Texto de prueba' }
          ]
        }),
        expect.any(Object)
      );
    });
    
    it('debe manejar errores correctamente', async () => {
      // Configurar mock de axios para simular error
      const errorMessage = 'Error de API simulado';
      mockedAxios.post.mockRejectedValueOnce(new Error(errorMessage));
      
      // Verificar que se lance error
      await expect(mistralClient.complete({
        prompt: 'Texto de prueba'
      })).rejects.toThrow(`Error en API de Mistral: ${errorMessage}`);
    });
  });
  
  describe('performOCR', () => {
    // Preparar buffer de imagen simulado
    const mockImageBuffer = Buffer.from('imagen simulada');
    
    it('debe realizar una petición POST correcta para OCR', async () => {
      // Configurar mock de axios
      mockedAxios.post.mockResolvedValueOnce(mockOcrResponse);
      
      // Ejecutar método
      const result = await mistralClient.performOCR({
        imageBuffer: mockImageBuffer
      });
      
      // Verificar llamada a axios
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/chat/completions',
        expect.objectContaining({
          model: 'mistral-vision',
          messages: [
            {
              role: 'user',
              content: expect.arrayContaining([
                { type: 'text', text: expect.any(String) },
                { 
                  type: 'image_url', 
                  image_url: {
                    url: expect.stringContaining('base64')
                  }
                }
              ])
            }
          ]
        }),
        expect.any(Object)
      );
      
      // Verificar respuesta
      expect(result).toBe('Texto extraído de la imagen: Especificaciones técnicas...');
    });
    
    it('debe usar prompt detallado cuando se solicita', async () => {
      // Configurar mock de axios
      mockedAxios.post.mockResolvedValueOnce(mockOcrResponse);
      
      // Ejecutar método con detailed=true
      await mistralClient.performOCR({
        imageBuffer: mockImageBuffer,
        detailed: true
      });
      
      // Verificar que se usa un prompt más detallado
      const call = mockedAxios.post.mock.calls[0][1];
      const message = call.messages[0];
      const textContent = message.content[0].text;
      
      expect(textContent).toContain('plano arquitectónico o técnico');
      expect(textContent).toContain('dimensiones');
      expect(textContent).toContain('especificaciones de materiales');
    });
  });
  
  describe('analyzeBlueprintImage', () => {
    // Preparar buffer de imagen simulado
    const mockImageBuffer = Buffer.from('imagen de plano simulado');
    
    it('debe realizar una petición POST correcta para análisis de planos', async () => {
      // Configurar mock de axios
      mockedAxios.post.mockResolvedValueOnce(mockBlueprintAnalysisResponse);
      
      // Ejecutar método
      const result = await mistralClient.analyzeBlueprintImage({
        imageBuffer: mockImageBuffer,
        projectType: 'fencing',
        outputFormat: 'json'
      });
      
      // Verificar llamada a axios
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/chat/completions',
        expect.objectContaining({
          model: 'mistral-vision',
          messages: [
            {
              role: 'user',
              content: expect.arrayContaining([
                { type: 'text', text: expect.stringContaining('fencing') },
                { 
                  type: 'image_url', 
                  image_url: {
                    url: expect.stringContaining('base64')
                  }
                }
              ])
            }
          ],
          response_format: { type: "json_object" }
        }),
        expect.any(Object)
      );
      
      // Verificar que el resultado es un objeto parseado correctamente
      expect(result).toEqual(expect.objectContaining({
        dimensions: expect.any(Object),
        elements: expect.any(Array),
        materials: expect.any(Array)
      }));
    });
    
    it('debe configurar el formato de respuesta según el parámetro outputFormat', async () => {
      // Configurar mock de axios
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: 'Análisis en texto plano' } }]
        }
      });
      
      // Ejecutar método con outputFormat=text
      await mistralClient.analyzeBlueprintImage({
        imageBuffer: mockImageBuffer,
        outputFormat: 'text'
      });
      
      // Verificar que no se solicita JSON
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({
          response_format: expect.anything()
        }),
        expect.any(Object)
      );
    });
    
    it('debe manejar correctamente errores de parsing JSON', async () => {
      // Configurar mock de axios con respuesta que no es JSON válido
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: 'Esto no es JSON válido' } }]
        }
      });
      
      // Ejecutar método
      const result = await mistralClient.analyzeBlueprintImage({
        imageBuffer: mockImageBuffer,
        outputFormat: 'json'
      });
      
      // Verificar que se maneja el error de parsing
      expect(result).toEqual(expect.objectContaining({
        error: 'No se pudo parsear JSON',
        rawText: 'Esto no es JSON válido'
      }));
    });
    
    it('debe intentar extraer JSON de texto cuando el parsing falla', async () => {
      // Texto con JSON embebido
      const textWithJson = 'Aquí hay algunos resultados: { "dimensions": { "width": "5m" } } Y más texto';
      
      // Configurar mock de axios
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: textWithJson } }]
        }
      });
      
      // Ejecutar método
      const result = await mistralClient.analyzeBlueprintImage({
        imageBuffer: mockImageBuffer,
        outputFormat: 'json'
      });
      
      // Verificar que se extrajo el JSON embebido
      expect(result).toEqual(expect.objectContaining({
        dimensions: expect.objectContaining({
          width: "5m"
        })
      }));
    });
  });
});