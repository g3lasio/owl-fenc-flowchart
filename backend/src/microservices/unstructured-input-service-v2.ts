import { MicroserviceBase, MessageBroker } from '../architecture/microservices-architecture';
import { AIServiceV2 } from '../services/ai-service-v2';
import { AICompletionOptions, AIImageAnalysisOptions } from '../interfaces/ai-provider.interfaces';
import { TieredCacheService } from '../services/tiered-cache.service';
import { config } from '../config/config';
import { ServiceFactory } from '../factories/service.factory';
import { ModelPriority, ModelSelectionStrategy, TaskType } from '../utils/model-selection';
import { Logger } from '../utils/logger';
import * as crypto from 'crypto';

/**
 * Enhanced service for processing unstructured inputs (text, images, PDFs)
 * using the new AI provider abstractions, caching, and resilience strategies.
 */
export class UnstructuredInputServiceV2 extends MicroserviceBase {
  private aiService: AIServiceV2;
  private cacheService: TieredCacheService;
  private logger: Logger;
  
  constructor(
    private readonly messageBroker: MessageBroker
  ) {
    super('UnstructuredInputServiceV2', '2.0.0');
    
    // Get services from factory
    this.aiService = ServiceFactory.getAIServiceV2();
    this.cacheService = ServiceFactory.getTieredCacheService();
    this.logger = new Logger('UnstructuredInputServiceV2');
    
    // Subscribe to events
    this.configureBrokerSubscriptions();
  }
  
  /**
   * Configure message broker subscriptions
   */
  private configureBrokerSubscriptions(): void {
    this.messageBroker.subscribe('unstructured.process-text', this.handleProcessText.bind(this));
    this.messageBroker.subscribe('unstructured.process-image', this.handleProcessImage.bind(this));
    this.messageBroker.subscribe('unstructured.process-pdf', this.handleProcessPdf.bind(this));
    this.messageBroker.subscribe('unstructured.process-email', this.handleProcessEmail.bind(this));
    this.messageBroker.subscribe('unstructured.extract-dimensions', this.handleExtractDimensions.bind(this));
    this.messageBroker.subscribe('unstructured.extract-project-type', this.handleExtractProjectType.bind(this));
  }
  
  /**
   * Process unstructured text to extract structured information
   */
  private async handleProcessText(message: any): Promise<void> {
    const { requestId, text, context } = message;
    
    this.logger.info(`Processing text: ${text.substring(0, 50)}...`);
    
    try {
      // Generate cache key for this request
      const cacheKey = `text_processing:${this.generateCacheKey(text, context)}`;
      
      // Try to get from cache
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.logger.info(`Using cached structured data for text`);
        
        // Publish cached results
        await this.messageBroker.publish('unstructured.text-processed', {
          requestId,
          structuredData: cachedResult,
          success: true,
          fromCache: true
        });
        
        return;
      }
      
      // Extract structured data using AI
      const structuredData = await this.extractStructuredDataFromText(text, context);
      
      // Cache the result
      await this.cacheService.set(cacheKey, structuredData, 86400); // Cache for 24 hours
      
      // Publish results
      await this.messageBroker.publish('unstructured.text-processed', {
        requestId,
        structuredData,
        success: true
      });
    } catch (error) {
      this.logger.error(`Error processing text: ${error instanceof Error ? error.message : String(error)}`);
      
      // Publish error
      await this.messageBroker.publish('unstructured.text-processing-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Process images to extract relevant information
   */
  private async handleProcessImage(message: any): Promise<void> {
    const { requestId, imageUrl, imageData, context } = message;
    
    this.logger.info(`Processing image${imageUrl ? ' from URL: ' + imageUrl : ' from binary data'}`);
    
    try {
      // Generate cache key for this request
      const imageSrc = imageUrl || (imageData ? imageData.substring(0, 50) : '');
      const cacheKey = `image_processing:${this.generateCacheKey(imageSrc, context)}`;
      
      // Try to get from cache
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.logger.info(`Using cached structured data for image`);
        
        // Publish cached results
        await this.messageBroker.publish('unstructured.image-processed', {
          requestId,
          structuredData: cachedResult,
          success: true,
          fromCache: true
        });
        
        return;
      }
      
      // Select optimal model for image analysis
      const modelSelection = ModelSelectionStrategy.selectModel({
        taskType: TaskType.IMAGE_ANALYSIS,
        requiresVision: true,
        priority: ModelPriority.QUALITY
      });
      
      // Process the image
      let extractedText = '';
      let detectedObjects = [];
      
      // Process the image with vision capabilities
      if (imageUrl) {
        const analysisOptions: AIImageAnalysisOptions = {
          image: imageUrl,
          prompt: "Extract all text and describe the visual elements in this image, focusing on dimensions, materials, and any construction-related details. If this appears to be a fence, deck, or similar construction project, provide detailed observations.",
          model: modelSelection.model,
          useFallback: modelSelection.useFallback,
          retry: {
            maxRetries: 2,
            baseDelayMs: 1000
          }
        };
        
        extractedText = await this.aiService.analyzeImage(analysisOptions);
        detectedObjects = await this.detectObjectsInImage(imageUrl, false);
      } else if (imageData) {
        const analysisOptions: AIImageAnalysisOptions = {
          image: imageData,
          prompt: "Extract all text and describe the visual elements in this image, focusing on dimensions, materials, and any construction-related details. If this appears to be a fence, deck, or similar construction project, provide detailed observations.",
          model: modelSelection.model,
          isBase64: true,
          useFallback: modelSelection.useFallback,
          retry: {
            maxRetries: 2,
            baseDelayMs: 1000
          }
        };
        
        extractedText = await this.aiService.analyzeImage(analysisOptions);
        detectedObjects = await this.detectObjectsInImage(imageData, true);
      } else {
        throw new Error('URL or image data is required');
      }
      
      // Analyze the image content
      const structuredData = await this.analyzeImageContent(extractedText, detectedObjects, context);
      
      // Cache the result
      await this.cacheService.set(cacheKey, structuredData, 604800); // Cache for 7 days
      
      // Publish results
      await this.messageBroker.publish('unstructured.image-processed', {
        requestId,
        extractedText,
        detectedObjects,
        structuredData,
        success: true
      });
    } catch (error) {
      this.logger.error(`Error processing image: ${error instanceof Error ? error.message : String(error)}`);
      
      // Publish error
      await this.messageBroker.publish('unstructured.image-processing-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Extract structured data from text using AI
   */
  private async extractStructuredDataFromText(text: string, context?: any): Promise<any> {
    // Create a prompt for structured data extraction
    const prompt = `
    Analyze the following text and extract any information relevant for a construction project.
    I'm specifically looking for:
    1. Project type (fence, deck, roof, concrete, etc.)
    2. Dimensions (length, width, height, area)
    3. Materials mentioned
    4. Project location
    5. Client information (name, contact)
    6. Timeframes or dates mentioned
    7. Budget or cost constraints
    8. Specific requirements or features

    Text to analyze:
    ${text}

    ${context ? `Additional context: ${JSON.stringify(context)}` : ''}

    Respond with a structured JSON containing the extracted information.
    `;

    // Select the appropriate model based on task complexity
    const modelSelection = ModelSelectionStrategy.selectModel({
      taskType: TaskType.TEXT_COMPLETION,
      priority: ModelPriority.BALANCED,
      inputTokens: ModelSelectionStrategy.estimateTokenCount(text),
      requiresJsonOutput: true,
      requiresHighAccuracy: true
    });

    // Configure AI completion options
    const completionOptions: AICompletionOptions = {
      prompt,
      model: modelSelection.model,
      temperature: modelSelection.temperature,
      responseFormat: 'json_object',
      systemMessage: 'You are a specialized assistant for extracting structured information from text related to construction projects.',
      useFallback: true,
      retry: {
        maxRetries: 2,
        baseDelayMs: 1000
      }
    };

    try {
      // Make the AI call with resilience strategies
      const response = await this.aiService.completeText(completionOptions);
      
      // Parse the response
      try {
        return JSON.parse(response);
      } catch (parseError) {
        this.logger.error('Error parsing JSON response from AI', parseError);
        
        // Try to extract JSON if it's within code blocks
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || 
                         response.match(/```\n([\s\S]*?)\n```/);
        
        if (jsonMatch && jsonMatch[1]) {
          return JSON.parse(jsonMatch[1]);
        }
        
        throw new Error('Could not get a valid JSON response');
      }
    } catch (error) {
      this.logger.error('Error in extractStructuredDataFromText', error);
      throw error;
    }
  }
  
  /**
   * Detect objects in an image
   */
  private async detectObjectsInImage(imageSource: string, isBase64: boolean): Promise<any[]> {
    // Create a prompt for object detection
    const prompt = `
    Look at this image and identify all objects related to construction, especially:
    - Construction materials (wood, metal, concrete, etc.)
    - Tools and equipment
    - Structural elements (posts, beams, panels)
    - Measuring tools or markings
    - Safety equipment
    
    Provide a list of all identified objects with their estimated confidence.
    Format your response as a JSON array with objects containing "name" and "confidence" fields.
    `;
    
    // Create analysis options
    const analysisOptions: AIImageAnalysisOptions = {
      image: imageSource,
      prompt,
      model: 'gpt-4o',
      isBase64,
      responseFormat: 'json_object',
      retry: {
        maxRetries: 1
      }
    };
    
    try {
      // Analyze the image
      const response = await this.aiService.analyzeImage(analysisOptions);
      
      // Parse the response
      try {
        return JSON.parse(response);
      } catch (parseError) {
        this.logger.error('Error parsing JSON from object detection', parseError);
        
        // Try to extract JSON if it's within code blocks
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || 
                         response.match(/```\n([\s\S]*?)\n```/);
        
        if (jsonMatch && jsonMatch[1]) {
          return JSON.parse(jsonMatch[1]);
        }
        
        // Return empty array if we couldn't parse JSON
        return [];
      }
    } catch (error) {
      this.logger.error('Error detecting objects in image', error);
      // Return empty array on error rather than failing the whole process
      return [];
    }
  }
  
  /**
   * Analyze image content to extract structured information
   */
  private async analyzeImageContent(extractedText: string, detectedObjects: any[], context?: any): Promise<any> {
    // If there's no text or objects, there's not much to analyze
    if (!extractedText && (!detectedObjects || detectedObjects.length === 0)) {
      return {
        analysisSuccess: false,
        reason: 'No text or objects found in the image'
      };
    }

    // Create a prompt for analysis
    const prompt = `
    Analyze the following information extracted from an image related to a construction project.
    
    Extracted text from the image:
    ${extractedText || 'No text extracted from the image.'}
    
    Objects detected in the image:
    ${detectedObjects && detectedObjects.length > 0 ? JSON.stringify(detectedObjects) : 'No objects detected.'}
    
    ${context ? `Additional context: ${JSON.stringify(context)}` : ''}
    
    Please extract:
    1. Project type (fence, deck, roof, concrete, etc.)
    2. Visible or mentioned dimensions
    3. Visible materials
    4. Any other information relevant for a construction estimate
    
    Respond with a structured JSON containing the extracted information.
    `;

    // Select appropriate model
    const modelSelection = ModelSelectionStrategy.selectModel({
      taskType: TaskType.TEXT_COMPLETION,
      priority: ModelPriority.QUALITY,
      requiresJsonOutput: true,
      requiresHighAccuracy: true
    });

    // Configure completion options
    const completionOptions: AICompletionOptions = {
      prompt,
      model: modelSelection.model,
      temperature: 0.3,
      responseFormat: 'json_object',
      systemMessage: 'You are a specialized assistant for extracting construction information from images.',
      useFallback: true
    };

    try {
      // Make the AI call
      const response = await this.aiService.completeText(completionOptions);
      
      // Parse the response
      return JSON.parse(response);
    } catch (error) {
      this.logger.error('Error in analyzeImageContent', error);
      throw error;
    }
  }
  
  /**
   * Generate a unique cache key based on input and context
   */
  private generateCacheKey(input: string, context?: any): string {
    const dataToHash = {
      input: input.length > 100 ? input.substring(0, 100) : input,
      context
    };
    
    return crypto
      .createHash('md5')
      .update(JSON.stringify(dataToHash))
      .digest('hex');
  }
  
  // Additional methods for handling PDF processing, email processing, dimension extraction, etc.
  // would follow the same pattern of using the AIServiceV2, caching, and resilience strategies
  
  private async handleProcessPdf(message: any): Promise<void> {
    // Implementation using the new AIServiceV2 and resilience strategies
    // This would follow the same pattern as handleProcessText and handleProcessImage
  }
  
  private async handleProcessEmail(message: any): Promise<void> {
    // Implementation using the new AIServiceV2 and resilience strategies
  }
  
  private async handleExtractDimensions(message: any): Promise<void> {
    // Implementation using the new AIServiceV2 and resilience strategies
  }
  
  private async handleExtractProjectType(message: any): Promise<void> {
    // Implementation using the new AIServiceV2 and resilience strategies
  }
}
