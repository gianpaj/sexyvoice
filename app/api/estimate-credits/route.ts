import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

import { getCharactersLimit } from '@/lib/ai';
import { getVoiceIdByName } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { estimateCreditsFromTokens } from '@/lib/utils';

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

async function validateRequestBody(
  request: Request,
): Promise<
  ValidationResult<{ text: string; voice: string; styleVariant: string }>
> {
  if (request.body === null) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Request body is empty' },
        { status: 400 },
      ),
    };
  }

  try {
    const body = await request.json();
    const text: string = body.text || '';
    const voice: string = body.voice || '';
    const styleVariant: string = body.styleVariant || '';

    if (!(text && voice)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Missing required parameters' },
          { status: 400 },
        ),
      };
    }

    return { ok: true, data: { text, voice, styleVariant } };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Invalid JSON in request body' },
          { status: 400 },
        ),
      };
    }
    throw error;
  }
}

async function validateUser(): Promise<ValidationResult<object>> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'User not found' }, { status: 401 }),
    };
  }

  return { ok: true, data: user };
}

async function validateVoice(
  voiceName: string,
): Promise<ValidationResult<{ model: string }>> {
  const voiceObj = await getVoiceIdByName(voiceName);

  if (!voiceObj) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Voice not found' },
        { status: 404 },
      ),
    };
  }

  if (voiceObj.model !== 'gpro') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Credit estimation currently supports only gpro voices' },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: voiceObj };
}

function validateTextLength(
  text: string,
  voiceModel: string,
): ValidationResult<null> {
  const maxLength = getCharactersLimit(voiceModel);

  if (text.length > maxLength) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Text exceeds the maximum length of ${maxLength} characters`,
        },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: null };
}

function validateApiKey(): ValidationResult<string> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Missing Google Generative AI API key' },
        { status: 500 },
      ),
    };
  }

  return { ok: true, data: apiKey };
}

export async function POST(request: Request) {
  try {
    const bodyResult = await validateRequestBody(request);
    if (!bodyResult.ok) {
      return bodyResult.response;
    }

    const { text, voice, styleVariant } = bodyResult.data;

    const userResult = await validateUser();
    if (!userResult.ok) {
      return userResult.response;
    }

    const voiceResult = await validateVoice(voice);
    if (!voiceResult.ok) {
      return voiceResult.response;
    }

    const textError = validateTextLength(text, voiceResult.data.model);
    if (!textError.ok) {
      return textError.response;
    }

    const apiKeyResult = validateApiKey();
    if (!apiKeyResult.ok) {
      return apiKeyResult.response;
    }

    const finalText = styleVariant ? `${styleVariant}: ${text}` : text;
    const ai = new GoogleGenAI({ apiKey: apiKeyResult.data });
    const tokenResponse = await ai.models.countTokens({
      model: 'gemini-2.5-pro-preview-tts',
      contents: [{ parts: [{ text: finalText }], role: 'user' }],
    });

    const totalTokens = tokenResponse.totalTokens ?? 0;
    const credits = estimateCreditsFromTokens(totalTokens);

    return NextResponse.json({
      tokens: totalTokens,
      estimatedCredits: credits,
    });
  } catch (error) {
    console.error('Estimate credits error:', error);
    return NextResponse.json(
      { error: 'Failed to estimate credits' },
      { status: 500 },
    );
  }
}
