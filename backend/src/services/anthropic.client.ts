import { config } from '../config/config';
import axios from 'axios';
import { ApiUsageService } from './api-usage.service';

/**
 * Cliente mejorado para Anthropic Claude con monitoreo de uso y manejo avanzado de errores
 */
export class AnthropicClient {
  private apiKey: string;
  private baseUrl = 'https://api.anthropic.com/v1';
  private maxRetries: number;
  private retryDelay: number;
  private defaultModel: string;
  private defaultTemperature: number;
  private apiUsageService: ApiUsageService;
  
  constructor(apiKey?: string, apiUsageService?: ApiUsageService) {
    this.apiKey = apiKey || config.anthropic.apiKey || '';
    this.maxRetries = config.anthropic.maxRetries;
    this.retryDelay = config.anthropic.retryDelay;
    this.defaultModel = config.anthropic.model;
    this.defaultTemperature = config.anthropic.temperature;
    
    // Inicializar o usar servicio de monitoreo proporcionado
    this.apiUsageService = apiUsageService || new ApiUsageService();
    
    if (!this.apiKey) {
      console.warn('AnthropicClient inicializado sin API key. Las solicitudes fallarán.');
    }
  }
  
  /**
   * Completa un texto utilizando el modelo Claude de Anthropic
   */
  async complete({ 
    prompt, 
    model = this.defaultModel, 
    maxTokens = 2000, 
    temperature = this.defaultTemperature,
    systemMessage = 'You are Claude, a helpful AI assistant specialized in construction and estimation for contractors. Be concise and direct with your answers.'
  }: {
    prompt: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemMessage?: string;
  }): Promise<string> {
    // Validar que tenemos API key antes de hacer la solicitud
    if (!this.apiKey) {
      throw new Error('Anthropic API key no configurada');
    }
    
    // Verificar límites de uso antes de realizar la llamada
    if (!this.apiUsageService.isSafeToUseAnthropic()) {
      throw new Error('Límite de uso de Anthropic excedido. Por favor intenta más tarde.');
    }
    
    // Detectar si estamos usando v1 (legacy) o v2 de la API (Claude-3)
    const isClaudeThree = model.includes('claude-3');
    
    // Formatear el payload según la versión de la API
    let payload;
    if (isClaudeThree) {
      // Formato para Claude-3 (API v2)
      payload = {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt }
        ]
      };
    } else {
      // Formato legacy para Claude-2 y anteriores (API v1)
      payload = {
        model,
        prompt: `\n\nHuman: ${prompt}\n\nAssistant:`,
        max_tokens_to_sample: maxTokens,
        temperature,
        stop_sequences: ["\n\nHuman:"]
      };
    }
    
    try {
      // Ejecutar con reintentos automáticos
      const endpoint = isClaudeThree ? '/messages' : '/completions';
      const response = await this.executeWithRetry(async () => {
        const apiResponse = await this.makeApiRequest(endpoint, payload);
        
        // Extraer el texto según la versión de la API
        if (isClaudeThree) {
          return apiResponse.content[0].text;
        } else {
          return apiResponse.completion.trim();
        }
      });
      
      // Estimar tokens para monitoreo
      // Aproximación simple: contar caracteres y dividir por 4
      const promptTokens = Math.ceil((systemMessage.length + prompt.length) / 4);
      const completionTokens = Math.ceil(response.length / 4);
      
      // Registrar uso de la API
      this.apiUsageService.logAnthropicUsage(promptTokens, completionTokens);
      
      return response;
    } catch (error) {
      console.error('Error en Anthropic.complete:', error);
      throw error;
    }
  }
  
  /**
   * Hace la solicitud a la API de Anthropic
   */
  private async makeApiRequest(endpoint: string, payload: any): Promise<any> {
    try {
      // Determinar la versión de API por el endpoint
      const apiVersion = endpoint === '/messages' ? '2023-06-01' : '2023-01-01';
      
      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'Anthropic-Version': apiVersion
        },
        data: payload
      });
      
      return response.data;
      
    } catch (error: any) {
      // Mejorar mensaje de error para depuración
      const statusCode = error.response?.status;
      const errorData = error.response?.data;
      
      // Registrar error detallado
      console.error(`Error en Anthropic API (${statusCode}):`, errorData);
      
      let errorMessage = 'Error al llamar a Anthropic API';
      
      // Errores comunes y mensajes más informativos
      if (statusCode === 401) {
        errorMessage = 'API key de Anthropic inválida o expirada';
      } else if (statusCode === 429) {
        errorMessage = 'Límite de tasa excedido en Anthropic API. Intenta más tarde.';
      } else if (statusCode === 500) {
        errorMessage = 'Error del servidor de Anthropic. Intenta más tarde.';
      } else if (errorData?.error?.message) {
        errorMessage = `Anthropic API: ${errorData.error.message}`;
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
    throw lastError || new Error('Error desconocido en Anthropic client');
  }
}