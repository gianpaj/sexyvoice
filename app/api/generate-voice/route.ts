import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { generateVoice, type VoiceGenerationRequest } from '@/lib/voice-generation';

const { logger } = Sentry;

// https://vercel.com/docs/functions/configuring-functions/duration
export const maxDuration = 320; // seconds - fluid compute is enabled

export async function POST(request: Request) {
  let user: User | null = null;
  
  try {
    const body = await request.json();

    if (request.body === null) {
      logger.error('Request body is empty', {
        headers: Object.fromEntries(request.headers.entries()),
      });
      return new Response('Request body is empty', { status: 400 });
    }

    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user;

    if (!user) {
      logger.error('User not found', {
        body,
        headers: Object.fromEntries(request.headers.entries()),
      });
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const voiceRequest: VoiceGenerationRequest = {
      text: body.text || '',
      voice: body.voice || '',
      styleVariant: body.styleVariant || '',
    };

    const context = {
      user,
      requestSignal: request.signal,
    };

    const result = await generateVoice(voiceRequest, context);

    if ('error' in result) {
      // Handle specific error types
      if (result.errorCode === 'gproLimitExceeded') {
        return NextResponse.json(result, { status: 403 });
      }
      if (result.error === 'Insufficient credits') {
        return NextResponse.json(result, { status: 402 });
      }
      if (result.error === 'Voice not found') {
        return NextResponse.json(result, { status: 404 });
      }
      if (result.error.includes('maximum length')) {
        return NextResponse.json(result, { status: 400 });
      }
      if (result.error === 'Missing required parameters') {
        return NextResponse.json(result, { status: 400 });
      }
      if (result.error === 'Third-party API Quota exceeded') {
        return NextResponse.json(result, { status: 429 });
      }
      // Generic error
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    Sentry.captureException({
      error: 'Voice generation API error',
      user: user ? { id: user.id, email: user.email } : undefined,
      errorData: error,
    });
    console.error('Voice generation API error:', error);
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
