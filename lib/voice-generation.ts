import { type GenerateContentResponse, GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/nextjs';
import type { User } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { put } from '@vercel/blob';
import { after } from 'next/server';
import Replicate, { type Prediction } from 'replicate';

import { getCharactersLimit } from '@/lib/ai';
import { convertToWav } from '@/lib/audio';
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

// Initialize Redis
const redis = Redis.fromEnv();

export interface VoiceGenerationRequest {
  text: string;
  voice: string;
  styleVariant?: string;
}

export interface VoiceGenerationResult {
  url: string;
  creditsUsed: number;
  creditsRemaining: number;
}

export interface VoiceGenerationError {
  error: string;
  errorCode?: string;
}

export interface VoiceGenerationContext {
  user: User;
  apiKeyId?: string;
  requestSignal?: AbortSignal;
}

async function generateHash(
  text: string,
  voice: string,
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

async function sendPosthogEvent({
  userId,
  text,
  voiceId,
  predictionId,
  creditUsed,
  model,
}: {
  userId: string;
  text: string;
  voiceId: string;
  predictionId?: string;
  creditUsed: number;
  model: string;
}) {
  const posthog = PostHogClient();
  posthog.capture({
    distinctId: userId,
    event: 'generate-voice',
    properties: {
      predictionId: predictionId,
      model,
      text,
      voiceId,
      credits_used: creditUsed,
      textLength: text.length,
    },
  });
  await posthog.shutdown();
}

export async function generateVoice(
  request: VoiceGenerationRequest,
  context: VoiceGenerationContext,
): Promise<VoiceGenerationResult | VoiceGenerationError> {
  let { text, voice, styleVariant = '' } = request;
  const { user, apiKeyId, requestSignal } = context;

  try {
    // Validate inputs
    if (!text || !voice) {
      logger.error('Missing required parameters: text or voice', {
        text: !!text,
        voice: !!voice,
        userId: user.id,
      });
      return { error: 'Missing required parameters' };
    }

    const voiceObj = await getVoiceIdByName(voice);

    if (!voiceObj) {
      Sentry.captureException({ error: 'Voice not found', voice, text });
      return { error: 'Voice not found' };
    }

    const isGeminiVoice = voiceObj.model === 'gpro';

    // Check text length limits
    const maxLength = getCharactersLimit(voiceObj.model);
    if (text.length > maxLength) {
      logger.error('Text exceeds maximum length', {
        textLength: text.length,
        maxLength,
        userId: user.id,
      });
      return { 
        error: `Text exceeds the maximum length of ${maxLength} characters` 
      };
    }

    // Check user credits
    const currentAmount = await getCredits(user.id);
    const estimate = estimateCredits(text, voice, voiceObj.model);

    if (currentAmount < estimate) {
      logger.warn('Insufficient credits', {
        user: { id: user.id, email: user.email },
        extra: { voice, text, estimate, currentCreditsAmount: currentAmount },
      });
      return { error: 'Insufficient credits' };
    }

    // Apply style variant
    const finalText = styleVariant ? `${styleVariant}: ${text}` : text;
    text = finalText;

    // Generate hash for caching
    const hash = await generateHash(text, voice);
    const path = `audio/${voice}-${hash}`;
    const filename = `${path}.wav`;

    // Check cache first
    const cachedResult = await redis.get(filename);
    if (cachedResult) {
      logger.info('Cache hit - returning existing audio', {
        filename,
        url: cachedResult,
        creditsUsed: 0,
      });
      await sendPosthogEvent({
        userId: user.id,
        text,
        voiceId: voiceObj.id,
        creditUsed: 0,
        model: voiceObj.model,
      });
      return { 
        url: cachedResult as string, 
        creditsUsed: 0,
        creditsRemaining: currentAmount 
      };
    }

    // Check freemium limits for Gemini voices
    if (isGeminiVoice) {
      const isOverLimit = await isFreemiumUserOverLimit(user.id);
      if (isOverLimit) {
        return {
          error: 'You have exceeded the limit of 4 multilingual voice generations as a free user. Please try a different voice or upgrade your plan for unlimited access.',
          errorCode: 'gproLimitExceeded',
        };
      }
    }

    let predictionResult: Prediction | undefined;
    let modelUsed = voiceObj.model;
    let blobResult: any;

    // Generate audio using appropriate service
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

      const data = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      const mimeType = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType;
      
      if (!data || !mimeType) {
        logger.error('Gemini voice generation failed - no data or mimeType', {
          hasData: !!data,
          mimeType,
        });
        throw new Error('Voice generation failed');
      }

      Sentry.captureMessage('Gemini voice generation succeeded', {
        user: { id: user.id },
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
      // Use Replicate for other voices
      const replicate = new Replicate();
      const input = { text, voice };
      const onProgress = (prediction: Prediction) => {
        predictionResult = prediction;
      };
      
      const output = (await replicate.run(
        // @ts-ignore
        voiceObj.model,
        { input, signal: requestSignal },
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

    // Cache the result
    await redis.set(filename, blobResult.url);

    // Handle post-generation tasks asynchronously
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

    // Handle quota exceeded errors
    if (
      error &&
      typeof error === 'object' &&
      'status' in error &&
      error.status === 429
    ) {
      logger.warn('Third-party API quota exceeded', { status: 429 });
      return { error: 'Third-party API Quota exceeded' };
    }
    
    if (error instanceof Error) {
      // Handle Gemini-specific errors
      if (error instanceof Error && error.message.includes('googleapis')) {
        try {
          const message = JSON.parse(error.message);
          if (message.error.code === 429) {
            return {
              error: 'We have exceeded our third-party API current quota, please try later or tomorrow',
            };
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
      return { error: error.message };
    }
    
    return { error: 'Failed to generate voice' };
  }
}