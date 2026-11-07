import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
import { captureException, logger } from '@sentry/nextjs';
import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isCallMemoryEnabled } from '@/lib/call-memory';
import {
  buildAgentMetadata,
  callTokenRequestSchema,
} from '@/lib/calls/call-token';
import { characterPrompt, toCharacter } from '@/lib/calls/characters';
import type { CallErrorCode } from '@/lib/calls/errors';
import { DEFAULT_CALL_LANGUAGE } from '@/lib/calls/languages';
import { APIErrorResponse } from '@/lib/error-ts';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { resolveCallVoice } from '@/lib/supabase/call-voices';
import {
  FREE_USER_CALL_LIMIT_SECONDS,
  MINIMUM_CREDITS_FOR_CALL,
} from '@/lib/supabase/constants';
import {
  getCallCharacter,
  getCredits,
  hasUserPaid,
  isFreeUserOverCallLimit,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

/** A refusal the browser explains by its `code`. */
const refuse = (message: string, status: number, code: CallErrorCode) =>
  APIErrorResponse(message, status, { code });

async function resolveMemoryPreference(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<boolean> {
  try {
    // biome-ignore lint/plugin/use-verified-claims: Read the saved preference so stale JWT metadata cannot override an opt-out.
    const { data, error } = await supabase.auth.getUser();
    if (error || data?.user?.id !== userId) {
      throw new Error('Memory preference unavailable');
    }
    return isCallMemoryEnabled(data.user.user_metadata);
  } catch {
    logger.warn('Memory preference unavailable; starting call without memory', {
      user: { id: userId },
    });
    return false;
  }
}

export async function POST(request: Request) {
  let user: { id: string; email?: string } | null = null;
  try {
    const supabase = await createClient();
    const claims = await getVerifiedClaims(supabase);

    if (!claims?.sub) {
      logger.error('User not found', {
        headers: Object.fromEntries(request.headers.entries()),
      });
      return APIErrorResponse('User not found', 401);
    }

    user = { email: claims.email, id: claims.sub };

    const [currentAmount, isOverCallLimit] = await Promise.all([
      getCredits(user.id),
      isFreeUserOverCallLimit(user.id),
    ]);

    if (currentAmount < MINIMUM_CREDITS_FOR_CALL) {
      logger.info('Insufficient credits', {
        extra: { currentCreditsAmount: currentAmount },
        user: { email: user.email, id: user.id },
      });
      return refuse('Insufficient credits', 402, 'insufficient_credits');
    }

    if (isOverCallLimit) {
      logger.info('Free user exceeded call limit', {
        user: { email: user.email, id: user.id },
      });
      return refuse(
        `Free users are limited to ${FREE_USER_CALL_LIMIT_SECONDS / 60} minutes of calls`,
        403,
        'free_call_limit',
      );
    }

    let callRequest: z.output<typeof callTokenRequestSchema>;

    try {
      const body: unknown = await request.json();
      const validationResult = callTokenRequestSchema.safeParse(body);

      if (!validationResult.success) {
        const formattedError = z.treeifyError(validationResult.error);
        logger.error('Invalid request body schema', {
          error: formattedError,
        });
        return APIErrorResponse('Invalid request body', 400, {
          details: z.prettifyError(validationResult.error),
        });
      }

      callRequest = validationResult.data;
    } catch (error) {
      logger.error('Invalid JSON in request body', {
        error: Error.isError(error) ? error.message : String(error),
      });
      return APIErrorResponse('Invalid JSON in request body', 400);
    }

    const roomName = `ro-${crypto.randomUUID()}`;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!(apiKey && apiSecret)) {
      return APIErrorResponse(
        'LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set',
        500,
      );
    }

    const {
      characterId,
      language = DEFAULT_CALL_LANGUAGE,
      sceneId = null,
      sceneText,
    } = callRequest;

    const memoryPreference = resolveMemoryPreference(supabase, user.id);

    // Prompt, model, voice and temperature come from the saved character.
    const row = await getCallCharacter(characterId);
    if (!row) {
      return refuse('Character not found', 404, 'character_not_found');
    }
    const character = toCharacter(row);

    let isPaidUser: boolean | undefined;
    if (!character.isPublic) {
      if (row.user_id !== user.id) {
        return refuse('Character not found', 404, 'character_not_found');
      }
      isPaidUser = await hasUserPaid(user.id);
      if (!isPaidUser) {
        return refuse(
          'Custom characters require a paid account',
          403,
          'paid_character',
        );
      }
    }

    const prompt = characterPrompt(character, language);
    if (!prompt.trim()) {
      return refuse('Character prompt not found', 404, 'character_not_found');
    }

    const { sessionConfig } = character;
    const voice = await resolveCallVoice(sessionConfig, user.id);
    if (!voice) {
      captureException('Voice not found', {
        extra: { voice: sessionConfig.voice },
      });
      return refuse('Voice not found', 404, 'voice_not_found');
    }

    const scene = sceneText?.trim() ?? '';
    if (scene) {
      isPaidUser ??= await hasUserPaid(user.id);
      if (!isPaidUser) {
        return refuse('Scenes require a paid account', 403, 'paid_scene');
      }
    }

    const metadata = buildAgentMetadata({
      characterId,
      language,
      // The profile preference, read fresh for every call.
      memory: await memoryPreference,
      prompt,
      sceneId,
      sceneText: scene,
      sessionConfig,
      userId: user.id,
      voiceId: voice.id,
    });

    // Create access token
    const at = new AccessToken(apiKey, apiSecret, {
      identity: 'human',
      metadata: JSON.stringify(metadata),
    });

    // Add room grants
    at.addGrant({
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      canUpdateOwnMetadata: true,
      room: roomName,
      roomJoin: true,
    });

    // Create room configuration + dispatch agent
    at.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          // Must match the agent's LIVEKIT_AGENT_NAME; use a dev name locally.
          agentName: process.env.LIVEKIT_AGENT_NAME || 'sexycall',
        }),
      ],
      name: roomName,
    });

    logger.info('Generated LiveKit token', {
      extra: {
        characterId,
        model: sessionConfig.model,
        roomName,
        sceneId,
        voice: sessionConfig.voice,
      },
      user: { id: user.id },
    });

    return NextResponse.json({
      accessToken: await at.toJwt(),
      url: process.env.LIVEKIT_URL,
    });
  } catch (error) {
    console.error('Error generating token:', error);
    captureException(error, {
      user: user ? { email: user.email, id: user.id } : undefined,
    });
    return APIErrorResponse('Error generating token', 500, {
      details: Error.isError(error) ? error.message : JSON.stringify(error),
    });
  }
}
