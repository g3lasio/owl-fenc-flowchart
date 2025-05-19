import { ServiceFactoryV2 } from '../src/factories/service.factory-v2';
import { DeepSearchEngineV2 } from '../src/microservices/deepsearch-engine-v2';
import { AdaptiveLearningServiceV2 } from '../src/microservices/adaptive-learning-service-v2';
import { TaskType, ModelPriority } from '../src/utils/model-selection';

/**
 * This example demonstrates how to use the updated V2 services architecture
 * with improved caching, resilience strategies, and AI provider abstraction
 */
async function runV2ServicesExample() {
  // Create service factory
  const factory = ServiceFactoryV2.getInstance();
  
  // Create microservices using factory
  const deepSearchEngine = factory.createDeepSearchEngineV2();
  const adaptiveLearningService = factory.createAdaptiveLearningServiceV2();
  
  // Get shared cache service
  const cacheService = factory.getTieredCacheService();
  
  // Initialize custom task parameters
  const searchQuery = "Custom fence with lattice, 80 feet length, 6 feet height";
  const contractorId = "contractor-12345";
  
  console.log("Starting Deep Search V2 for query:", searchQuery);
  
  // Perform deep search with appropriate model selection
  const searchResults = await deepSearchEngine.performDeepSearch(searchQuery, {
    taskType: TaskType.COMPLEX_REASONING,
    priority: ModelPriority.QUALITY,
    requiresHighAccuracy: true
  });
  
  console.log("Deep Search Results:", JSON.stringify(searchResults, null, 2));
  
  // Get cache statistics
  const cacheStats = cacheService.getStats();
  console.log("Cache Statistics:", cacheStats);
  
  console.log("Generating contractor profile...");
  
  // Generate contractor profile using adaptive learning service
  const profile = await adaptiveLearningService.generateContractorProfile(contractorId);
  
  console.log("Contractor Profile:", JSON.stringify(profile, null, 2));
  
  // Record feedback for continuous learning
  await adaptiveLearningService.recordCustomerFeedback({
    contractorId,
    estimateId: "estimate-67890",
    feedback: {
      accuracy: 4.5,
      materialRecommendations: 5.0,
      designSuggestions: 4.0,
      comments: "Very accurate estimate, good material choices."
    }
  });
  
  console.log("Feedback recorded successfully.");
}

// Run the example
runV2ServicesExample()
  .then(() => console.log("Example completed successfully"))
  .catch(error => console.error("Error running example:", error));
