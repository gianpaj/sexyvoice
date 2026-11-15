import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
import { captureException, logger } from '@sentry/nextjs';
import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { callScenes } from '@/data/call-scenes';
import {
  defaultLanguage,
  getInitialInstruction,
  languageInitialInstructions,
} from '@/data/playground-state';
import { isCallMemoryEnabled } from '@/lib/call-memory';
import {
  type CallTokenPlaygroundState,
  callTokenPlaygroundStateSchema,
} from '@/lib/call-token-schema';
import { callVoiceProvider } from '@/lib/call-voices';
import { getPresetInstructions } from '@/lib/characters';
import { APIErrorResponse } from '@/lib/error-ts';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { resolveCallVoice } from '@/lib/supabase/call-voices';
import { MINIMUM_CREDITS_FOR_CALL } from '@/lib/supabase/constants';
import {
  getCredits,
  hasUserPaid,
  isFreeUserOverCallLimit,
  resolveCharacterPrompt,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

function appendSceneInstructions(
  instructions: string,
  sceneInstructions?: string | null,
): string {
  const trimmedSceneInstructions = sceneInstructions?.trim();
  if (!trimmedSceneInstructions) {
    return instructions;
  }

  return `${instructions.trim()}\n\nScene instructions:\n${trimmedSceneInstructions}`.trim();
}

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
      return APIErrorResponse('Insufficient credits', 402);
    }

    // Check if free user has exceeded the 5-minute call limit
    if (isOverCallLimit) {
      logger.info('Free user exceeded call limit', {
        user: { email: user.email, id: user.id },
      });
      return APIErrorResponse(
        'Free users are limited to 5 minutes of calls. Please upgrade to continue.',
        403,
      );
    }

    let playgroundState: CallTokenPlaygroundState;

    try {
      const body = await request.json();
      const validationResult = callTokenPlaygroundStateSchema.safeParse(body);

      if (!validationResult.success) {
        const formattedError = z.treeifyError(validationResult.error);
        logger.error('Invalid request body schema', {
          error: formattedError,
        });
        return APIErrorResponse('Invalid request body', 400, {
          details: z.prettifyError(validationResult.error),
        });
      }

      playgroundState = validationResult.data;
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
      instructions: clientInstructions,
      language = defaultLanguage,
      sceneInstructions,
      selectedPresetId,
      selectedSceneId,
      memory,
      clientTime,
      timeZone,
      sessionConfig: { model, voice, temperature, maxOutputTokens },
    } = playgroundState;

    const selectedLanguage = languageInitialInstructions[language]
      ? language
      : defaultLanguage;

    const memoryPreference = memory
      ? resolveMemoryPreference(supabase, user.id)
      : Promise.resolve(false);

    // Validate voice exists in DB
    const voiceObj = await resolveCallVoice(
      playgroundState.sessionConfig,
      user.id,
    );

    if (!voiceObj) {
      captureException('Voice not found', { extra: { voice } });
      return APIErrorResponse('Voice not found', 404);
    }

    // ─── Resolve instructions ───
    // Always resolve selected presets from DB (public and custom).
    // Only non-preset calls (no selectedPresetId) can use client-sent instructions.
    let resolvedInstructions = clientInstructions;
    let isPaidUser: boolean | undefined;

    if (selectedPresetId) {
      try {
        const character = await resolveCharacterPrompt(selectedPresetId);

        if (!character) {
          return APIErrorResponse('Character not found', 404);
        }

        if (!character.is_public) {
          // ── Custom character ──
          // Verify ownership
          if (character.user_id !== user.id) {
            return APIErrorResponse('Character not found', 404);
          }

          // Verify user has paid (custom characters require paid account)
          isPaidUser = await hasUserPaid(user.id);
          if (!isPaidUser) {
            return APIErrorResponse(
              'Custom characters require a paid account',
              403,
            );
          }
        }

        const prompts = character.prompts as {
          prompt: string;
          localized_prompts: Record<string, string> | null;
        } | null;

        if (!prompts?.prompt) {
          return APIErrorResponse('Character prompt not found', 404);
        }

        resolvedInstructions = getPresetInstructions(
          {
            instructions: prompts.prompt,
            localizedInstructions: prompts.localized_prompts ?? {},
          },
          selectedLanguage,
        );
      } catch (error) {
        captureException(error, {
          extra: {
            context: 'resolveCharacterPrompt',
            selectedPresetId,
            userId: user.id,
          },
        });
        return APIErrorResponse('Failed to resolve character prompt', 500);
      }
    }

    if (!selectedPresetId || callVoiceProvider(model)) {
      isPaidUser ??= await hasUserPaid(user.id);
      if (!isPaidUser) {
        return APIErrorResponse(
          'Custom characters require a paid account',
          403,
        );
      }
      if (!resolvedInstructions.trim()) {
        return APIErrorResponse('A personality prompt is required', 400);
      }
    }

    if (sceneInstructions?.trim()) {
      if (isPaidUser === undefined) {
        isPaidUser = await hasUserPaid(user.id);
      }
      if (!isPaidUser) {
        return APIErrorResponse('Scenes require a paid account', 403);
      }

      resolvedInstructions = appendSceneInstructions(
        resolvedInstructions,
        sceneInstructions,
      );
    }

    const memoryEnabled = await memoryPreference;

    const defaultSceneText = callScenes.find(
      (s) => s.id === selectedSceneId,
    )?.text;
    const sceneModified =
      selectedSceneId !== null &&
      selectedSceneId !== undefined &&
      (sceneInstructions?.trim() ?? '') !== (defaultSceneText?.trim() ?? '');

    // Create metadata for agent to start with
    const metadata = {
      character_id: selectedPresetId,
      client_time: clientTime,
      time_zone: timeZone,
      initial_instruction: getInitialInstruction(selectedLanguage, model),
      instructions: resolvedInstructions,
      language: selectedLanguage,
      max_output_tokens: maxOutputTokens,
      // The account preference and an explicit per-call opt-out both apply.
      memory: memoryEnabled,
      memory_scope: 'both',
      model,
      scene_id: selectedSceneId ?? null,
      scene_modified: sceneModified,
      temperature,
      user_id: user.id,
      voice: voiceObj.id,
    };

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
        characterId: selectedPresetId,
        model,
        roomName,
        selectedPresetId,
        selectedSceneId,
        voice,
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
