import { OpenAIClient } from './openai.client';
import { AnthropicClient } from './anthropic.client';
import { ApiUsageService } from './api-usage.service';
import { config } from '../config/config';

/**
 * Servicio centralizado para todas las interacciones con IA
 * Elimina la duplicación de cliente de IA en múltiples motores
 */
export class AIService {
  constructor(
    private readonly openAIClient: OpenAIClient,
    private readonly anthropicClient: AnthropicClient,
    private readonly apiUsageService: ApiUsageService
  ) {}

  /**
   * Completa un prompt usando el servicio de OpenAI
   */
  async completeWithOpenAI(options: {
    prompt: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    stopSequences?: string[];
  }): Promise<string> {
    const { prompt, model, maxTokens, temperature, stopSequences } = options;
    
    // Registrar uso de API
    this.apiUsageService.logAPIUsage('openai', 'completion', { model, promptLength: prompt.length });
    
    return this.openAIClient.complete({
      prompt,
      model: model || config.openai.completionModel,
      maxTokens: maxTokens || 1000,
      temperature: temperature !== undefined ? temperature : 0.7,
      stopSequences
    });
  }

  /**
   * Completa un prompt usando el servicio de Anthropic
   */
  async completeWithAnthropic(options: {
    prompt: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    stopSequences?: string[];
  }): Promise<string> {
    const { prompt, model, maxTokens, temperature, stopSequences } = options;
    
    // Registrar uso de API
    this.apiUsageService.logAPIUsage('anthropic', 'completion', { model, promptLength: prompt.length });
    
    return this.anthropicClient.complete({
      prompt,
      model: model || config.anthropic.model,
      maxTokens: maxTokens || 1000,
      temperature: temperature !== undefined ? temperature : 0.7,
      stopSequences
    });
  }

  /**
   * Analiza una imagen con OpenAI
   */
  async analyzeImage(options: {
    image: string;
    prompt: string;
    model?: string;
  }): Promise<string> {
    const { image, prompt, model } = options;
    
    // Registrar uso de API
    this.apiUsageService.logAPIUsage('openai', 'image-analysis', { model });
    
    return this.openAIClient.analyzeImage({
      image,
      prompt,
      model: model || 'gpt-4o'
    });
  }

  /**
   * Genera incrustaciones (embeddings) con OpenAI
   */
  async generateEmbeddings(text: string, model?: string): Promise<number[]> {
    // Registrar uso de API
    this.apiUsageService.logAPIUsage('openai', 'embeddings', { model });
    
    return this.openAIClient.getEmbeddings(text, model || config.openai.embeddingModel);
  }

  /**
   * Selecciona automáticamente el mejor modelo para una tarea específica
   * basándose en complejidad, longitud y otros factores
   */
  async smartComplete(options: {
    prompt: string;
    complexity: 'low' | 'medium' | 'high';
    promptLength: number;
    requiresCreativity?: boolean;
    requiresFactualAccuracy?: boolean;
  }): Promise<string> {
    const { prompt, complexity, promptLength, requiresCreativity, requiresFactualAccuracy } = options;
    
    // Lógica para seleccionar el modelo apropiado
    let selectedProvider: 'openai' | 'anthropic' = 'openai';
    let selectedModel: string = config.openai.completionModel;
    let temperature = 0.7;
    
    if (complexity === 'high' || promptLength > 8000) {
      // Para tareas complejas o prompts largos, usar Claude
      selectedProvider = 'anthropic';
      selectedModel = 'claude-3-opus-20240229';
    } else if (requiresFactualAccuracy) {
      // Para respuestas que priorizan precisión factual
      temperature = 0.3;
      if (selectedProvider === 'openai') {
        selectedModel = 'gpt-4o';
      }
    } else if (requiresCreativity) {
      // Para respuestas que requieren creatividad
      temperature = 0.9;
    }
    
    // Usar el proveedor seleccionado
    if (selectedProvider === 'openai') {
      return this.completeWithOpenAI({
        prompt,
        model: selectedModel,
        temperature
      });
    } else {
      return this.completeWithAnthropic({
        prompt,
        model: selectedModel,
        temperature
      });
    }
  }

  /**
   * Obtiene la capacidad del modelo (en tokens)
   */
  getModelCapacity(model: string): number {
    const modelCapacities: Record<string, number> = {
      'gpt-3.5-turbo': 16384,
      'gpt-4': 8192,
      'gpt-4o': 128000,
      'claude-instant-1': 100000,
      'claude-3-opus-20240229': 200000,
      'claude-3-sonnet-20240229': 180000
    };
    
    return modelCapacities[model] || 8000; // Valor predeterminado seguro
  }
}