import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateVoice } from '@/lib/voice-generation';

const { logger } = Sentry;

// https://vercel.com/docs/functions/configuring-functions/duration
export const maxDuration = 320; // seconds - fluid compute is enabled

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body) {
      logger.error('Request body is empty', {
        headers: Object.fromEntries(request.headers.entries()),
      });
      return NextResponse.json(
        { error: 'Request body is empty' },
        { status: 400 },
      );
    }

    const text = body.text || '';
    const voice = body.voice || '';
    const styleVariant = body.styleVariant || '';

    if (!text || !voice) {
      logger.error('Missing required parameters: text or voice', {
        body,
        headers: Object.fromEntries(request.headers.entries()),
      });
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      logger.error('User not found', {
        body,
        headers: Object.fromEntries(request.headers.entries()),
      });
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // Use shared voice generation library
    const result = await generateVoice(
      {
        text,
        voice,
        styleVariant,
      },
      {
        user,
        signal: request.signal,
      }
    );

    // Handle error responses
    if ('error' in result) {
      return NextResponse.json(
        { error: result.error, errorCode: result.errorCode },
        { status: result.status }
      );
    }

    // Success response
    return NextResponse.json(
      {
        url: result.url,
        creditsUsed: result.creditsUsed,
        creditsRemaining: result.creditsRemaining,
      },
      { status: 200 }
    );
  } catch (error) {
    Sentry.captureException({
      error: 'Voice generation error',
      errorData: error,
    });
    console.error('Voice generation error:', error);

    return NextResponse.json(
      { error: 'Failed to generate voice' },
      { status: 500 }
    );
  }
}

