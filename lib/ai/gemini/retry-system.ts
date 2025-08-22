import {
  type GenerateContentConfig,
  type GenerateContentResponse,
  GoogleGenAI,
} from '@google/genai';
import * as Sentry from '@sentry/nextjs';
import type { Redis } from '@upstash/redis';

import { GeminiApiKeyManager, type GeminiError } from '../../gemini/api-key-manager';

const { logger } = Sentry;

export interface RetryOptions {
  initialDelayMs: number;
  maxDelayMs: number;
  operation: string;
  maxRetries?: number;
}

export interface GeminiTTSParams {
  model: string;
  text: string;
  voice: string;
}

export class GeminiRetrySystem {
  private keyManager: GeminiApiKeyManager;

  constructor(redis: Redis) {
    this.keyManager = new GeminiApiKeyManager(redis);
  }

  async initialize(): Promise<void> {
    await this.keyManager.initializeApiKeys();
  }

  /**
   * Enhanced retry logic with intelligent API key rotation
   */
  async retryWithEnhancedBackoff(
    params: GeminiTTSParams,
    options: RetryOptions,
  ): Promise<GenerateContentResponse> {
    const { initialDelayMs, maxDelayMs, operation, maxRetries = 3 } = options;
    let lastError: Error | null = null;
    let delay = initialDelayMs;

    logger.info('Starting Gemini TTS with enhanced retry', {
      operation,
      model: params.model,
      textLength: params.text.length,
    });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const apiKey = await this.keyManager.getBestAvailableKey();

      if (!apiKey) {
        const error = new Error('No available Gemini API keys');
        logger.error('All Gemini API keys exhausted', { operation, attempt });
        Sentry.captureException(error, {
          tags: { operation, attempt },
          extra: { params },
        });
        throw error;
      }

      logger.info('Attempting Gemini TTS', {
        operation,
        attempt,
        keyId: apiKey.id,
        model: params.model,
      });

      try {
        const response = await this.attemptGeminiGeneration(
          params,
          apiKey.apiKey,
        );

        // Record successful usage
        await this.keyManager.recordUsage(apiKey.id);

        logger.info('Gemini TTS successful', {
          operation,
          attempt,
          keyId: apiKey.id,
          model: params.model,
        });

        return response;
      } catch (error) {
        lastError = error as Error;

        logger.warn('Gemini TTS attempt failed', {
          operation,
          attempt,
          keyId: apiKey.id,
          model: params.model,
          error: lastError.message,
        });

        // Check if this is a quota error
        if (this.isQuotaError(lastError)) {
          const geminiError = this.parseGeminiError(lastError);
          if (geminiError) {
            await this.keyManager.recordFailure(apiKey.id, geminiError);
          }

          // For quota errors, try immediately with next key (no delay)
          logger.info('Quota error detected, trying next API key immediately', {
            operation,
            attempt,
            keyId: apiKey.id,
          });
          continue;
        }

        // For non-quota errors, record failure and apply backoff
        if (this.parseGeminiError(lastError)) {
          const geminiError = this.parseGeminiError(lastError)!;
          await this.keyManager.recordFailure(apiKey.id, geminiError);
        }

        // Apply exponential backoff for non-quota errors
        if (attempt < maxRetries) {
          logger.info('Applying exponential backoff', {
            operation,
            attempt,
            delay,
            nextDelay: Math.min(delay * 2, maxDelayMs),
          });

          await this.sleep(delay);
          delay = Math.min(delay * 2, maxDelayMs);
        }
      }
    }

    // All retries exhausted
    const finalError =
      lastError || new Error('Unknown error during Gemini TTS');
    logger.error('All Gemini TTS retries exhausted', {
      operation,
      maxRetries,
      finalError: finalError.message,
    });

    Sentry.captureException(finalError, {
      tags: { operation, retries_exhausted: true },
      extra: { params, maxRetries },
    });

    throw finalError;
  }

  private async attemptGeminiGeneration(
    params: GeminiTTSParams,
    apiKey: string,
  ): Promise<GenerateContentResponse> {
    const ai = new GoogleGenAI({ apiKey });

    const geminiTTSConfig: GenerateContentConfig = {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName:
              params.voice.charAt(0).toUpperCase() + params.voice.slice(1),
          },
        },
      },
    };

    const response = await ai.models.generateContent({
      model: params.model,
      contents: [{ parts: [{ text: params.text }] }],
      config: geminiTTSConfig,
    });

    return response;
  }

  private isQuotaError(error: Error): boolean {
    return (
      error.message.includes('429') ||
      error.message.includes('quota') ||
      error.message.includes('RESOURCE_EXHAUSTED')
    );
  }

  private parseGeminiError(error: Error): GeminiError | null {
    try {
      if (error.message.includes('googleapis')) {
        const parsed = JSON.parse(error.message);
        return parsed as GeminiError;
      }
    } catch (e) {
      // Not a JSON error message
    }

    // Create a generic error structure for non-JSON errors
    if (this.isQuotaError(error)) {
      return {
        error: {
          code: 429,
          message: error.message,
          status: 'RESOURCE_EXHAUSTED',
        },
      };
    }

    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get usage statistics for monitoring
   */
  async getUsageStats() {
    return await this.keyManager.getUsageStats();
  }
}
