import * as Sentry from '@sentry/nextjs';
import type { Redis } from '@upstash/redis';

const { logger } = Sentry;

export interface GeminiApiKeyMetrics {
  id: string;
  apiKey: string;

  // Usage tracking
  requestsPerMinute: number;
  tokensPerMinute: number;
  requestsPerDay: number;

  // Limits (can be configured per key based on plan)
  maxRequestsPerMinute: number;
  maxTokensPerMinute: number;
  maxRequestsPerDay: number;

  // Failure tracking
  lastFailureTime?: number;
  lastFailureError?: string;
  lastFailureQuotaMetric?: string;

  // Time windows for rate limiting
  lastMinuteReset: number;
  lastDayReset: number;

  // Status
  isActive: boolean;
  failureCount: number;
}

export interface QuotaFailure {
  quotaMetric: string;
  quotaId: string;
}

export interface GeminiError {
  error: {
    code: number;
    message: string;
    status: string;
    details?: Array<{
      '@type': string;
      violations?: QuotaFailure[];
      links?: Array<{
        description: string;
        url: string;
      }>;
    }>;
  };
}

export class GeminiApiKeyManager {
  private redis: Redis;
  private keyPrefix = 'gemini_api_key:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Initialize API keys from environment variables
   * Expected format: GOOGLE_GENERATIVE_AI_API_KEYS=key1,key2,key3
   */
  async initializeApiKeys(): Promise<void> {
    const apiKeysEnv = process.env.GOOGLE_GENERATIVE_AI_API_KEYS;
    if (!apiKeysEnv) {
      // Fallback to single key
      const singleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (singleKey) {
        await this.addApiKey(singleKey, {
          maxRequestsPerMinute: 15,
          maxTokensPerMinute: 1000000,
          maxRequestsPerDay: 1500,
        });
      }
      return;
    }

    const apiKeys = apiKeysEnv.split(',').map((key) => key.trim());

    for (let i = 0; i < apiKeys.length; i++) {
      const key = apiKeys[i];
      if (key) {
        await this.addApiKey(key, {
          // Default limits - can be customized per key
          maxRequestsPerMinute: 15,
          maxTokensPerMinute: 1000000,
          maxRequestsPerDay: 1500,
        });
      }
    }
  }

  /**
   * Add a new API key with specified limits
   */
  async addApiKey(
    apiKey: string,
    limits: {
      maxRequestsPerMinute: number;
      maxTokensPerMinute: number;
      maxRequestsPerDay: number;
    },
  ): Promise<void> {
    const keyId = this.generateKeyId(apiKey);
    const now = Date.now();

    const metrics: GeminiApiKeyMetrics = {
      id: keyId,
      apiKey,
      requestsPerMinute: 0,
      tokensPerMinute: 0,
      requestsPerDay: 0,
      maxRequestsPerMinute: limits.maxRequestsPerMinute,
      maxTokensPerMinute: limits.maxTokensPerMinute,
      maxRequestsPerDay: limits.maxRequestsPerDay,
      lastMinuteReset: now,
      lastDayReset: now,
      isActive: true,
      failureCount: 0,
    };

    await this.redis.set(`${this.keyPrefix}${keyId}`, JSON.stringify(metrics));
    logger.info('Added Gemini API key', { keyId });
  }

  /**
   * Get the best available API key based on current usage and failures
   */
  async getBestAvailableKey(): Promise<GeminiApiKeyMetrics | null> {
    const allKeys = await this.getAllApiKeys();

    if (allKeys.length === 0) {
      logger.error('No Gemini API keys available');
      return null;
    }

    // Filter out inactive keys and keys that have failed recently
    const now = Date.now();
    const availableKeys = allKeys.filter((key) => {
      if (!key.isActive) return false;

      // If key failed in the last 5 minutes, skip it
      if (key.lastFailureTime && now - key.lastFailureTime < 5 * 60 * 1000) {
        return false;
      }

      // Reset counters if time windows have passed
      if (now - key.lastMinuteReset >= 60 * 1000) {
        key.requestsPerMinute = 0;
        key.tokensPerMinute = 0;
        key.lastMinuteReset = now;
        this.saveApiKey(key); // Save the reset
      }

      if (now - key.lastDayReset >= 24 * 60 * 60 * 1000) {
        key.requestsPerDay = 0;
        key.lastDayReset = now;
        this.saveApiKey(key); // Save the reset
      }

      // Check if daily quota is exceeded
      if (key.requestsPerDay >= key.maxRequestsPerDay) {
        return false;
      }

      // Check if minute quota is exceeded
      if (key.requestsPerMinute >= key.maxRequestsPerMinute) {
        return false;
      }

      return true;
    });

    if (availableKeys.length === 0) {
      logger.warn(
        'No available Gemini API keys - all keys are rate limited or failed',
      );
      // Return the key with the least recent failure as a last resort
      return allKeys.sort(
        (a, b) => (a.lastFailureTime || 0) - (b.lastFailureTime || 0),
      )[0];
    }

    // Sort by usage (prefer keys with lower usage)
    availableKeys.sort((a, b) => {
      const aUsageScore =
        a.requestsPerDay / a.maxRequestsPerDay +
        a.requestsPerMinute / a.maxRequestsPerMinute;
      const bUsageScore =
        b.requestsPerDay / b.maxRequestsPerDay +
        b.requestsPerMinute / b.maxRequestsPerMinute;
      return aUsageScore - bUsageScore;
    });

    return availableKeys[0];
  }

  /**
   * Record successful API usage
   */
  async recordUsage(keyId: string, tokensUsed = 100): Promise<void> {
    const key = await this.getApiKey(keyId);
    if (!key) return;

    const now = Date.now();

    // Reset counters if time windows have passed
    if (now - key.lastMinuteReset >= 60 * 1000) {
      key.requestsPerMinute = 0;
      key.tokensPerMinute = 0;
      key.lastMinuteReset = now;
    }

    if (now - key.lastDayReset >= 24 * 60 * 60 * 1000) {
      key.requestsPerDay = 0;
      key.lastDayReset = now;
    }

    // Increment usage
    key.requestsPerMinute += 1;
    key.tokensPerMinute += tokensUsed;
    key.requestsPerDay += 1;

    // Clear failure status on successful usage
    if (key.lastFailureTime) {
      key.lastFailureTime = undefined;
      key.lastFailureError = undefined;
      key.lastFailureQuotaMetric = undefined;
      key.failureCount = 0;
    }

    await this.saveApiKey(key);
  }

  /**
   * Record API failure with error details
   */
  async recordFailure(keyId: string, error: GeminiError): Promise<void> {
    const key = await this.getApiKey(keyId);
    if (!key) return;

    const now = Date.now();
    key.lastFailureTime = now;
    key.lastFailureError = error.error.message;
    key.failureCount += 1;

    // Extract quota metric from error details
    if (error.error.details) {
      for (const detail of error.error.details) {
        if (detail.violations) {
          const quotaViolation = detail.violations[0];
          if (quotaViolation) {
            key.lastFailureQuotaMetric = quotaViolation.quotaMetric;
          }
        }
      }
    }

    // If this is a daily quota error, mark requests as maxed out
    if (key.lastFailureQuotaMetric?.includes('per_day')) {
      key.requestsPerDay = key.maxRequestsPerDay;
    }

    // If this is a minute quota error, mark requests as maxed out
    if (key.lastFailureQuotaMetric?.includes('per_minute')) {
      key.requestsPerMinute = key.maxRequestsPerMinute;
    }

    // Deactivate key if it has too many failures
    if (key.failureCount >= 5) {
      key.isActive = false;
      logger.warn('Deactivated Gemini API key due to repeated failures', {
        keyId,
        failureCount: key.failureCount,
      });
    }

    await this.saveApiKey(key);

    logger.warn('Recorded Gemini API key failure', {
      keyId,
      errorCode: error.error.code,
      errorMessage: error.error.message,
      quotaMetric: key.lastFailureQuotaMetric,
      failureCount: key.failureCount,
    });
  }

  private generateKeyId(apiKey: string): string {
    // Create a hash-like ID from the API key for storage
    return createHash('sha256').update(apiKey).digest('hex').slice(0, 8);
  }

  private async getAllApiKeys(): Promise<GeminiApiKeyMetrics[]> {
    const keys = await this.redis.keys(`${this.keyPrefix}*`);
    const results: GeminiApiKeyMetrics[] = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data && typeof data === 'string') {
        try {
          results.push(JSON.parse(data));
        } catch (e) {
          logger.error('Failed to parse API key data', { key, error: e });
        }
      }
    }

    return results;
  }

  private async getApiKey(keyId: string): Promise<GeminiApiKeyMetrics | null> {
    const data = await this.redis.get(`${this.keyPrefix}${keyId}`);
    if (data && typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch (e) {
        logger.error('Failed to parse API key data', { keyId, error: e });
      }
    }
    return null;
  }

  private async saveApiKey(key: GeminiApiKeyMetrics): Promise<void> {
    await this.redis.set(`${this.keyPrefix}${key.id}`, JSON.stringify(key));
  }

  /**
   * Get usage statistics for monitoring
   */
  async getUsageStats(): Promise<{
    totalKeys: number;
    activeKeys: number;
    failedKeys: number;
    totalRequestsToday: number;
  }> {
    const allKeys = await this.getAllApiKeys();

    return {
      totalKeys: allKeys.length,
      activeKeys: allKeys.filter((k) => k.isActive).length,
      failedKeys: allKeys.filter(
        (k) =>
          k.lastFailureTime && k.lastFailureTime > Date.now() - 5 * 60 * 1000,
      ).length,
      totalRequestsToday: allKeys.reduce((sum, k) => sum + k.requestsPerDay, 0),
    };
  }
}
