import { type GenerateContentResponse, GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { put } from '@vercel/blob';
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
const redis = Redis.fromEnv();

interface VoiceGenerationOptions {
  userId: string;
  text: string;
  voice: string;
  styleVariant?: string;
  apiKeyId?: string; // Optional API key ID for tracking
  signal?: AbortSignal;
}

interface VoiceGenerationResult {
  url: string;
  creditsUsed: number;
  creditsRemaining: number;
}

async function generateHash(text: string, voice: string) {
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

export async function generateVoice({
  userId,
  text,
  voice,
  styleVariant = '',
  apiKeyId,
  signal,
}: VoiceGenerationOptions): Promise<VoiceGenerationResult> {
  if (!text || !voice) {
    throw new APIError(
      'Missing required parameters: text or voice',
      new Response('Missing required parameters', { status: 400 }),
    );
  }

  const voiceObj = await getVoiceIdByName(voice);
  if (!voiceObj) {
    throw new APIError(
      'Voice not found',
      new Response('Voice not found', { status: 404 }),
    );
  }

  const isGeminiVoice = voiceObj.model === 'gpro';
  const maxLength = getCharactersLimit(voiceObj.model);
  
  if (text.length > maxLength) {
    throw new APIError(
      `Text exceeds the maximum length of ${maxLength} characters`,
      new Response(
        `Text exceeds the maximum length of ${maxLength} characters`,
        { status: 400 },
      ),
    );
  }

  const currentAmount = await getCredits(userId);
  const estimate = estimateCredits(text, voice, voiceObj.model);

  if (currentAmount < estimate) {
    throw new APIError(
      'Insufficient credits',
      new Response('Insufficient credits', { status: 402 }),
    );
  }

  const finalText = styleVariant ? `${styleVariant}: ${text}` : text;
  const processedText = finalText;

  // Generate hash for caching
  const hash = await generateHash(processedText, voice);
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
      userId,
      text: processedText,
      voiceId: voiceObj.id,
      creditUsed: 0,
      model: voiceObj.model,
      apiKeyId,
    });
    
    return {
      url: cachedResult as string,
      creditsUsed: 0,
      creditsRemaining: currentAmount,
    };
  }

  // Check freemium limits for Gemini voices
  if (isGeminiVoice) {
    const isOverLimit = await isFreemiumUserOverLimit(userId);
    if (isOverLimit) {
      throw new APIError(
        'You have exceeded the limit of 4 multilingual voice generations as a free user. Please try a different voice or upgrade your plan for unlimited access.',
        new Response('Freemium limit exceeded', { status: 403 }),
      );
    }
  }

  let predictionResult: Prediction | undefined;
  let modelUsed = voiceObj.model;
  let blobResult: any;

  if (isGeminiVoice) {
    // Generate with Google Gemini
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
        contents: [{ parts: [{ text: processedText }] }],
        config: geminiTTSConfig,
      });
    } catch (error) {
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
        contents: [{ parts: [{ text: processedText }] }],
        config: geminiTTSConfig,
      });
    }

    const data = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    const mimeType = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType;
    
    if (!data || !mimeType) {
      throw new Error('Voice generation failed - no data or mimeType');
    }

    Sentry.captureMessage('Gemini voice generation succeeded', {
      user: { id: userId },
      extra: {
        voice,
        model: modelUsed,
        responseId: response.responseId,
        text: processedText,
      },
    });

    const audioBuffer = convertToWav(data, mimeType || 'wav');
    blobResult = await put(filename, audioBuffer, {
      access: 'public',
      contentType: 'audio/wav',
      allowOverwrite: true,
    });
  } else {
    // Generate with Replicate
    const replicate = new Replicate();
    const input = { text: processedText, voice };
    
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
        text: processedText,
        voice,
        model: voiceObj.model,
        errorData: (output as any).error,
      };
      Sentry.captureException({
        error: 'Voice generation failed',
        user: { id: userId },
        ...errorObj,
      });
      throw new Error((output as any).error || 'Voice generation failed');
    }

    blobResult = await put(filename, output, {
      access: 'public',
      contentType: 'audio/mpeg',
      allowOverwrite: true,
    });
  }

  // Cache the result
  await redis.set(filename, blobResult.url);

  // Background tasks - update credits and save to database
  setTimeout(async () => {
    try {
      await reduceCredits({ userId, currentAmount, amount: estimate });

      await saveAudioFile({
        userId,
        filename,
        text: processedText,
        url: blobResult.url,
        model: modelUsed,
        predictionId: predictionResult?.id,
        isPublic: false,
        voiceId: voiceObj.id,
        duration: '-1',
        credits_used: estimate,
        api_key_id: apiKeyId,
      });

      await sendPosthogEvent({
        userId,
        predictionId: predictionResult?.id,
        text: processedText,
        voiceId: voiceObj.id,
        creditUsed: estimate,
        model: modelUsed,
        apiKeyId,
      });
    } catch (error) {
      Sentry.captureException({
        error: 'Failed background processing after voice generation',
        user: { id: userId },
        extra: { error },
      });
    }
  }, 0);

  return {
    url: blobResult.url,
    creditsUsed: estimate,
    creditsRemaining: currentAmount - estimate,
  };
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
      predictionId: predictionId,
      model,
      text,
      voiceId,
      credits_used: creditUsed,
      textLength: text.length,
      source: apiKeyId ? 'api' : 'dashboard',
      apiKeyId: apiKeyId || undefined,
    },
  });
  await posthog.shutdown();
}