import axios from 'axios';
import { config } from '../config/config';

/**
 * Cliente para interactuar con la API de Mistral AI
 * Especializado en OCR y análisis de documentos técnicos
 */
export class MistralAIClient {
  private readonly apiKey: string;
  private readonly baseUrl: string = 'https://api.mistral.ai/v1';
  private readonly defaultModel: string = 'mistral-large-latest';
  private readonly defaultOcrModel: string = 'mistral-vision';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Realiza una petición de completado de texto a Mistral AI
   */
  async complete({ 
    prompt, 
    model = this.defaultModel, 
    maxTokens = 1000, 
    temperature = 0.5,
    systemMessage = ''
  }: {
    prompt: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemMessage?: string;
  }): Promise<string> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: model,
          messages: [
            systemMessage ? { role: 'system', content: systemMessage } : null,
            { role: 'user', content: prompt }
          ].filter(Boolean),
          max_tokens: maxTokens,
          temperature: temperature,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return response.data.choices[0].message.content;
    } catch (error: any) {
      console.error('Error en petición a Mistral AI:', error);
      throw new Error(`Error en API de Mistral: ${error.message || 'Error desconocido'}`);
    }
  }

  /**
   * Realiza análisis OCR en una imagen utilizando Mistral Vision
   * Especializado para documentos técnicos y planos arquitectónicos
   */
  async performOCR({ 
    imageBuffer, 
    prompt = 'Extrae todo el texto visible en esta imagen con formato preciso.', 
    model = this.defaultOcrModel,
    detailed = false
  }: {
    imageBuffer: Buffer;
    prompt?: string;
    model?: string;
    detailed?: boolean;
  }): Promise<string> {
    try {
      // Convertir imagen a base64
      const base64Image = imageBuffer.toString('base64');
      
      // Preparar prompt específico para OCR de planos técnicos si es detallado
      const ocrPrompt = detailed ? 
        `Este es un plano arquitectónico o técnico. Extrae todo el texto visible con precisión, 
        prestando especial atención a dimensiones, escalas, etiquetas de habitaciones, 
        anotaciones técnicas y especificaciones de materiales. Mantén el formato original 
        y organiza el texto según su posición en el plano. Incluye todas las medidas, 
        símbolos técnicos y textos de leyenda. ${prompt}` : prompt;
      
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: model,
          messages: [
            { 
              role: 'user', 
              content: [
                { type: 'text', text: ocrPrompt },
                { 
                  type: 'image_url', 
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          max_tokens: 4000,
          temperature: 0.2,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return response.data.choices[0].message.content;
    } catch (error: any) {
      console.error('Error en OCR con Mistral Vision:', error);
      throw new Error(`Error en OCR de Mistral: ${error.message || 'Error desconocido'}`);
    }
  }

  /**
   * Analiza un plano arquitectónico con Mistral Vision
   * Extrae elementos estructurales, dimensiones y especificaciones
   */
  async analyzeBlueprintImage({ 
    imageBuffer, 
    projectType = 'general',
    outputFormat = 'json'
  }: {
    imageBuffer: Buffer;
    projectType?: string;
    outputFormat?: 'json' | 'text';
  }): Promise<any> {
    try {
      // Convertir imagen a base64
      const base64Image = imageBuffer.toString('base64');
      
      // Prompt especializado para análisis de planos arquitectónicos
      const analysisPrompt = `
      Analiza este plano arquitectónico para un proyecto de ${projectType}.
      
      1. Identifica todas las dimensiones visibles (ancho, largo, alto, área).
      2. Detecta todos los elementos arquitectónicos (paredes, puertas, ventanas, columnas).
      3. Identifica habitaciones y espacios con sus áreas si están disponibles.
      4. Encuentra especificaciones de materiales.
      5. Detecta la escala del plano si está presente.
      
      Responde con un análisis estructurado ${outputFormat === 'json' ? 'en formato JSON' : 'en texto detallado'}.
      `;
      
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: 'mistral-vision',
          messages: [
            { 
              role: 'user', 
              content: [
                { type: 'text', text: analysisPrompt },
                { 
                  type: 'image_url', 
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`
                  }
                }
              ]
            }
          ],
          max_tokens: 4000,
          temperature: 0.2,
          response_format: outputFormat === 'json' ? { type: "json_object" } : undefined
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      const result = response.data.choices[0].message.content;
      
      // Si el formato es JSON, intentar parsearlo
      if (outputFormat === 'json') {
        try {
          return JSON.parse(result);
        } catch (parseError) {
          console.error('Error parseando respuesta JSON de Mistral:', parseError);
          // Si falla el parsing, intentar extraer la parte JSON
          const jsonMatch = result.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
          // Si todo falla, devolver el texto plano
          return { error: 'No se pudo parsear JSON', rawText: result };
        }
      }
      
      return result;
    } catch (error: any) {
      console.error('Error en análisis de plano con Mistral Vision:', error);
      throw new Error(`Error en análisis de plano con Mistral: ${error.message || 'Error desconocido'}`);
    }
  }
}