import { 
  ModelSelectionStrategy, 
  ModelPriority, 
  TaskType, 
  ModelSelectionParams, 
  SelectedModel 
} from '../../src/utils/model-selection';

describe('ModelSelectionStrategy', () => {
  describe('selectModel', () => {
    test('should select model for text completion with balanced priority', () => {
      const params: ModelSelectionParams = {
        taskType: TaskType.TEXT_COMPLETION,
        priority: ModelPriority.BALANCED
      };
      
      const result = ModelSelectionStrategy.selectModel(params);
      
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-3.5-turbo');
      expect(result.useFallback).toBe(true);
      expect(result.fallbackModel).toBeDefined();
    });
    
    test('should select model for image analysis', () => {
      const params: ModelSelectionParams = {
        taskType: TaskType.IMAGE_ANALYSIS,
        requiresVision: true
      };
      
      const result = ModelSelectionStrategy.selectModel(params);
      
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4o');
      expect(result.useFallback).toBe(true);
      expect(result.fallbackModel?.model).toBe('gpt-4-vision-preview');
    });
    
    test('should select model for complex reasoning with quality priority', () => {
      const params: ModelSelectionParams = {
        taskType: TaskType.COMPLEX_REASONING,
        priority: ModelPriority.QUALITY
      };
      
      const result = ModelSelectionStrategy.selectModel(params);
      
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4o');
      expect(result.useFallback).toBe(true);
    });
    
    test('should select model for code tasks with balanced priority', () => {
      const params: ModelSelectionParams = {
        taskType: TaskType.CODE,
        priority: ModelPriority.BALANCED
      };
      
      const result = ModelSelectionStrategy.selectModel(params);
      
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4-turbo');
      expect(result.useFallback).toBe(true);
    });
    
    test('should select model for text completion with cost priority', () => {
      const params: ModelSelectionParams = {
        taskType: TaskType.TEXT_COMPLETION,
        priority: ModelPriority.COST
      };
      
      const result = ModelSelectionStrategy.selectModel(params);
      
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-3.5-turbo');
      expect(result.useFallback).toBe(true);
    });
    
    test('should select model for large context inputs', () => {
      const params: ModelSelectionParams = {
        taskType: TaskType.COMPLEX_REASONING,
        priority: ModelPriority.QUALITY,
        inputTokens: 120000
      };
      
      const result = ModelSelectionStrategy.selectModel(params);
      
      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-3-opus-20240229');
      expect(result.useFallback).toBe(true);
    });
    
    test('should select model for json output requirements', () => {
      const params: ModelSelectionParams = {
        taskType: TaskType.TEXT_COMPLETION,
        priority: ModelPriority.QUALITY,
        requiresJsonOutput: true
      };
      
      const result = ModelSelectionStrategy.selectModel(params);
      
      expect(result.provider).toBe('openai');
      expect(result.useFallback).toBe(true);
    });
    
    test('should select model for embeddings task', () => {
      const params: ModelSelectionParams = {
        taskType: TaskType.EMBEDDINGS
      };
      
      const result = ModelSelectionStrategy.selectModel(params);
      
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('text-embedding-3-small');
      expect(result.temperature).toBe(0);
    });
    
    test('should adjust temperature for high accuracy tasks', () => {
      const params: ModelSelectionParams = {
        taskType: TaskType.TEXT_COMPLETION,
        requiresHighAccuracy: true
      };
      
      const result = ModelSelectionStrategy.selectModel(params);
      
      expect(result.temperature).toBeLessThan(0.5);
    });
    
    test('should adjust temperature for creative tasks', () => {
      const params: ModelSelectionParams = {
        taskType: TaskType.TEXT_COMPLETION,
        requiresCreativity: true
      };
      
      const result = ModelSelectionStrategy.selectModel(params);
      
      expect(result.temperature).toBeGreaterThan(0.7);
    });
  });
  
  describe('estimateTokenCount', () => {
    test('should estimate token count from text', () => {
      const shortText = 'This is a short text.';
      const longText = 'This is a much longer text that should have more tokens than the short text. ' +
                       'It contains multiple sentences to ensure that the estimation function has ' +
                       'enough content to work with and produce a meaningful estimate.';
      
      const shortCount = ModelSelectionStrategy.estimateTokenCount(shortText);
      const longCount = ModelSelectionStrategy.estimateTokenCount(longText);
      
      expect(shortCount).toBeGreaterThan(0);
      expect(longCount).toBeGreaterThan(shortCount);
      // Allow more flexibility in the token estimation test
      expect(shortCount).toBeGreaterThanOrEqual(Math.floor(shortText.length / 5));
      expect(longCount).toBeGreaterThanOrEqual(Math.floor(longText.length / 5));
    });
    
    test('should handle empty text', () => {
      expect(ModelSelectionStrategy.estimateTokenCount('')).toBe(0);
      expect(ModelSelectionStrategy.estimateTokenCount(null as unknown as string)).toBe(0);
      expect(ModelSelectionStrategy.estimateTokenCount(undefined as unknown as string)).toBe(0);
    });
  });
});
