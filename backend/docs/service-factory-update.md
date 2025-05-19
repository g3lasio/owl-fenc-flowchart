# Service Factory Update Documentation

## Introduction

This document outlines the updates made to the ServiceFactory to support the new V2 microservices architecture, specifically focusing on the DeepSearchEngineV2 and AdaptiveLearningServiceV2.

## ServiceFactoryV2

The implementation includes a new ServiceFactoryV2 class that provides improved integration for V2 microservices:

```typescript
export class ServiceFactoryV2 {
  private static instance: ServiceFactoryV2;
  private tieredCacheService: TieredCacheService;
  private aiServiceV2: AIServiceV2;

  // ...

  public getTieredCacheService(): TieredCacheService {
    return this.tieredCacheService;
  }

  public getAIServiceV2(): AIServiceV2 {
    return this.aiServiceV2;
  }

  public createDeepSearchEngineV2(): DeepSearchEngineV2 {
    return new DeepSearchEngineV2(this.messageBroker);
  }

  public createAdaptiveLearningServiceV2(dataPath: string): AdaptiveLearningServiceV2 {
    return new AdaptiveLearningServiceV2(this.messageBroker, dataPath);
  }
}
```

## Key Updates

1. **Singleton TieredCacheService**: Updated to properly manage a singleton instance of TieredCacheService across the application.

2. **AIServiceV2 Integration**: Added support for the new AI provider architecture with unified AIServiceV2.

3. **V2 Microservices Creation**: Added factory methods for creating V2 microservices with proper dependencies.

4. **Constructor Compatibility**: Maintained backward compatibility with existing code while adding support for the new options-based configuration.

## Using the Service Factory

### Creating V2 Microservices

```typescript
// Get factory instance
const factory = ServiceFactoryV2.getInstance();

// Create V2 microservices
const deepSearchEngine = factory.createDeepSearchEngineV2();
const adaptiveLearningService = factory.createAdaptiveLearningServiceV2();
```

### Accessing Shared Services

```typescript
// Get AI service
const aiService = factory.getAIServiceV2();

// Get cache service
const cacheService = factory.getTieredCacheService();
```

## Testing Considerations

For testing purposes, you can use the test adapter pattern to bypass TypeScript checks:

```typescript
// In test
const cacheService = new TieredCacheService() as any;
(cacheService as any).persistentCachePath = testCachePath;
```

## Known Issues

There are some TypeScript compatibility issues with the original TieredCacheService class that required workarounds:

1. Constructor parameter handling needed special attention
2. Type assertions were needed in test cases
3. getInstance method needed to be carefully implemented

These issues are documented in detail in `tiered-cache-implementation.md`.

## Future Improvements

1. Fully refactor TieredCacheService to use a cleaner API
2. Add better TypeScript interfaces for all components
3. Implement dependency injection for easier testing
4. Consolidate ServiceFactory and ServiceFactoryV2
