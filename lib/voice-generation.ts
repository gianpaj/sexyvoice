import { type GenerateContentResponse, GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/nextjs';
import type { User } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { put } from '@vercel/blob';
import { after, NextResponse } from 'next/server';
import Replicate, { type Prediction } from 'replicate';

import { getCharactersLimit } from '@/lib/ai';
import { convertToWav } from '@/lib/audio';
import { APIError } from '@/lib/error-ts';
import PostHogClient from '@/lib/posthog';
import {
  getCredits,
  getVoiceIdByName,
  isFreemiumUserOverLimit,
  reduceCredits,
  saveAudioFile,
} from '@/lib/supabase/queries';
import { estimateCredits } from '@/lib/utils';

const { logger } = Sentry;

export interface VoiceGenerationRequest {
  text: string;
  voice: string;
  styleVariant?: string;
}

export interface VoiceGenerationResponse {
  url: string;
  creditsUsed: number;
  creditsRemaining: number;
}

export interface VoiceGenerationOptions {
  user: User;
  apiKeyId?: string; // Optional API key ID for tracking
  signal?: AbortSignal;
}

export interface VoiceGenerationError {
  error: string;
  status: number;
  errorCode?: string;
}

async function generateHash(
  text: string,
  voice: string,
  // accent: string,
  // speed: string,
) {
  const textEncoder = new TextEncoder();
  const combinedString = `${text}-${voice}`;
  const data = textEncoder.encode(combinedString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 8);
}

// Initialize Redis
const redis = Redis.fromEnv();

export async function generateVoice(
  request: VoiceGenerationRequest,
  options: VoiceGenerationOptions,
): Promise<VoiceGenerationResponse | VoiceGenerationError> {
  let { text, voice, styleVariant = '' } = request;
  const { user, apiKeyId, signal } = options;

  try {
    if (!text || !voice) {
      logger.error('Missing required parameters: text or voice', {
        request,
        user: { id: user.id, email: user.email },
      });
      return {
        error: 'Missing required parameters',
        status: 400,
      };
    }

    const voiceObj = await getVoiceIdByName(voice);

    if (!voiceObj) {
      Sentry.captureException({ error: 'Voice not found', voice, text });
      return {
        error: 'Voice not found',
        status: 404,
      };
    }

    const isGeminiVoice = voiceObj.model === 'gpro';

    const maxLength = getCharactersLimit(voiceObj.model);
    if (text.length > maxLength) {
      logger.error('Text exceeds maximum length', {
        textLength: text.length,
        maxLength,
        request,
        user: { id: user.id, email: user.email },
      });
      return {
        error: `Text exceeds the maximum length of ${maxLength} characters`,
        status: 400,
      };
    }

    const currentAmount = await getCredits(user.id);
    const estimate = estimateCredits(text, voice, voiceObj.model);

    if (currentAmount < estimate) {
      logger.warn('Insufficient credits', {
        user: { id: user.id, email: user.email },
        extra: { voice, text, estimate, currentCreditsAmount: currentAmount },
      });
      return {
        error: 'Insufficient credits',
        status: 402,
      };
    }

    const finalText = styleVariant ? `${styleVariant}: ${text}` : text;
    text = finalText;

    // Generate hash for the combination of text, voice, and accent
    const hash = await generateHash(text, voice);

    const abortController = new AbortController();
    const path = `audio/${voice}-${hash}`;

    signal?.addEventListener('abort', () => {
      logger.warn('Request aborted by client', { hash });
      abortController.abort();
    });

    const filename = `${path}.wav`;
    const result = await redis.get(filename);

    if (result) {
      logger.info('Cache hit - returning existing audio', {
        filename,
        url: result,
        creditsUsed: 0,
      });
      await sendPosthogEvent({
        userId: user.id,
        text,
        voiceId: voiceObj.id,
        creditUsed: 0,
        model: voiceObj.model,
        apiKeyId,
      });
      // Return existing audio file URL
      return {
        url: result as string,
        creditsUsed: 0,
        creditsRemaining: currentAmount,
      };
    }

    if (isGeminiVoice) {
      const isOverLimit = await isFreemiumUserOverLimit(user.id);
      if (isOverLimit) {
        return {
          error:
            'You have exceeded the limit of 4 multilingual voice generations as a free user. Please try a different voice or upgrade your plan for unlimited access.',
          status: 403,
          errorCode: 'gproLimitExceeded',
        };
      }
    }

    let predictionResult: Prediction | undefined;
    let modelUsed = voiceObj.model;
    let blobResult: any;

    if (isGeminiVoice) {
      const ai = new GoogleGenAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });

      const geminiTTSConfig = {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice.charAt(0).toUpperCase() + voice.slice(1),
            },
          },
        },
      };
      let response: GenerateContentResponse | null;
      try {
        modelUsed = 'gemini-2.5-pro-preview-tts';
        response = await ai.models.generateContent({
          model: modelUsed,
          contents: [{ parts: [{ text }] }],
          config: geminiTTSConfig,
        });
      } catch (error) {
        console.warn(error);
        logger.warn(
          `${modelUsed} failed, retrying with gemini-2.5-flash-preview-tts`,
          {
            error: error instanceof Error ? error.message : String(error),
            originalModel: modelUsed,
          },
        );
        modelUsed = 'gemini-2.5-flash-preview-tts';
        response = await ai.models.generateContent({
          model: modelUsed,
          contents: [{ parts: [{ text }] }],
          config: geminiTTSConfig,
        });
      }
      const data =
        response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      const mimeType =
        response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType;
      if (!data || !mimeType) {
        logger.error('Gemini voice generation failed - no data or mimeType', {
          hasData: !!data,
          mimeType,
        });
        throw new Error('Voice generation failed');
      }
      Sentry.captureMessage('Gemini voice generation succeeded', {
        user: {
          id: user.id,
        },
        extra: {
          voice,
          model: modelUsed,
          responseId: response.responseId,
          text,
        },
      });

      const audioBuffer = convertToWav(data, mimeType || 'wav');
      blobResult = await put(filename, audioBuffer, {
        access: 'public',
        contentType: 'audio/wav',
        allowOverwrite: true,
      });
    } else {
      // uses REPLICATE_API_TOKEN
      const replicate = new Replicate();
      const input = { text, voice };
      const onProgress = (prediction: Prediction) => {
        predictionResult = prediction;
      };
      const output = (await replicate.run(
        // @ts-ignore
        voiceObj.model,
        { input, signal },
        onProgress,
      )) as ReadableStream;

      if ('error' in output) {
        const errorObj = {
          text,
          voice,
          model: voiceObj.model,
          errorData: output.error,
        };
        Sentry.captureException({
          error: 'Voice generation failed',
          user: { id: user.id, email: user.email },
          ...errorObj,
        });
        console.error(errorObj);
        // @ts-ignore
        throw new Error(output.error || 'Voice generation failed');
      }

      blobResult = await put(filename, output, {
        access: 'public',
        contentType: 'audio/mpeg',
        allowOverwrite: true,
      });
    }

    await redis.set(filename, blobResult.url);

    after(async () => {
      if (!user) {
        Sentry.captureException({
          error: 'User not found',
        });
        return;
      }

      await reduceCredits({ userId: user.id, currentAmount, amount: estimate });

      const audioFileDBResult = await saveAudioFile({
        userId: user.id,
        filename,
        text,
        url: blobResult.url,
        model: modelUsed,
        predictionId: predictionResult?.id,
        isPublic: false,
        voiceId: voiceObj.id,
        duration: '-1',
        credits_used: estimate,
        api_key_id: apiKeyId,
      });

      if (audioFileDBResult.error) {
        const errorObj = {
          text,
          voice,
          model: modelUsed,
          errorData: audioFileDBResult.error,
        };
        Sentry.captureException({
          error: 'Failed to insert audio file row',
          ...errorObj,
        });
        console.error(errorObj);
      }

      await sendPosthogEvent({
        userId: user.id,
        predictionId: predictionResult?.id,
        text,
        voiceId: voiceObj.id,
        creditUsed: estimate,
        model: modelUsed,
        apiKeyId,
      });
    });

    return {
      url: blobResult.url,
      creditsUsed: estimate,
      creditsRemaining: (currentAmount || 0) - estimate,
    };
  } catch (error) {
    const errorObj = {
      text,
      voice,
      errorData: error,
    };
    Sentry.captureException({
      error: 'Voice generation error',
      user: { id: user.id, email: user.email },
      ...errorObj,
    });
    console.error(errorObj);
    console.error('Voice generation error:', error);

    // Gemini - You exceeded your current quota, please check your plan and billing details
    if (
      error &&
      typeof error === 'object' &&
      'status' in error &&
      error.status === 429
    ) {
      logger.warn('Third-party API quota exceeded', { status: 429 });
      return {
        error: 'Third-party API Quota exceeded',
        status: 429,
      };
    }
    if (error instanceof Error) {
      // if Gemini error
      if (error instanceof Error && error.message.includes('googleapis')) {
        const message = JSON.parse(error.message);
        // You exceeded your current quota
        if (message.error.code === 429) {
          return {
            error:
              'We have exceeded our third-party API current quota, please try later or tomorrow',
            status: 500,
          };
        }
      }
      return {
        error: error.message,
        status: 500,
      };
    }
    return {
      error: 'Failed to generate voice',
      status: 500,
    };
  }
}

async function sendPosthogEvent({
  userId,
  text,
  voiceId,
  predictionId,
  creditUsed,
  model,
  apiKeyId,
}: {
  userId: string;
  text: string;
  voiceId: string;
  predictionId?: string;
  creditUsed: number;
  model: string;
  apiKeyId?: string;
}) {
  const posthog = PostHogClient();
  posthog.capture({
    distinctId: userId,
    event: 'generate-voice',
    properties: {
      // duration,
      predictionId: predictionId,
      model,
      text,
      voiceId,
      credits_used: creditUsed,
      textLength: text.length,
      apiKeyId,
      source: apiKeyId ? 'external-api' : 'dashboard',
    },
  });
  await posthog.shutdown();
}