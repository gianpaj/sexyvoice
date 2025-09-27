import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createHash } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { generateVoice, type VoiceGenerationRequest } from '@/lib/voice-generation';

const { logger } = Sentry;

// https://vercel.com/docs/functions/configuring-functions/duration
export const maxDuration = 320; // seconds - fluid compute is enabled

interface OpenAISpeechRequest {
  model: string; // Not used, we determine model from voice
  input: string; // The text to generate audio for
  voice: string; // The voice to use
  response_format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'; // Default: mp3 (ignored for now)
  speed?: number; // Speed of speech (0.25 to 4.0), ignored for now
}

async function validateApiKey(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  // Extract prefix from API key (format: svai_xxxxxx_xxxxxx...)
  const keyParts = apiKey.split('_');
  if (keyParts.length < 3 || !keyParts[0] || keyParts[0] !== 'svai') {
    return null;
  }

  const prefix = `${keyParts[0]}_${keyParts[1]}`;
  const keyHash = createHash('sha256').update(apiKey).digest('hex');

  const supabase = await createClient();
  
  // Use the database function to validate and update last_used_at
  const { data, error } = await supabase.rpc('validate_api_key', {
    api_key_prefix: prefix,
    api_key_hash: keyHash,
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  return {
    userId: data[0].user_id,
    apiKeyId: data[0].api_key_id,
  };
}

export async function POST(request: Request) {
  try {
    // Validate API key
    const authHeader = request.headers.get('Authorization');
    const authResult = await validateApiKey(authHeader);
    
    if (!authResult) {
      return NextResponse.json(
        { 
          error: {
            message: 'Invalid API key provided.',
            type: 'invalid_request_error',
            code: 'invalid_api_key'
          }
        },
        { status: 401 }
      );
    }

    const { userId, apiKeyId } = authResult;

    // Get user info for voice generation context
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    
    if (userError || !userData.user) {
      logger.error('Failed to get user for API key', { userId, apiKeyId });
      return NextResponse.json(
        {
          error: {
            message: 'Invalid API key - user not found.',
            type: 'invalid_request_error',
            code: 'invalid_api_key'
          }
        },
        { status: 401 }
      );
    }

    // Parse request body
    let body: OpenAISpeechRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            message: 'Invalid JSON in request body.',
            type: 'invalid_request_error',
            code: 'invalid_request_error'
          }
        },
        { status: 400 }
      );
    }

    const { input, voice, speed } = body;

    // Validate required parameters
    if (!input || typeof input !== 'string') {
      return NextResponse.json(
        {
          error: {
            message: 'Missing or invalid required parameter: input',
            type: 'invalid_request_error',
            code: 'missing_required_parameter'
          }
        },
        { status: 400 }
      );
    }

    if (!voice || typeof voice !== 'string') {
      return NextResponse.json(
        {
          error: {
            message: 'Missing or invalid required parameter: voice',
            type: 'invalid_request_error',
            code: 'missing_required_parameter'
          }
        },
        { status: 400 }
      );
    }

    // Validate speed if provided
    if (speed !== undefined && (typeof speed !== 'number' || speed < 0.25 || speed > 4.0)) {
      return NextResponse.json(
        {
          error: {
            message: 'Speed must be a number between 0.25 and 4.0',
            type: 'invalid_request_error',
            code: 'invalid_parameter'
          }
        },
        { status: 400 }
      );
    }

    // Convert to internal voice generation request
    const voiceRequest: VoiceGenerationRequest = {
      text: input,
      voice: voice,
      styleVariant: speed ? `Speak at ${speed}x speed` : undefined,
    };

    const context = {
      user: userData.user,
      apiKeyId,
      requestSignal: request.signal,
    };

    const result = await generateVoice(voiceRequest, context);

    if ('error' in result) {
      // Map internal errors to OpenAI-compatible format
      if (result.error === 'Missing required parameters') {
        return NextResponse.json(
          {
            error: {
              message: 'Missing required parameters.',
              type: 'invalid_request_error',
              code: 'missing_required_parameter'
            }
          },
          { status: 400 }
        );
      }

      if (result.error === 'Voice not found') {
        return NextResponse.json(
          {
            error: {
              message: `The voice '${voice}' is not supported.`,
              type: 'invalid_request_error',
              code: 'invalid_voice'
            }
          },
          { status: 400 }
        );
      }

      if (result.error.includes('maximum length')) {
        return NextResponse.json(
          {
            error: {
              message: result.error,
              type: 'invalid_request_error',
              code: 'text_too_long'
            }
          },
          { status: 400 }
        );
      }

      if (result.error === 'Insufficient credits') {
        return NextResponse.json(
          {
            error: {
              message: 'You have exceeded your API quota. Please check your plan and billing details.',
              type: 'invalid_request_error',
              code: 'quota_exceeded'
            }
          },
          { status: 429 }
        );
      }

      if (result.errorCode === 'gproLimitExceeded') {
        return NextResponse.json(
          {
            error: {
              message: result.error,
              type: 'invalid_request_error',
              code: 'quota_exceeded'
            }
          },
          { status: 429 }
        );
      }

      if (result.error === 'Third-party API Quota exceeded') {
        return NextResponse.json(
          {
            error: {
              message: 'Service temporarily unavailable due to high demand. Please try again later.',
              type: 'server_error',
              code: 'service_unavailable'
            }
          },
          { status: 503 }
        );
      }

      // Generic error
      return NextResponse.json(
        {
          error: {
            message: result.error,
            type: 'server_error',
            code: 'internal_error'
          }
        },
        { status: 500 }
      );
    }

    // Return successful response in OpenAI format
    // Instead of returning the URL directly, we redirect to it
    // This matches OpenAI's behavior of returning the audio file directly
    return Response.redirect(result.url, 302);

  } catch (error) {
    Sentry.captureException({
      error: 'External API voice generation error',
      errorData: error,
    });
    console.error('External API voice generation error:', error);

    return NextResponse.json(
      {
        error: {
          message: 'An error occurred while processing your request.',
          type: 'server_error',
          code: 'internal_error'
        }
      },
      { status: 500 }
    );
  }
}