import { google } from '@ai-sdk/google';
// import { GoogleAICacheManager } from '@google/generative-ai/server';
import * as Sentry from '@sentry/nextjs';
import { streamText } from 'ai';
import { NextResponse } from 'next/server';

import { getEmotionTags } from '@/lib/ai';
import { createClient } from '@/lib/supabase/server';

// const cacheManager = new GoogleAICacheManager(
//   process.env.GOOGLE_GENERATIVE_AI_API_KEY,
// );

// Configure the model
const model = google('gemini-2.0-flash-lite');

// const { name: cachedContent } = await cacheManager.create({
//   model,
//   contents: [
//     {
//       role: 'user',
//       parts: [{ text: '1000 Lasagna Recipes...' }],
//     },
//   ],
//   ttlSeconds: 60 * 5,
// });

// OR gpt-4.1-nano with temperature 0.7

export async function POST(request: Request) {
  const {
    prompt,
    selectedVoiceLanguage,
  }: { prompt: string; selectedVoiceLanguage: string } = await request.json();
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const { data } = await supabase.auth.getUser();
    const user = data?.user;

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

    // Create the prompt for emotion tag generation
    const system = `Below is a text. The text is missing annotations for a voice actor.
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
      maxTokens: 500,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Text generation error:', error);

    Sentry.captureException({
      error: 'Text generation failed',
      originalError: error,
      prompt,
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
