# Gemini Retry System

An intelligent retry system with API key rotation for handling Google Gemini quota errors in voice generation.

## Overview

The Gemini Retry System provides robust error handling and automatic failover for Google Gemini API calls. It manages multiple API keys, tracks their usage, and intelligently rotates between them when quota limits are reached.

## Features

- ✅ **Intelligent API Key Rotation**: Automatically switches to available keys when quotas are exceeded
- ✅ **Usage Tracking**: Monitors requests per minute, tokens per minute, and requests per day for each key
- ✅ **Failure Recovery**: Temporarily disables failed keys and retries with working keys
- ✅ **Exponential Backoff**: Smart retry delays for non-quota errors
- ✅ **Redis Persistence**: Stores API key metrics and usage data in Redis
- ✅ **Comprehensive Logging**: Detailed logging for monitoring and debugging
- ✅ **Auto-Reset**: Automatically resets usage counters when time windows expire
- ✅ **Error Classification**: Distinguishes between quota errors and other API failures

## Setup

### Environment Variables

Configure multiple API keys using comma-separated values:

```bash
# Multiple API keys (preferred)
GOOGLE_GENERATIVE_AI_API_KEYS=key1,key2,key3

# Single key fallback (for backward compatibility)
GOOGLE_GENERATIVE_AI_API_KEY=your_single_key
```

### Redis Configuration

The system requires Redis to store API key metrics. Make sure you have these environment variables set:

```bash
KV_REST_API_URL=your_upstash_redis_url
KV_REST_API_TOKEN=your_upstash_redis_token
```

## Usage

### Basic Implementation

```typescript
import { Redis } from '@upstash/redis';
import { GeminiRetrySystem } from '@/lib/gemini/retry-system';

const redis = Redis.fromEnv();
const geminiRetrySystem = new GeminiRetrySystem(redis);

// Initialize the system (loads API keys)
await geminiRetrySystem.initialize();

// Use enhanced retry logic
const response = await geminiRetrySystem.retryWithEnhancedBackoff(
  {
    model: 'gemini-2.5-pro-preview-tts',
    text: 'Hello world',
    voice: 'en-US-Wavenet-A',
  },
  {
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    operation: 'gemini_tts_generation',
    maxRetries: 3,
  }
);
```

### Integration Example

The system is integrated into the voice generation API route:

```typescript
// app/api/generate-voice/route.ts
const geminiRetrySystem = new GeminiRetrySystem(redis);

export async function POST(request: Request) {
  // ... other code ...
  
  if (isGeminiVoice) {
    await ensureGeminiRetrySystemInitialized();
    
    try {
      // Try pro model first
      const response = await geminiRetrySystem.retryWithEnhancedBackoff(
        { model: 'gemini-2.5-pro-preview-tts', text, voice },
        { initialDelayMs: 1000, maxDelayMs: 30000, operation: 'gemini_tts_pro' }
      );
    } catch (error) {
      // Fallback to flash model
      const response = await geminiRetrySystem.retryWithEnhancedBackoff(
        { model: 'gemini-2.5-flash-preview-tts', text, voice },
        { initialDelayMs: 1000, maxDelayMs: 30000, operation: 'gemini_tts_flash' }
      );
    }
  }
}
```

## API Reference

### GeminiRetrySystem

#### Constructor

```typescript
constructor(redis: Redis)
```

#### Methods

##### `initialize(): Promise<void>`
Initializes the system by loading API keys from environment variables.

##### `retryWithEnhancedBackoff(params, options): Promise<GenerateContentResponse>`
Main method for executing Gemini API calls with intelligent retry logic.

**Parameters:**
- `params: GeminiTTSParams` - The parameters for the Gemini API call
  - `model: string` - The Gemini model to use
  - `text: string` - The text to convert to speech
  - `voice: string` - The voice identifier
- `options: RetryOptions` - Retry configuration
  - `initialDelayMs: number` - Initial delay between retries
  - `maxDelayMs: number` - Maximum delay between retries
  - `operation: string` - Operation name for logging
  - `maxRetries?: number` - Maximum number of retries (default: 3)

##### `getUsageStats(): Promise<UsageStats>`
Returns usage statistics for monitoring.

### GeminiApiKeyManager

#### Methods

##### `addApiKey(apiKey, limits): Promise<void>`
Adds a new API key with specified rate limits.

##### `getBestAvailableKey(): Promise<GeminiApiKeyMetrics | null>`
Returns the best available API key based on current usage and failure status.

##### `recordUsage(keyId, tokensUsed): Promise<void>`
Records successful API usage for tracking.

##### `recordFailure(keyId, error): Promise<void>`
Records API failure with detailed error information.

## Error Handling

The system handles different types of errors intelligently:

### Quota Errors (HTTP 429)
- Immediately tries the next available API key
- No delay between attempts when switching keys
- Marks the failed key as temporarily unavailable

### Other API Errors
- Applies exponential backoff delays
- Records failure for monitoring
- Continues with the same key for transient errors

### All Keys Exhausted
- Throws an error when no API keys are available
- Logs comprehensive error information
- Captures exceptions in Sentry for monitoring

## Monitoring

### Usage Statistics

Get real-time usage statistics:

```typescript
const stats = await geminiRetrySystem.getUsageStats();
console.log({
  totalKeys: stats.totalKeys,
  activeKeys: stats.activeKeys,
  failedKeys: stats.failedKeys,
  totalRequestsToday: stats.totalRequestsToday,
});
```

### Logging

The system provides detailed logging for:
- API key initialization
- Request attempts and results
- Quota violations and key rotation
- Error conditions and retries
- Usage statistics and limits

### Sentry Integration

Automatic error reporting to Sentry for:
- API key exhaustion
- Repeated failures
- Unexpected errors during retry logic

## Default Limits

Each API key is configured with default limits that can be customized:

```typescript
{
  maxRequestsPerMinute: 15,     // Google Gemini free tier limit
  maxTokensPerMinute: 1000000,  // Token limit per minute
  maxRequestsPerDay: 1500,      // Daily request limit
}
```

## Redis Data Structure

API key metrics are stored in Redis with the following structure:

```
Key: gemini_api_key:{keyId}
Value: {
  id: string,
  apiKey: string,
  requestsPerMinute: number,
  tokensPerMinute: number,
  requestsPerDay: number,
  maxRequestsPerMinute: number,
  maxTokensPerMinute: number,
  maxRequestsPerDay: number,
  lastFailureTime?: number,
  lastFailureError?: string,
  lastFailureQuotaMetric?: string,
  lastMinuteReset: number,
  lastDayReset: number,
  isActive: boolean,
  failureCount: number,
}
```

## Testing

The system includes comprehensive test coverage with mocked Redis and API responses:

```bash
# Run all tests
pnpm test

# Run specific test
pnpm test -- -t "should complete full voice generation flow for Gemini"
```

## Troubleshooting

### Common Issues

1. **"No available Gemini API keys"**
   - Check environment variables are set correctly
   - Verify Redis connection is working
   - Check if all keys have exceeded their quotas

2. **High failure rates**
   - Monitor API key quotas and limits
   - Check Gemini API status
   - Review error logs for specific failure patterns

3. **Performance issues**
   - Monitor Redis response times
   - Check if too many keys are being deactivated
   - Review retry delays and backoff settings

### Debug Commands

```bash
# Check Redis connection
redis-cli ping

# View stored API keys (if using local Redis)
redis-cli keys "gemini_api_key:*"

# Get API key metrics
redis-cli get "gemini_api_key:your-key-id"
```

## Migration Guide

### From Single API Key

If you're currently using a single `GOOGLE_GENERATIVE_AI_API_KEY`, the system will automatically use it as a fallback. To add multiple keys:

1. Add `GOOGLE_GENERATIVE_AI_API_KEYS` environment variable
2. Keep the existing single key as backup
3. Deploy and monitor the transition

### Updating Existing Code

Replace direct GoogleGenAI usage:

```typescript
// Before
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
const response = await ai.models.generateContent({...});

// After  
const geminiRetrySystem = new GeminiRetrySystem(redis);
await geminiRetrySystem.initialize();
const response = await geminiRetrySystem.retryWithEnhancedBackoff(params, options);
```

## License

This system is part of the SexyVoice.ai project and follows the same licensing terms.