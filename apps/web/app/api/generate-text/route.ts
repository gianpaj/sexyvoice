import { type GoogleLanguageModelOptions, google } from '@ai-sdk/google';
// biome-ignore lint/performance/noNamespaceImport: keep Sentry imports consistent with its Next.js integration
import * as Sentry from '@sentry/nextjs';
import { streamText } from 'ai';

import { APIErrorResponse } from '@/lib/error-ts';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { getTtsModel } from '@/lib/tts/models';

// gemini-3.1-flash-lite
// Latest update: May 7, 2026
// Discontinuation date: May 7, 2027
const model = google('gemini-3.1-flash-lite');

export async function POST(request: Request) {
  const {
    prompt,
    selectedVoiceLanguage,
    voiceModel,
  }: {
    prompt: string;
    selectedVoiceLanguage: string;
    voiceModel?: string;
  } = await request.json();
  let user: { id: string; email?: string } | null = null;
  try {
    const supabase = await createClient();

    const claims = await getVerifiedClaims(supabase);

    if (!claims?.sub) {
      return APIErrorResponse('User not found', 401);
    }

    user = { email: claims.email, id: claims.sub };

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return APIErrorResponse('Text is required', 400);
    }

    if (prompt.length > 1000) {
      return APIErrorResponse(
        'Text exceeds maximum length of 1000 characters',
        400,
      );
    }

    const enhancePrompt = getTtsModel(voiceModel)?.enhancePrompt;
    if (!enhancePrompt) {
      return APIErrorResponse(
        'Text improvement is not available for this voice',
        400,
      );
    }
    const system = enhancePrompt(selectedVoiceLanguage);

    const result = streamText({
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
      },
      // temperature: 0.7,
      maxOutputTokens: 500,
      model,
      prompt,
      providerOptions: {
        google: {
          thinkingConfig: {
            includeThoughts: false,
            thinkingLevel: 'low',
          },
        } satisfies GoogleLanguageModelOptions,
      },
      system,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Text generation error:', error);

    Sentry.captureException(error, {
      extra: { prompt },
      user: { email: user?.email, id: user?.id },
    });

    if (Error.isError(error)) {
      return APIErrorResponse(error.message, 500);
    }

    return APIErrorResponse('Failed to generate enhanced text', 500);
  }
}
