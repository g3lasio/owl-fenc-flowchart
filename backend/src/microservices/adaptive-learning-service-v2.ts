import { MicroserviceBase, MessageBroker } from '../architecture/microservices-architecture';
import { AIServiceV2 } from '../services/ai-service-v2';
import { TieredCacheService } from '../services/tiered-cache.service';
import { ServiceFactory } from '../factories/service.factory';
import { ModelPriority, ModelSelectionStrategy, TaskType } from '../utils/model-selection';
import { ResilienceStrategies } from '../utils/resilience';
import { Logger } from '../utils/logger';
import { AICompletionOptions } from '../interfaces/ai-provider.interfaces';
import { CacheTier } from '../interfaces/cache.interfaces';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * AdaptiveLearningService V2 - Enhanced with new AI provider architecture, caching and resilience
 * This service tracks user behavior and usage patterns to improve recommendations
 * and adapt estimate generation to specific contractor preferences.
 */
export class AdaptiveLearningServiceV2 extends MicroserviceBase {
  private aiService: AIServiceV2;
  private cacheService: TieredCacheService;
  private logger: Logger;
  private readonly dataStoragePath: string;
  
  constructor(
    private readonly messageBroker: MessageBroker,
    dataPath: string = process.env.DATA_PATH || './data/learning'
  ) {
    super('AdaptiveLearningServiceV2', '2.0.0');
    
    // Get services from factory
    this.aiService = ServiceFactory.getAIServiceV2();
    this.cacheService = ServiceFactory.getTieredCacheService();
    this.logger = new Logger('AdaptiveLearningServiceV2');
    
    // Set up data storage
    this.dataStoragePath = dataPath;
    this.ensureDirectoryExists(this.dataStoragePath);
    
    // Subscribe to events
    this.configureBrokerSubscriptions();
  }
  
  /**
   * Configure message broker subscriptions
   */
  private configureBrokerSubscriptions(): void {
    this.messageBroker.subscribe('learning.record-feedback', this.handleRecordFeedback.bind(this));
    this.messageBroker.subscribe('learning.get-recommendations', this.handleGetRecommendations.bind(this));
    this.messageBroker.subscribe('learning.analyze-usage-patterns', this.handleAnalyzeUsagePatterns.bind(this));
    this.messageBroker.subscribe('learning.optimize-parameters', this.handleOptimizeParameters.bind(this));
    this.messageBroker.subscribe('learning.get-contractor-profile', this.handleGetContractorProfile.bind(this));
  }
  
  /**
   * Record feedback on estimate accuracy or material recommendations
   */
  private async handleRecordFeedback(message: any): Promise<void> {
    const { requestId, contractorId, estimateId, feedback, context } = message;
    
    this.logger.info(`Recording feedback from contractor ${contractorId} on estimate ${estimateId}`);
    
    try {
      // Validate feedback
      if (!feedback || typeof feedback !== 'object') {
        throw new Error('Invalid feedback format');
      }
      
      // Store the feedback
      const result = await ResilienceStrategies.withRetry(
        () => this.storeFeedback(contractorId, estimateId, feedback),
        {
          maxRetries: 3,
          baseDelayMs: 500
        }
      );
      
      // Invalidate relevant caches
      const profileCacheKey = `contractor:profile:${contractorId}`;
      await this.cacheService.invalidate(profileCacheKey);
      
      // Publish success
      await this.messageBroker.publish('learning.feedback-recorded', {
        requestId,
        contractorId,
        estimateId,
        success: true
      });
      
      // Trigger background analysis
      this.analyzeFeedbackAsync(contractorId);
    } catch (error) {
      this.logger.error(`Error recording feedback: ${error instanceof Error ? error.message : String(error)}`);
      
      // Publish error
      await this.messageBroker.publish('learning.feedback-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Get personalized recommendations for a contractor
   */
  private async handleGetRecommendations(message: any): Promise<void> {
    const { requestId, contractorId, projectType, context } = message;
    
    this.logger.info(`Getting recommendations for contractor ${contractorId}`);
    
    try {
      // Generate cache key
      const cacheKey = `recommendations:${contractorId}:${projectType}:${this.generateCacheKey(context)}`;
      
      // Try to get from cache
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        this.logger.info(`Using cached recommendations for contractor ${contractorId}`);
        
        // Publish cached results
        await this.messageBroker.publish('learning.recommendations', {
          requestId,
          contractorId,
          recommendations: cachedResult,
          success: true,
          fromCache: true
        });
        
        return;
      }
      
      // Generate recommendations with circuit breaker pattern
      const recommendations = await ResilienceStrategies.withCircuitBreaker(
        async () => this.generateRecommendations(contractorId, projectType, context),
        {
          circuitName: 'recommendations-generator',
          failureThreshold: 3,
          resetTimeoutMs: 30000
        }
      );
      
      // Cache the recommendations
      await this.cacheService.set(cacheKey, recommendations, 86400, [CacheTier.MEMORY, CacheTier.PERSISTENT]); // Cache for 24 hours
      
      // Publish results
      await this.messageBroker.publish('learning.recommendations', {
        requestId,
        contractorId,
        recommendations,
        success: true
      });
    } catch (error) {
      this.logger.error(`Error generating recommendations: ${error instanceof Error ? error.message : String(error)}`);
      
      // Publish error
      await this.messageBroker.publish('learning.recommendations-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Analyze usage patterns for a contractor or across all contractors
   */
  private async handleAnalyzeUsagePatterns(message: any): Promise<void> {
    // Implementation would follow the same pattern as other handlers
    // with caching, resilience strategies, and AI-powered analysis
  }
  
  /**
   * Optimize AI or estimation parameters based on learning
   */
  private async handleOptimizeParameters(message: any): Promise<void> {
    // Implementation would follow the same pattern as other handlers
  }
  
  /**
   * Get contractor profile including preferences and patterns
   */
  private async handleGetContractorProfile(message: any): Promise<void> {
    const { requestId, contractorId } = message;
    
    this.logger.info(`Getting profile for contractor ${contractorId}`);
    
    try {
      // Generate cache key
      const cacheKey = `contractor:profile:${contractorId}`;
      
      // Try to get from cache first
      const cachedProfile = await this.cacheService.get(cacheKey);
      if (cachedProfile) {
        this.logger.info(`Using cached profile for contractor ${contractorId}`);
        
        // Publish cached profile
        await this.messageBroker.publish('learning.contractor-profile', {
          requestId,
          contractorId,
          profile: cachedProfile,
          success: true,
          fromCache: true
        });
        
        return;
      }
      
      // Generate contractor profile
      const profile = await this.generateContractorProfile(contractorId);
      
      // Cache the profile
      await this.cacheService.set(cacheKey, profile, 86400, [CacheTier.MEMORY, CacheTier.PERSISTENT]); // Cache for 24 hours
      
      // Publish profile
      await this.messageBroker.publish('learning.contractor-profile', {
        requestId,
        contractorId,
        profile,
        success: true
      });
    } catch (error) {
      this.logger.error(`Error getting contractor profile: ${error instanceof Error ? error.message : String(error)}`);
      
      // Publish error
      await this.messageBroker.publish('learning.profile-error', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        success: false
      });
    }
  }
  
  /**
   * Store feedback data
   */
  private async storeFeedback(contractorId: string, estimateId: string, feedback: any): Promise<boolean> {
    const contractorFolder = path.join(this.dataStoragePath, contractorId);
    this.ensureDirectoryExists(contractorFolder);
    
    const feedbacksFolder = path.join(contractorFolder, 'feedbacks');
    this.ensureDirectoryExists(feedbacksFolder);
    
    const feedbackPath = path.join(feedbacksFolder, `${estimateId}.json`);
    
    // Store feedback data
    const feedbackData = {
      estimateId,
      timestamp: new Date().toISOString(),
      feedback
    };
    
    fs.writeFileSync(feedbackPath, JSON.stringify(feedbackData, null, 2));
    
    // Update feedback index
    const indexPath = path.join(contractorFolder, 'feedback-index.json');
    let index = [];
    
    if (fs.existsSync(indexPath)) {
      try {
        index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      } catch (err) {
        this.logger.error(`Error reading feedback index: ${err}`);
        index = [];
      }
    }
    
    // Add to index
    index.push({
      estimateId,
      timestamp: feedbackData.timestamp,
      path: feedbackPath
    });
    
    // Sort by timestamp (newest first)
    index.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    // Write updated index
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    
    return true;
  }
  
  /**
   * Generate recommendations based on contractor's history and preferences
   */
  private async generateRecommendations(contractorId: string, projectType: string, context: any): Promise<any> {
    // Get contractor profile
    const profile = await this.generateContractorProfile(contractorId);
    
    // Prepare prompt for recommendation generation
    const prompt = `
    Generate personalized recommendations for a construction contractor based on their profile and project type.
    
    Contractor Profile:
    ${JSON.stringify(profile)}
    
    Project Type: ${projectType}
    
    Additional Context:
    ${JSON.stringify(context)}
    
    Please provide specific, actionable recommendations for:
    1. Materials selection
    2. Cost optimization strategies
    3. Construction techniques
    4. Timeline planning
    5. Common pitfalls to avoid based on this contractor's history
    
    Return a structured JSON response with detailed, personalized recommendations.
    `;
    
    // Select model based on complexity and need for personalization
    const modelSelection = ModelSelectionStrategy.selectModel({
      taskType: TaskType.COMPLEX_REASONING,
      priority: ModelPriority.QUALITY,
      requiresJsonOutput: true,
      requiresHighAccuracy: true
    });
    
    // Configure AI completion options
    const completionOptions: AICompletionOptions = {
      prompt,
      model: modelSelection.model,
      temperature: 0.4, // Lower temperature for more consistent results
      responseFormat: 'json_object',
      systemMessage: 'You are a specialized construction advisor with expertise in personalizing recommendations based on contractor preferences and historical data.',
      useFallback: true
    };
    
    // Execute AI completion with retry
    const response = await ResilienceStrategies.withRetry(
      () => this.aiService.completeText(completionOptions),
      {
        maxRetries: 2,
        baseDelayMs: 1000
      }
    );
    
    // Parse and return the recommendations
    try {
      return JSON.parse(response);
    } catch (parseError) {
      this.logger.error('Error parsing JSON recommendations from AI', parseError);
      
      // Try to extract JSON if it's within code blocks
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || 
                       response.match(/```\n([\s\S]*?)\n```/);
      
      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1]);
      }
      
      throw new Error('Could not get a valid JSON response for recommendations');
    }
  }
  
  /**
   * Generate contractor profile from historical data
   */
  private async generateContractorProfile(contractorId: string): Promise<any> {
    const contractorFolder = path.join(this.dataStoragePath, contractorId);
    
    // If contractor has no data, return empty profile
    if (!fs.existsSync(contractorFolder)) {
      return {
        contractorId,
        preferences: {},
        history: {},
        patterns: {},
        created: new Date().toISOString()
      };
    }
    
    // Check if there's a cached analysis
    const profilePath = path.join(contractorFolder, 'profile.json');
    
    if (fs.existsSync(profilePath)) {
      try {
        const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        const profileAge = Date.now() - new Date(profileData.updated).getTime();
        
        // If profile is less than 1 day old, use it
        if (profileAge < 86400000) {
          return profileData;
        }
      } catch (err) {
        this.logger.error(`Error reading profile: ${err}`);
        // Continue to regenerate profile
      }
    }
    
    // Collect feedback data
    const feedbacksFolder = path.join(contractorFolder, 'feedbacks');
    const feedbacks = [];
    
    if (fs.existsSync(feedbacksFolder)) {
      const feedbackFiles = fs.readdirSync(feedbacksFolder)
        .filter(file => file.endsWith('.json'));
      
      for (const file of feedbackFiles) {
        try {
          const feedbackData = JSON.parse(fs.readFileSync(path.join(feedbacksFolder, file), 'utf8'));
          feedbacks.push(feedbackData);
        } catch (err) {
          this.logger.error(`Error reading feedback file ${file}: ${err}`);
        }
      }
    }
    
    // If no feedback data, return basic profile
    if (feedbacks.length === 0) {
      const basicProfile = {
        contractorId,
        preferences: {},
        history: {},
        patterns: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      };
      
      // Save the basic profile
      fs.writeFileSync(profilePath, JSON.stringify(basicProfile, null, 2));
      
      return basicProfile;
    }
    
    // Analyze feedback with AI to generate profile
    return this.analyzeContractorData(contractorId, feedbacks);
  }
  
  /**
   * Analyze contractor data to generate insights and profile
   */
  private async analyzeContractorData(contractorId: string, feedbacks: any[]): Promise<any> {
    // This would use AI to analyze the feedback data and generate a profile
    // This is a simplified implementation
    
    const profile = {
      contractorId,
      preferences: {
        materialPreferences: this.extractMaterialPreferences(feedbacks),
        costPreferences: this.extractCostPreferences(feedbacks)
      },
      history: {
        projectTypes: this.extractProjectTypes(feedbacks),
        feedbackCount: feedbacks.length,
        averageRating: this.calculateAverageRating(feedbacks)
      },
      patterns: {},
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };
    
    // Save the profile
    const contractorFolder = path.join(this.dataStoragePath, contractorId);
    const profilePath = path.join(contractorFolder, 'profile.json');
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
    
    return profile;
  }
  
  /**
   * Extract material preferences from feedback data
   */
  private extractMaterialPreferences(feedbacks: any[]): any {
    // Implementation would analyze feedback to identify preference patterns
    return {};
  }
  
  /**
   * Extract cost preferences from feedback data
   */
  private extractCostPreferences(feedbacks: any[]): any {
    // Implementation would analyze feedback to identify cost preference patterns
    return {};
  }
  
  /**
   * Extract project types from feedback data
   */
  private extractProjectTypes(feedbacks: any[]): any {
    // Implementation would analyze feedback to identify common project types
    return {};
  }
  
  /**
   * Calculate average rating from feedback data
   */
  private calculateAverageRating(feedbacks: any[]): number {
    // Implementation would calculate average rating
    return 0;
  }
  
  /**
   * Async background analysis of feedback
   */
  private async analyzeFeedbackAsync(contractorId: string): Promise<void> {
    // This would run asynchronously to update contractor profiles
    // when new feedback is received
    setTimeout(async () => {
      try {
        await this.generateContractorProfile(contractorId);
      } catch (error) {
        this.logger.error(`Error in async feedback analysis: ${error}`);
      }
    }, 100);
  }
  
  /**
   * Generate a unique cache key based on input
   */
  private generateCacheKey(input: any): string {
    return crypto
      .createHash('md5')
      .update(JSON.stringify(input))
      .digest('hex');
  }
  
  /**
   * Ensure a directory exists
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}
