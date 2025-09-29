import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import crypto from 'node:crypto';
import { validateApiKey } from '@/lib/supabase/queries';
import { generateVoice } from '@/lib/voice-generation';

const { logger } = Sentry;

export const maxDuration = 320; // seconds - fluid compute is enabled

// OpenAI-compatible API for text-to-speech generation
export async function POST(request: Request) {
  try {
    // Extract and validate API key from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const apiKey = authHeader.substring(7); // Remove "Bearer " prefix
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing API key' },
        { status: 401 }
      );
    }

    // Hash the API key for lookup
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Validate API key and get user
    const apiKeyData = await validateApiKey(keyHash);
    if (!apiKeyData) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const user = {
      id: apiKeyData.user_id,
      email: apiKeyData.profiles.email,
    };

    // Parse request body
    const body = await request.json();
    
    if (!body) {
      return NextResponse.json(
        { error: 'Request body is required' },
        { status: 400 }
      );
    }

    // OpenAI-compatible parameters
    const {
      model = 'tts-1', // OpenAI model, we'll map this to our voice
      input: text,
      voice,
      response_format = 'mp3',
      speed = 1.0,
    } = body;

    // Validate required parameters
    if (!text) {
      return NextResponse.json(
        {
          error: {
            type: 'invalid_request_error',
            message: 'Missing required parameter: input',
            param: 'input',
            code: null,
          },
        },
        { status: 400 }
      );
    }

    if (!voice) {
      return NextResponse.json(
        {
          error: {
            type: 'invalid_request_error',
            message: 'Missing required parameter: voice',
            param: 'voice',
            code: null,
          },
        },
        { status: 400 }
      );
    }

    // Validate response format (we currently support mp3 and wav)
    if (response_format && !['mp3', 'wav'].includes(response_format)) {
      return NextResponse.json(
        {
          error: {
            type: 'invalid_request_error',
            message: 'Invalid response_format. Supported formats: mp3, wav',
            param: 'response_format',
            code: null,
          },
        },
        { status: 400 }
      );
    }

    // Generate voice using shared library
    const result = await generateVoice(
      {
        text,
        voice,
        styleVariant: '', // No style variant for external API
      },
      {
        user,
        apiKeyId: apiKeyData.id,
        signal: request.signal,
      }
    );

    // Handle error responses
    if ('error' in result) {
      const errorResponse = {
        error: {
          type: 'api_error',
          message: result.error,
          code: result.errorCode || null,
        },
      };

      // Map specific error statuses
      if (result.status === 402) {
        errorResponse.error.type = 'insufficient_quota';
      } else if (result.status === 404) {
        errorResponse.error.type = 'invalid_request_error';
        errorResponse.error.message = 'Invalid voice parameter';
      } else if (result.status === 429) {
        errorResponse.error.type = 'rate_limit_exceeded';
      }

      return NextResponse.json(errorResponse, { status: result.status });
    }

    // Success response - return the audio file URL
    // In a production OpenAI-style API, this would typically return the binary audio data
    // For now, we return the URL to the audio file
    return NextResponse.json({
      url: result.url,
      credits_used: result.creditsUsed,
      credits_remaining: result.creditsRemaining,
      format: response_format,
      model: model,
    });

  } catch (error) {
    logger.error('External API error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    console.error('External API error:', error);

    return NextResponse.json(
      {
        error: {
          type: 'api_error',
          message: 'Internal server error',
          code: null,
        },
      },
      { status: 500 }
    );
  }
}