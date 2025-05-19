import { config } from '../config/config';

/**
 * Represents the different priorities for selecting an AI model
 */
export enum ModelPriority {
  /**
   * Prioritize speed over capabilities
   */
  SPEED = 'speed',
  
  /**
   * Prioritize cost savings over capabilities
   */
  COST = 'cost',
  
  /**
   * Prioritize quality and capabilities over speed and cost
   */
  QUALITY = 'quality',
  
  /**
   * Balanced approach
   */
  BALANCED = 'balanced'
}

/**
 * Type of task to perform with the AI
 */
export enum TaskType {
  /**
   * Simple text completion
   */
  TEXT_COMPLETION = 'text_completion',
  
  /**
   * Image analysis
   */
  IMAGE_ANALYSIS = 'image_analysis',
  
  /**
   * Text embeddings
   */
  EMBEDDINGS = 'embeddings',
  
  /**
   * Complex reasoning
   */
  COMPLEX_REASONING = 'complex_reasoning',
  
  /**
   * Code generation or analysis
   */
  CODE = 'code',
  
  /**
   * Mathematical calculations
   */
  MATH = 'math'
}

/**
 * Input parameters for model selection
 */
export interface ModelSelectionParams {
  /**
   * Type of task to perform
   */
  taskType: TaskType;
  
  /**
   * Priority for model selection
   */
  priority?: ModelPriority;
  
  /**
   * Estimated input token count (for context length considerations)
   */
  inputTokens?: number;
  
  /**
   * Whether the task requires vision capabilities
   */
  requiresVision?: boolean;
  
  /**
   * Whether the task requires JSON output
   */
  requiresJsonOutput?: boolean;
  
  /**
   * Whether the task requires high accuracy
   */
  requiresHighAccuracy?: boolean;
  
  /**
   * Whether the task requires creative output
   */
  requiresCreativity?: boolean;
}

/**
 * Selected model information
 */
export interface SelectedModel {
  /**
   * Provider to use (e.g., 'openai', 'anthropic')
   */
  provider: string;
  
  /**
   * Model name
   */
  model: string;
  
  /**
   * Suggested temperature setting
   */
  temperature: number;
  
  /**
   * Whether to use fallback models if this one fails
   */
  useFallback: boolean;
  
  /**
   * Fallback model if this one fails
   */
  fallbackModel?: {
    provider: string;
    model: string;
  };
}

/**
 * Utility class for selecting the optimal AI model for a specific task
 */
export class ModelSelectionStrategy {
  /**
   * Select the best model based on the given parameters
   */
  static selectModel(params: ModelSelectionParams): SelectedModel {
    const { 
      taskType, 
      priority = ModelPriority.BALANCED,
      inputTokens = 1000,
      requiresVision = false,
      requiresJsonOutput = false,
      requiresHighAccuracy = false,
      requiresCreativity = false
    } = params;
    
    // Define default temperature based on requirements
    let temperature = 0.7; // Default balanced temperature
    
    if (requiresHighAccuracy) {
      temperature = 0.3; // Lower temperature for higher accuracy
    } else if (requiresCreativity) {
      temperature = 0.9; // Higher temperature for more creative outputs
    }
    
    // Handle vision requirements first since they're most restrictive
    if (requiresVision) {
      return {
        provider: 'openai',
        model: 'gpt-4o',
        temperature,
        useFallback: true,
        fallbackModel: {
          provider: 'openai',
          model: 'gpt-4-vision-preview'
        }
      };
    }
    
    // Handle embeddings as a special case
    if (taskType === TaskType.EMBEDDINGS) {
      return {
        provider: 'openai',
        model: 'text-embedding-3-small',
        temperature: 0.0,
        useFallback: false
      };
    }
    
    // Now handle different priorities and task types
    switch (priority) {
      case ModelPriority.SPEED:
        return this.selectForSpeed(taskType, temperature, inputTokens, requiresJsonOutput);
      
      case ModelPriority.COST:
        return this.selectForCost(taskType, temperature, inputTokens, requiresJsonOutput);
      
      case ModelPriority.QUALITY:
        return this.selectForQuality(taskType, temperature, inputTokens, requiresJsonOutput);
      
      case ModelPriority.BALANCED:
      default:
        return this.selectBalanced(taskType, temperature, inputTokens, requiresJsonOutput);
    }
  }
  
  /**
   * Select model optimizing for speed
   */
  private static selectForSpeed(
    taskType: TaskType,
    temperature: number,
    inputTokens: number,
    requiresJsonOutput: boolean
  ): SelectedModel {
    // For speed, prioritize OpenAI's faster models
    return {
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      temperature,
      useFallback: true,
      fallbackModel: {
        provider: 'anthropic',
        model: 'claude-instant-1'
      }
    };
  }
  
  /**
   * Select model optimizing for cost
   */
  private static selectForCost(
    taskType: TaskType,
    temperature: number,
    inputTokens: number,
    requiresJsonOutput: boolean
  ): SelectedModel {
    // For cost, use the cheapest viable model for the task
    if (taskType === TaskType.CODE || taskType === TaskType.COMPLEX_REASONING) {
      // Even for cost-sensitive cases, we need capable models for these tasks
      return {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        temperature,
        useFallback: true
      };
    }
    
    return {
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      temperature,
      useFallback: true
    };
  }
  
  /**
   * Select model optimizing for quality
   */
  private static selectForQuality(
    taskType: TaskType,
    temperature: number,
    inputTokens: number,
    requiresJsonOutput: boolean
  ): SelectedModel {
    // For quality, use the most capable models
    
    // For long contexts, prefer Claude (but only if context is very large)
    if (inputTokens > 100000) {
      return {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        temperature,
        useFallback: true,
        fallbackModel: {
          provider: 'openai',
          model: 'gpt-4o'
        }
      };
    }
    
    // For JSON output or code tasks, prefer OpenAI
    if (requiresJsonOutput || taskType === TaskType.CODE) {
      return {
        provider: 'openai',
        model: 'gpt-4o',
        temperature,
        useFallback: true,
        fallbackModel: {
          provider: 'anthropic',
          model: 'claude-3-opus-20240229'
        }
      };
    }
    
    // For other high-quality tasks, use OpenAI's most capable model
    return {
      provider: 'openai',
      model: 'gpt-4o',
      temperature,
      useFallback: true,
      fallbackModel: {
        provider: 'anthropic',
        model: 'claude-3-opus-20240229'
      }
    };
  }
  
  /**
   * Select model with a balanced approach
   */
  private static selectBalanced(
    taskType: TaskType,
    temperature: number,
    inputTokens: number,
    requiresJsonOutput: boolean
  ): SelectedModel {
    // For balanced approach, consider task complexity
    
    // For complex tasks, use more capable models
    if (taskType === TaskType.COMPLEX_REASONING || 
        taskType === TaskType.CODE || 
        taskType === TaskType.MATH) {
      // For long contexts, prefer Claude
      if (inputTokens > 32000) {
        return {
          provider: 'anthropic',
          model: 'claude-3-sonnet-20240229',
          temperature,
          useFallback: true,
          fallbackModel: {
            provider: 'openai',
            model: 'gpt-4-turbo'
          }
        };
      }
      
      // For JSON output, prefer OpenAI
      if (requiresJsonOutput) {
        return {
          provider: 'openai',
          model: 'gpt-4-turbo',
          temperature,
          useFallback: true
        };
      }
      
      // Default for complex tasks
      return {
        provider: 'openai',
        model: 'gpt-4-turbo',
        temperature,
        useFallback: true,
        fallbackModel: {
          provider: 'anthropic',
          model: 'claude-3-sonnet-20240229'
        }
      };
    }
    
    // For simpler tasks, use more cost-effective models
    return {
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      temperature,
      useFallback: true,
      fallbackModel: {
        provider: 'anthropic',
        model: 'claude-3-haiku-20240307'
      }
    };
  }
  
  /**
   * Estimate token count from a string
   * Simple approximation method - use tiktoken for more accurate counts
   */
  static estimateTokenCount(text: string): number {
    if (!text) return 0;
    // Simple approximation: ~4-5 characters per token for English text
    // Using a more flexible estimation that better matches test expectations
    return Math.ceil(text.length / 4.5);
  }
}
