import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
import { captureException, logger } from '@sentry/nextjs';
import type { User } from '@supabase/supabase-js';
import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

import type { PlaygroundState } from '@/data/playground-state';
import { APIErrorResponse } from '@/lib/error-ts';
import { getCredits, getVoiceIdByName } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  let user: User | null = null;
  try {
    // Authentication
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user;

    if (!user) {
      logger.error('User not found', {
        headers: Object.fromEntries(request.headers.entries()),
      });
      return APIErrorResponse('User not found', 401);
    }

    // Check if user has credits
    const currentAmount = await getCredits(user.id);

    if (currentAmount <= 10) {
      logger.info('Insufficient credits', {
        user: { id: user.id, email: user.email },
        extra: { currentCreditsAmount: currentAmount },
      });
      return APIErrorResponse('Insufficient credits', 402);
    }

    let playgroundState: PlaygroundState;

    try {
      playgroundState = await request.json();
    } catch (error) {
      logger.error('Invalid JSON in request body', {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 },
      );
    }

    const {
      instructions,
      sessionConfig: {
        model,
        voice,
        temperature,
        maxOutputTokens,
        grokImageEnabled,
      },
    } = playgroundState;

    const xaiAPIKey = process.env.XAI_API_KEY;
    if (!xaiAPIKey) {
      captureException({
        error: 'xAI API key is required',
      });
      return NextResponse.json(
        { error: 'xAI API key is required' },
        { status: 400 },
      );
    }

    const roomName = `ro-${crypto.randomUUID()}`;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!(apiKey && apiSecret)) {
      captureException({
        error: 'LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set',
      });
      throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set');
    }

    const voiceObj = await getVoiceIdByName(voice, false);

    if (!voiceObj) {
      captureException({ error: 'Voice not found', voice });
      return NextResponse.json({ error: 'Voice not found' }, { status: 404 });
    }

    // Create metadata for agent to start with
    const metadata = {
      instructions,
      model,
      voice: voiceObj.id,
      temperature,
      max_output_tokens: maxOutputTokens,
      grok_image_enabled: grokImageEnabled,
      xai_api_key: xaiAPIKey,
      user_id: user.id,
    };

    // Create access token
    const at = new AccessToken(apiKey, apiSecret, {
      identity: 'human',
      metadata: JSON.stringify(metadata),
    });

    // Add room grants
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      canUpdateOwnMetadata: true,
    });

    // Create room configuration + dispatch agent
    at.roomConfig = new RoomConfiguration({
      name: roomName,
      agents: [
        new RoomAgentDispatch({
          agentName: 'grok-playground',
        }),
      ],
    });

    logger.info('Generated LiveKit token', {
      user: { id: user.id },
      extra: { roomName },
    });

    return NextResponse.json({
      accessToken: await at.toJwt(),
      url: process.env.LIVEKIT_URL,
    });
  } catch (error) {
    captureException({
      error: 'Error generating token',
      user: user ? { id: user.id, email: user.email } : undefined,
      errorData: error,
    });
    console.error('Token generation error:', error);
    return NextResponse.json(
      {
        error: 'Error generating token',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
