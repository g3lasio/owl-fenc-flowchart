import { config } from '../config/config';
import axios from 'axios';
import { ApiUsageService } from './api-usage.service';

/**
 * Cliente mejorado para OpenAI con monitoreo de uso y manejo avanzado de errores
 */
export class OpenAIClient {
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';
  private maxRetries: number;
  private retryDelay: number;
  private defaultModel: string;
  private defaultTemperature: number;
  private apiUsageService: ApiUsageService;
  
  constructor(apiKey?: string, apiUsageService?: ApiUsageService) {
    this.apiKey = apiKey || config.openai.apiKey || '';
    this.maxRetries = config.openai.maxRetries;
    this.retryDelay = config.openai.retryDelay;
    this.defaultModel = config.openai.model;
    this.defaultTemperature = config.openai.temperature;
    
    // Inicializar o usar servicio de monitoreo proporcionado
    this.apiUsageService = apiUsageService || new ApiUsageService();
    
    if (!this.apiKey) {
      console.warn('OpenAIClient inicializado sin API key. Las solicitudes fallarán.');
    }
  }
  
  /**
   * Completa un texto utilizando el modelo GPT
   */
  async complete({ 
    prompt, 
    model = this.defaultModel, 
    maxTokens = 1000, 
    temperature = this.defaultTemperature,
    systemMessage = 'You are a helpful assistant specialized in construction and material estimation.'
  }: {
    prompt: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemMessage?: string;
  }): Promise<string> {
    // Validar que tenemos API key antes de hacer la solicitud
    if (!this.apiKey) {
      throw new Error('OpenAI API key no configurada');
    }
    
    // Verificar límites de uso antes de realizar la llamada
    if (!this.apiUsageService.isSafeToUseOpenAI()) {
      throw new Error('Límite de uso de OpenAI excedido. Por favor intenta más tarde.');
    }
    
    const endpoint = '/chat/completions';
    
    // Preparar mensajes según el formato de la API de OpenAI
    const messages = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: prompt }
    ];
    
    const payload = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    };
    
    try {
      // Intentar con reintentos automáticos
      const response = await this.executeWithRetry(() => this.makeApiRequest(endpoint, payload));
      
      // Estimar tokens para monitoreo
      // Aproximación simple: contar caracteres y dividir por 4 para prompt tokens
      const promptTokens = Math.ceil((systemMessage.length + prompt.length) / 4);
      const completionTokens = Math.ceil(response.length / 4);
      
      // Registrar uso de la API
      this.apiUsageService.logOpenAIUsage(promptTokens, completionTokens);
      
      return response;
    } catch (error) {
      console.error('Error en OpenAI.complete:', error);
      throw error;
    }
  }
  
  /**
   * Genera embeddings para un texto
   */
  async createEmbedding(input: string): Promise<number[]> {
    // Validar que tenemos API key antes de hacer la solicitud
    if (!this.apiKey) {
      throw new Error('OpenAI API key no configurada');
    }
    
    const endpoint = '/embeddings';
    const payload = {
      model: 'text-embedding-ada-002',
      input
    };
    
    return this.executeWithRetry(async () => {
      const response = await this.makeApiRequest(endpoint, payload);
      return response.data[0].embedding;
    });
  }
  
  /**
   * Hace la solicitud a la API de OpenAI
   */
  private async makeApiRequest(endpoint: string, payload: any): Promise<any> {
    try {
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        data: payload
      });
      
      // Para completions, extraer el texto de respuesta
      if (endpoint === '/chat/completions') {
        return response.data.choices[0].message.content;
      }
      
      // Para otros endpoints, devolver la respuesta completa
      return response.data;
      
    } catch (error: any) {
      // Mejorar mensaje de error para depuración
      const statusCode = error.response?.status;
      const errorData = error.response?.data;
      
      // Registrar error detallado
      console.error(`Error en OpenAI API (${statusCode}):`, errorData);
      
      let errorMessage = 'Error al llamar a OpenAI API';
      
      // Errores comunes y mensajes más informativos
      if (statusCode === 401) {
        errorMessage = 'API key de OpenAI inválida o expirada';
      } else if (statusCode === 429) {
        errorMessage = 'Límite de tasa excedido en OpenAI API. Intenta más tarde.';
      } else if (statusCode === 500) {
        errorMessage = 'Error del servidor de OpenAI. Intenta más tarde.';
      } else if (errorData?.error?.message) {
        errorMessage = `OpenAI API: ${errorData.error.message}`;
      }
      
      throw new Error(errorMessage);
    }
  }
  
  /**
   * Ejecuta una función con reintentos automáticos
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    
    // Implementación de backoff exponencial para reintentos
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        // Si no es un error de tasa o del servidor, no reintentar
        if (error.response?.status !== 429 && error.response?.status !== 500) {
          throw error;
        }
        
        // Calcular retardo exponencial (2^attempt * retryDelay)
        const delay = this.retryDelay * Math.pow(2, attempt);
        console.warn(`Reintento ${attempt + 1}/${this.maxRetries} después de ${delay}ms`);
        
        // Esperar antes del siguiente intento
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Si llegamos aquí, fallaron todos los reintentos
    throw lastError || new Error('Error desconocido en OpenAI client');
  }
}