import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
import { captureException, logger } from '@sentry/nextjs';
import type { User } from '@supabase/supabase-js';
import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { callScenes } from '@/data/call-scenes';
import {
  defaultLanguage,
  languageInitialInstructions,
} from '@/data/playground-state';
import {
  type CallTokenPlaygroundState,
  callTokenPlaygroundStateSchema,
} from '@/lib/call-token-schema';
import { APIErrorResponse } from '@/lib/error-ts';
import { MINIMUM_CREDITS_FOR_CALL } from '@/lib/supabase/constants';
import {
  getCredits,
  getVoiceIdByName,
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: token endpoint validates multiple guard rails
export async function POST(request: Request) {
  let user: User | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user;

    if (!user) {
      logger.error('User not found', {
        headers: Object.fromEntries(request.headers.entries()),
      });
      return APIErrorResponse('User not found', 401);
    }

    const [currentAmount, isOverCallLimit] = await Promise.all([
      getCredits(user.id),
      isFreeUserOverCallLimit(user.id),
    ]);

    if (currentAmount < MINIMUM_CREDITS_FOR_CALL) {
      logger.info('Insufficient credits', {
        user: { id: user.id, email: user.email },
        extra: { currentCreditsAmount: currentAmount },
      });
      return APIErrorResponse('Insufficient credits', 402);
    }

    // Check if free user has exceeded the 5-minute call limit
    if (isOverCallLimit) {
      logger.info('Free user exceeded call limit', {
        user: { id: user.id, email: user.email },
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
      sessionConfig: { model, voice, temperature, maxOutputTokens },
    } = playgroundState;

    const selectedLanguage = languageInitialInstructions[language]
      ? language
      : defaultLanguage;

    // Validate voice exists in DB
    const voiceObj = await getVoiceIdByName(voice);

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

        if (character.is_public) {
          // ── Predefined character ──
          // Resolve localized prompt, falling back to English
          const prompts = character.prompts as {
            prompt: string;
            localized_prompts: Record<string, string> | null;
          } | null;

          if (!prompts?.prompt) {
            return APIErrorResponse('Character prompt not found', 404);
          }

          resolvedInstructions =
            prompts.localized_prompts?.[selectedLanguage] || prompts.prompt;
          // Client-sent instructions are IGNORED for predefined characters
        } else {
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

          // Resolve prompt from DB (not from client)
          const prompts = character.prompts as {
            prompt: string;
            localized_prompts: Record<string, string> | null;
          } | null;

          if (!prompts?.prompt) {
            return APIErrorResponse('Character prompt not found', 404);
          }

          resolvedInstructions =
            prompts.localized_prompts?.[selectedLanguage] || prompts.prompt;
        }
      } catch (error) {
        captureException(error, {
          extra: {
            selectedPresetId,
            userId: user.id,
            context: 'resolveCharacterPrompt',
          },
        });
        return APIErrorResponse('Failed to resolve character prompt', 500);
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

    // Long-term memory is a paid-only feature. Enforce server-side so a stale
    // or tampered client can't enable it for a free user. Reuse the lazily
    // resolved paid-status flag to avoid an extra query when possible.
    let memoryEnabled = false;
    if (memory) {
      if (isPaidUser === undefined) {
        isPaidUser = await hasUserPaid(user.id);
      }
      memoryEnabled = isPaidUser;
    }

    const defaultSceneText = callScenes.find(
      (s) => s.id === selectedSceneId,
    )?.text;
    const sceneModified =
      selectedSceneId != null &&
      (sceneInstructions?.trim() ?? '') !== (defaultSceneText?.trim() ?? '');

    // Create metadata for agent to start with
    const metadata = {
      instructions: resolvedInstructions,
      model,
      voice: voiceObj.id,
      temperature,
      max_output_tokens: maxOutputTokens,
      language: selectedLanguage,
      initial_instruction:
        languageInitialInstructions[selectedLanguage] ||
        languageInitialInstructions[defaultLanguage],
      user_id: user.id,
      character_id: selectedPresetId,
      scene_id: selectedSceneId ?? null,
      scene_modified: sceneModified,
      // Long-term memory opt-in (paid users only). Absent/false → the agent
      // stores nothing. Scope is per-user only for now (sexycall defaults
      // memory_scope to "user"); per-character scope is deferred.
      memory: memoryEnabled,
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
          agentName: 'sexycall',
        }),
      ],
    });

    logger.info('Generated LiveKit token', {
      user: { id: user.id },
      extra: {
        roomName,
        selectedPresetId,
        selectedSceneId,
        characterId: selectedPresetId,
        voice,
        model,
      },
    });

    return NextResponse.json({
      accessToken: await at.toJwt(),
      url: process.env.LIVEKIT_URL,
    });
  } catch (error) {
    console.error('Error generating token:', error);
    captureException(error, {
      user: user ? { id: user.id, email: user.email } : undefined,
    });
    return APIErrorResponse('Error generating token', 500, {
      details: Error.isError(error) ? error.message : JSON.stringify(error),
    });
  }
}
