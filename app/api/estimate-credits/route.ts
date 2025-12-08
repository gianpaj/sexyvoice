import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

import { getCharactersLimit } from '@/lib/ai';
import { getVoiceIdByName } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { estimateCreditsFromTokens } from '@/lib/utils';

export async function POST(request: Request) {
  try {
    if (request.body === null) {
      return NextResponse.json(
        { error: 'Request body is empty' },
        { status: 400 },
      );
    }

    const body = await request.json();
    const text: string = body.text || '';
    const voice: string = body.voice || '';
    const styleVariant: string = body.styleVariant || '';

    if (!(text && voice)) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const voiceObj = await getVoiceIdByName(voice);

    if (!voiceObj) {
      return NextResponse.json({ error: 'Voice not found' }, { status: 404 });
    }

    if (voiceObj.model !== 'gpro') {
      return NextResponse.json(
        { error: 'Credit estimation currently supports only gpro voices' },
        { status: 400 },
      );
    }

    const maxLength = getCharactersLimit(voiceObj.model);

    if (text.length > maxLength) {
      return NextResponse.json(
        {
          error: `Text exceeds the maximum length of ${maxLength} characters`,
        },
        { status: 400 },
      );
    }
    const finalText = styleVariant ? `${styleVariant}: ${text}` : text;

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing Google Generative AI API key' },
        { status: 500 },
      );
    }

    const ai = new GoogleGenAI({ apiKey });
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
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 },
      );
    }
    console.error('Estimate credits error:', error);
    return NextResponse.json(
      { error: 'Failed to estimate credits' },
      { status: 500 },
    );
  }
}
