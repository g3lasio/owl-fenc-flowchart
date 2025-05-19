# AI Provider Abstraction Layer

This document describes the AI Provider Abstraction Layer implemented as part of the refactoring plan for the owl-fenc-flowchart project.

## Overview

The AI Provider Abstraction Layer introduces a standardized interface for interacting with different AI providers (like OpenAI, Anthropic, etc.) in a consistent way. This abstraction makes it easier to:

1. Switch between different AI providers
2. Add new AI providers in the future
3. Test code that uses AI services
4. Implement advanced features like model selection strategies and fallbacks

## Key Components

### 1. AI Provider Interfaces

Located in `/src/interfaces/ai-provider.interfaces.ts`, these interfaces define the standard contract that all AI providers must implement:

- `AIModelProvider`: The main interface for all AI model providers
- `AICompletionOptions`: Options for text completion requests
- `AIImageAnalysisOptions`: Options for image analysis requests
- `AICapability`: Enum of capabilities that providers may support (VISION, EMBEDDINGS, etc.)
- `AIErrorCode`: Standardized error codes for AI provider errors
- `AIProviderError`: Standard error class for AI provider errors

### 2. AI Provider Implementations

- `OpenAIProvider`: Implementation for the OpenAI API
- `AnthropicProvider`: Implementation for the Anthropic API

These providers implement the `AIModelProvider` interface, exposing standardized methods while handling provider-specific API calls and error handling under the hood.

### 3. AIProviderFactory

This factory class centralizes the creation and management of AI providers, offering methods to:

- Get a specific provider by name
- Get the default provider
- Get a provider with a specific capability
- Get the best provider for a specific task based on requirements

### 4. AIServiceV2

The new `AIServiceV2` service provides a unified interface for AI operations and is built on top of the provider abstractions. It offers methods for:

- Text completion (with any provider or automatically selecting the best one)
- Image analysis
- Embeddings generation
- Smart completion (with automatic model selection)

## Usage Examples

### Getting the service from the ServiceFactory:

```typescript
const aiService = serviceFactory.getAIServiceV2();
```

### Simple text completion:

```typescript
const response = await aiService.complete({
  prompt: "Explain fence construction methods",
  model: "gpt-4o"
});
```

### Smart completion with automatic model selection:

```typescript
const response = await aiService.smartComplete({
  prompt: "Analyze this complex fence design...",
  complexity: 'high',
  promptLength: prompt.length,
  requiresFactualAccuracy: true
});
```

### Using a specific provider:

```typescript
const response = await aiService.complete({
  prompt: "Explain fence construction methods",
  provider: "anthropic"
});
```

## V2 Components

The following components have been refactored to use the new AI provider abstraction:

1. `DeepSearchEngineV2`: Refactored to use AIServiceV2
2. `MaterialCalculatorV2`: Helper class that uses AIServiceV2
3. `AdaptiveLearningEngineV2`: Refactored to use AIServiceV2

## Testing

To test components that use the AI provider abstraction, you can create mock implementations of the AIModelProvider interface.

## Future Improvements

1. Implement caching at the AI provider level
2. Add more providers (e.g., Mistral, Google Gemini)
3. Implement fallback mechanisms for when a provider fails
4. Add streaming support through the abstraction layer
5. Implement more sophisticated model selection strategies

## Migration Guide

To migrate existing code to use the new abstraction layer:

1. Replace direct usage of OpenAIClient or AnthropicClient with AIServiceV2
2. Update the ServiceFactory calls to use the V2 versions of components
3. Refactor any code that depends on provider-specific features to use the capability checking methods
