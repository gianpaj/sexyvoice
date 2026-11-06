import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

import { APIErrorResponse } from '@/lib/error-ts';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { getVoiceById, hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import {
  buildGeminiTtsContents,
  resolveGeminiTtsModel,
} from '@/lib/tts/gemini-prompt';
import {
  creditsFromTokens,
  getTextLimit,
  getTtsModel,
  type TtsModel,
} from '@/lib/tts/models';

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

async function validateRequestBody(
  request: Request,
): Promise<
  ValidationResult<{ text: string; voiceId: string; styleVariant: string }>
> {
  if (request.body === null) {
    return {
      ok: false,
      response: APIErrorResponse('Request body is empty', 400),
    };
  }

  try {
    const body = await request.json();
    const text: string = body.text || '';
    const voiceId: string = body.voiceId || '';
    const styleVariant: string = body.styleVariant || '';

    if (!(text && voiceId)) {
      return {
        ok: false,
        response: APIErrorResponse('Missing required parameters', 400),
      };
    }

    return { data: { styleVariant, text, voiceId }, ok: true };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        ok: false,
        response: APIErrorResponse('Invalid JSON in request body', 400),
      };
    }
    throw error;
  }
}

async function validateUser(): Promise<ValidationResult<{ id: string }>> {
  const supabase = await createClient();
  const claims = await getVerifiedClaims(supabase);

  if (!claims?.sub) {
    return {
      ok: false,
      response: APIErrorResponse('User not found', 401),
    };
  }

  return { data: { id: claims.sub }, ok: true };
}

async function validateVoice(
  voiceId: string,
): Promise<ValidationResult<{ model: string; ttsModel: TtsModel }>> {
  const voiceObj = await getVoiceById(voiceId);
  const ttsModel = getTtsModel(voiceObj?.model);

  if (!(voiceObj && ttsModel)) {
    return {
      ok: false,
      response: APIErrorResponse('Voice not found', 404),
    };
  }

  if (!ttsModel.canEstimate) {
    return {
      ok: false,
      response: APIErrorResponse(
        'Credit estimation currently supports only Gemini and Grok voices',
        400,
      ),
    };
  }

  return { data: { model: voiceObj.model, ttsModel }, ok: true };
}

function validateTextLength(
  text: string,
  ttsModel: TtsModel,
  isPaidUser: boolean,
): ValidationResult<null> {
  const maxLength = getTextLimit(ttsModel, isPaidUser);

  if (text.length > maxLength) {
    return {
      ok: false,
      response: APIErrorResponse(
        `Text exceeds the maximum length of ${maxLength} characters`,
        400,
      ),
    };
  }

  return { data: null, ok: true };
}

function validateApiKey(): ValidationResult<string> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      response: APIErrorResponse('Missing Google Generative AI API key', 500),
    };
  }

  return { data: apiKey, ok: true };
}

export async function POST(request: Request) {
  try {
    const bodyResult = await validateRequestBody(request);
    if (!bodyResult.ok) {
      return bodyResult.response;
    }

    const { text, voiceId, styleVariant } = bodyResult.data;

    const userResult = await validateUser();
    if (!userResult.ok) {
      return userResult.response;
    }

    const voiceResult = await validateVoice(voiceId);
    if (!voiceResult.ok) {
      return voiceResult.response;
    }

    const isPaidUser = await hasUserPaid(userResult.data.id);

    const { model, ttsModel } = voiceResult.data;
    const textError = validateTextLength(text, ttsModel, isPaidUser);
    if (!textError.ok) {
      return textError.response;
    }

    if (ttsModel.provider === 'grok') {
      const credits = ttsModel.estimateCredits(text, '');

      return NextResponse.json({
        estimatedCredits: credits,
      });
    }

    const apiKeyResult = validateApiKey();
    if (!apiKeyResult.ok) {
      return apiKeyResult.response;
    }

    const estimateModel = resolveGeminiTtsModel({ model });
    const ai = new GoogleGenAI({ apiKey: apiKeyResult.data });

    const tokenResponse = await ai.models.countTokens({
      contents: buildGeminiTtsContents({
        model,
        styleVariant,
        text,
      }),
      model: estimateModel,
    });

    const inputTokens = tokenResponse.totalTokens ?? 0;

    // Estimate output tokens for audio
    // Characters per second ~ 15 (faster speech)
    // Gemini 3.8 produces about 25 audio tokens per second.
    const CHARACTERS_PER_SECOND = 15;
    const TOKENS_PER_SECOND = 25;

    const estimatedDurationSeconds = text.length / CHARACTERS_PER_SECOND;
    const estimatedOutputTokens = Math.ceil(
      estimatedDurationSeconds * TOKENS_PER_SECOND,
    );

    const totalEstimatedTokens = inputTokens + estimatedOutputTokens;

    const credits = creditsFromTokens(totalEstimatedTokens);

    return NextResponse.json({
      estimatedCredits: credits,
      tokens: totalEstimatedTokens,
    });
  } catch (error) {
    console.error('Estimate credits error:', error);
    return APIErrorResponse('Failed to estimate credits', 500);
  }
}
