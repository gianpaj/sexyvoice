import { type GoogleLanguageModelOptions, google } from '@ai-sdk/google';
import * as Sentry from '@sentry/nextjs';
import type { User } from '@supabase/supabase-js';
import { streamText } from 'ai';
import { NextResponse } from 'next/server';

import { GEMINI_AUDIO_TAGS, getEmotionTags } from '@/lib/ai';
import { createClient } from '@/lib/supabase/server';

// gemini-3.1-flash-lite-preview
// Launch stage: n/a
// Release date: March 3, 2026
// Discontinuation date: n/a
const model = google('gemini-3.1-flash-lite-preview');

export async function POST(request: Request) {
  const {
    prompt,
    selectedVoiceLanguage,
    ttsProvider,
  }: {
    prompt: string;
    selectedVoiceLanguage: string;
    ttsProvider?: string;
  } = await request.json();
  let user: User | null = null;
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const { data } = await supabase.auth.getUser();
    user = data?.user;

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    if (prompt.length > 1000) {
      return NextResponse.json(
        { error: 'Text exceeds maximum length of 1000 characters' },
        { status: 400 },
      );
    }

    const isGeminiVoice = ttsProvider === 'gemini';
    const system = isGeminiVoice
      ? `You are an expert at enhancing text for AI voice generation using Gemini audio tags.
Add inline audio tags to make the voice output more expressive and engaging.

Available tags: ${GEMINI_AUDIO_TAGS}

Rules:
1. Embed tags directly before the word or phrase they affect, e.g. "[cheerfully] Have a great day!"
2. Use tags sparingly — 1-3 per sentence maximum
3. Keep the original text completely intact, only add tags
4. Return only the enhanced text with audio tags, no explanations`
      : `Below is a text. The text is missing annotations for a voice actor.
You are an expert at enhancing text for AI voice generation. Your task is to add emotion tags to make the voice output more expressive and engaging.

Add emotion tags: '${getEmotionTags(selectedVoiceLanguage)}'. ONLY THESE exist

Rules:
1. Add emotion tags strategically to enhance the meaning and flow. Those are the only ones that exist
2. Don't overuse tags - use them sparingly but effectively
3. Consider the context and tone of the original text
4. Keep the original text intact, only add emotion tags
5. Use tags that would make sense for voice generation
6. Return only the enhanced text with emotion tags, no explanations`;

    const result = streamText({
      model,
      system,
      prompt,
      // temperature: 0.7,
      maxOutputTokens: 500,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
      },
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingLevel: 'low',
            includeThoughts: false,
          },
        } satisfies GoogleLanguageModelOptions,
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Text generation error:', error);

    Sentry.captureException(error, {
      user: { id: user?.id, email: user?.email },
      extra: { prompt },
    });

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: 'Failed to generate enhanced text' },
      { status: 500 },
    );
  }
}
