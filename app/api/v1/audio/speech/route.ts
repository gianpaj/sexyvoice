import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { generateVoice } from '@/lib/voice-generation';
import { validateApiKey } from '@/lib/supabase/queries';

const { logger } = Sentry;

// Hash API key for validation (same as storage hash)
async function hashApiKey(key: string): Promise<string> {
  const textEncoder = new TextEncoder();
  const data = textEncoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const maxDuration = 320; // seconds - fluid compute is enabled

export async function POST(request: Request) {
  const startTime = Date.now();
  let userId = '';
  let apiKeyId: string | undefined;

  try {
    // Validate API key from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Missing or invalid Authorization header', {
        hasAuth: !!authHeader,
        authPrefix: authHeader?.substring(0, 10),
      });
      return NextResponse.json(
        { 
          error: {
            message: 'Missing or invalid API key',
            type: 'invalid_request_error',
            code: 'invalid_api_key'
          }
        },
        { status: 401 }
      );
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
    if (!apiKey.startsWith('sk-')) {
      logger.warn('Invalid API key format', {
        keyPrefix: apiKey.substring(0, 3),
      });
      return NextResponse.json(
        { 
          error: {
            message: 'Invalid API key format',
            type: 'invalid_request_error',
            code: 'invalid_api_key'
          }
        },
        { status: 401 }
      );
    }

    // Hash and validate the API key
    const keyHash = await hashApiKey(apiKey);
    const validApiKey = await validateApiKey(keyHash);
    
    if (!validApiKey) {
      logger.warn('Invalid API key provided', {
        keyHash: keyHash.substring(0, 8),
      });
      return NextResponse.json(
        { 
          error: {
            message: 'Invalid API key',
            type: 'invalid_request_error',
            code: 'invalid_api_key'
          }
        },
        { status: 401 }
      );
    }

    userId = validApiKey.user_id;
    apiKeyId = validApiKey.id;

    // Parse and validate request body
    let body: any;
    try {
      body = await request.json();
    } catch (error) {
      logger.error('Invalid JSON in request body', { error });
      return NextResponse.json(
        {
          error: {
            message: 'Invalid JSON in request body',
            type: 'invalid_request_error',
            code: 'invalid_json'
          }
        },
        { status: 400 }
      );
    }

    const { model, input, voice, speed } = body;

    // Validate required parameters
    if (!model) {
      return NextResponse.json(
        {
          error: {
            message: 'Missing required parameter: model',
            type: 'invalid_request_error',
            code: 'missing_required_parameter'
          }
        },
        { status: 400 }
      );
    }

    if (!input) {
      return NextResponse.json(
        {
          error: {
            message: 'Missing required parameter: input',
            type: 'invalid_request_error',
            code: 'missing_required_parameter'
          }
        },
        { status: 400 }
      );
    }

    if (!voice) {
      return NextResponse.json(
        {
          error: {
            message: 'Missing required parameter: voice',
            type: 'invalid_request_error',
            code: 'missing_required_parameter'
          }
        },
        { status: 400 }
      );
    }

    // Validate model (for now, we only support tts-1)
    if (model !== 'tts-1') {
      return NextResponse.json(
        {
          error: {
            message: 'Invalid model. Supported models: tts-1',
            type: 'invalid_request_error',
            code: 'invalid_model'
          }
        },
        { status: 400 }
      );
    }

    // Validate voice format (should be one of our available voices)
    if (typeof voice !== 'string' || voice.length === 0) {
      return NextResponse.json(
        {
          error: {
            message: 'Invalid voice parameter',
            type: 'invalid_request_error',
            code: 'invalid_voice'
          }
        },
        { status: 400 }
      );
    }

    // Validate input text
    if (typeof input !== 'string' || input.length === 0) {
      return NextResponse.json(
        {
          error: {
            message: 'Invalid input parameter - must be non-empty string',
            type: 'invalid_request_error',
            code: 'invalid_input'
          }
        },
        { status: 400 }
      );
    }

    if (input.length > 4000) {
      return NextResponse.json(
        {
          error: {
            message: 'Input text exceeds maximum length of 4000 characters',
            type: 'invalid_request_error',
            code: 'input_too_long'
          }
        },
        { status: 400 }
      );
    }

    // Optional speed parameter validation
    let styleVariant = '';
    if (speed !== undefined) {
      if (typeof speed !== 'number' || speed < 0.25 || speed > 4.0) {
        return NextResponse.json(
          {
            error: {
              message: 'Invalid speed parameter - must be between 0.25 and 4.0',
              type: 'invalid_request_error',
              code: 'invalid_speed'
            }
          },
          { status: 400 }
        );
      }
      // Convert speed to style variant if needed
      if (speed !== 1.0) {
        styleVariant = speed > 1.0 ? 'fast' : 'slow';
      }
    }

    // Generate voice using shared function
    const result = await generateVoice({
      userId,
      text: input,
      voice,
      styleVariant,
      apiKeyId,
      signal: request.signal,
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    logger.info('API voice generation completed', {
      userId,
      apiKeyId,
      voice,
      textLength: input.length,
      creditsUsed: result.creditsUsed,
      duration,
    });

    // Return OpenAI-compatible response
    return NextResponse.json({
      data: result.url,
      credits_used: result.creditsUsed,
      credits_remaining: result.creditsRemaining,
    });

  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    logger.error('API voice generation failed', {
      userId,
      apiKeyId,
      error: error instanceof Error ? error.message : String(error),
      duration,
    });

    // Handle specific API errors
    if (error && typeof error === 'object' && 'status' in error) {
      if (error.status === 402) {
        return NextResponse.json(
          {
            error: {
              message: 'Insufficient credits',
              type: 'insufficient_quota',
              code: 'insufficient_credits'
            }
          },
          { status: 402 }
        );
      }
      if (error.status === 403) {
        return NextResponse.json(
          {
            error: {
              message: 'Freemium usage limit exceeded',
              type: 'insufficient_quota', 
              code: 'rate_limit_exceeded'
            }
          },
          { status: 403 }
        );
      }
      if (error.status === 404) {
        return NextResponse.json(
          {
            error: {
              message: 'Voice not found',
              type: 'invalid_request_error',
              code: 'voice_not_found'
            }
          },
          { status: 404 }
        );
      }
    }

    // Handle quota exceeded errors
    if (error instanceof Error && error.message.includes('quota')) {
      return NextResponse.json(
        {
          error: {
            message: 'Third-party API quota exceeded. Please try again later.',
            type: 'server_error',
            code: 'quota_exceeded'
          }
        },
        { status: 503 }
      );
    }

    // Generic server error
    return NextResponse.json(
      {
        error: {
          message: 'An error occurred while processing your request',
          type: 'server_error',
          code: 'internal_error'
        }
      },
      { status: 500 }
    );
  }
}