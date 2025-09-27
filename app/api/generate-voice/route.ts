import * as Sentry from '@sentry/nextjs';
import type { User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { generateVoice } from '@/lib/voice-generation';
import { createClient } from '@/lib/supabase/server';

const { logger } = Sentry;

// https://vercel.com/docs/functions/configuring-functions/duration
export const maxDuration = 320; // seconds - fluid compute is enabled

export async function POST(request: Request) {
  let text = '';
  let voice = '';
  let user: User | null = null;
  
  try {
    const body = await request.json();

    if (request.body === null) {
      logger.error('Request body is empty', {
        headers: Object.fromEntries(request.headers.entries()),
      });
      return new Response('Request body is empty', { status: 400 });
    }
    
    text = body.text || '';
    voice = body.voice || '';
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
    user = data?.user;

    if (!user) {
      logger.error('User not found', {
        body,
        headers: Object.fromEntries(request.headers.entries()),
      });
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // Use the shared voice generation function
    const result = await generateVoice({
      userId: user.id,
      text,
      voice,
      styleVariant,
      signal: request.signal,
    });

    return NextResponse.json(
      {
        url: result.url,
        creditsUsed: result.creditsUsed,
        creditsRemaining: result.creditsRemaining,
      },
      { status: 200 },
    );
  } catch (error) {
    const errorObj = {
      text,
      voice,
      errorData: error,
    };
    Sentry.captureException({
      error: 'Voice generation error',
      user: user ? { id: user.id, email: user.email } : undefined,
      ...errorObj,
    });
    console.error(errorObj);
    console.error('Voice generation error:', error);

    // Handle API errors with proper response format
    if (error && typeof error === 'object' && 'status' in error) {
      if (error.status === 429) {
        logger.warn('Third-party API quota exceeded', { status: 429 });
        return NextResponse.json(
          { error: 'Third-party API Quota exceeded' },
          { status: 429 },
        );
      }
      if (error.status === 402) {
        return NextResponse.json(
          { error: 'Insufficient credits' },
          { status: 402 },
        );
      }
      if (error.status === 403) {
        return NextResponse.json(
          {
            error: 'You have exceeded the limit of 4 multilingual voice generations as a free user. Please try a different voice or upgrade your plan for unlimited access.',
            errorCode: 'gproLimitExceeded',
          },
          { status: 403 },
        );
      }
      if (error.status === 404) {
        return NextResponse.json(
          { error: 'Voice not found' },
          { status: 404 },
        );
      }
    }

    if (error instanceof Error) {
      // if Gemini error
      if (error.message.includes('googleapis')) {
        try {
          const message = JSON.parse(error.message);
          // You exceeded your current quota
          if (message.error.code === 429) {
            return NextResponse.json(
              {
                error: 'We have exceeded our third-party API current quota, please try later or tomorrow',
              },
              { status: 500 },
            );
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(
      { error: 'Failed to generate voice' },
      { status: 500 },
    );
  }
}
