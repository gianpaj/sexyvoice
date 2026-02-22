import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
import { captureException, logger } from '@sentry/nextjs';
import type { User } from '@supabase/supabase-js';
import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  defaultLanguage,
  languageInitialInstructions,
  type PlaygroundState,
} from '@/data/playground-state';
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

// Zod schema for session config
const sessionConfigSchema = z.object({
  model: z.string(),
  voice: z.string(),
  temperature: z.number().min(0).max(2),
  maxOutputTokens: z.number().nullable(),
  grokImageEnabled: z.boolean(),
});

// Zod schema for playground state
const playgroundStateSchema = z.object({
  instructions: z.string(),
  language: z
    .enum([
      'ar',
      'cs',
      'da',
      'de',
      'en',
      'es',
      'fi',
      'fr',
      'hi',
      'it',
      'ja',
      'ko',
      'nl',
      'no',
      'pl',
      'pt',
      'ru',
      'sv',
      'tr',
      'zh',
    ] as const)
    .optional(),
  selectedPresetId: z.uuid().nullable(),
  sessionConfig: sessionConfigSchema,
  customCharacters: z.array(z.any()).optional(),
  initialInstruction: z.string().optional(),
  defaultPresets: z.array(z.any()).optional(),
});

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

    // Check if user has credits
    const currentAmount = await getCredits(user.id);

    if (currentAmount < MINIMUM_CREDITS_FOR_CALL) {
      logger.info('Insufficient credits', {
        user: { id: user.id, email: user.email },
        extra: { currentCreditsAmount: currentAmount },
      });
      return APIErrorResponse('Insufficient credits', 402);
    }

    // Check if free user has exceeded the 5-minute call limit
    const isOverCallLimit = await isFreeUserOverCallLimit(user.id);
    if (isOverCallLimit) {
      logger.info('Free user exceeded call limit', {
        user: { id: user.id, email: user.email },
      });
      return APIErrorResponse(
        'Free users are limited to 5 minutes of calls. Please upgrade to continue.',
        403,
      );
    }

    let playgroundState: PlaygroundState;

    try {
      const body = await request.json();
      const validationResult = playgroundStateSchema.safeParse(body);

      if (!validationResult.success) {
        const formattedError = z.treeifyError(validationResult.error);
        logger.error('Invalid request body schema', {
          error: formattedError,
        });
        return NextResponse.json(
          {
            error: 'Invalid request body',
            details: z.prettifyError(validationResult.error),
          },
          { status: 400 },
        );
      }

      playgroundState = validationResult.data as PlaygroundState;
    } catch (error) {
      logger.error('Invalid JSON in request body', {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 },
      );
    }

    const roomName = `ro-${crypto.randomUUID()}`;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!(apiKey && apiSecret)) {
      return NextResponse.json(
        { error: 'LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set' },
        { status: 400 },
      );
    }

    const {
      instructions: clientInstructions,
      language = defaultLanguage,
      selectedPresetId,
      sessionConfig: {
        model,
        voice,
        temperature,
        maxOutputTokens,
        grokImageEnabled,
      },
    } = playgroundState;

    const selectedLanguage = languageInitialInstructions[language]
      ? language
      : defaultLanguage;

    // Validate voice exists in DB
    const voiceObj = await getVoiceIdByName(voice, false);

    if (!voiceObj) {
      captureException('Voice not found', { extra: { voice } });
      return NextResponse.json({ error: 'Voice not found' }, { status: 404 });
    }

    // ─── Resolve instructions ───
    // Always resolve selected presets from DB (public and custom).
    // Only non-preset calls (no selectedPresetId) can use client-sent instructions.
    let resolvedInstructions = clientInstructions;

    if (selectedPresetId) {
      try {
        const character = await resolveCharacterPrompt(selectedPresetId);

        if (!character) {
          return NextResponse.json(
            { error: 'Character not found' },
            { status: 404 },
          );
        }

        if (character.is_public) {
          // ── Predefined character ──
          // Resolve localized prompt, falling back to English
          const prompts = character.prompts as {
            prompt: string;
            localized_prompts: Record<string, string> | null;
          } | null;

          if (!prompts?.prompt) {
            return NextResponse.json(
              { error: 'Character prompt not found' },
              { status: 404 },
            );
          }

          resolvedInstructions =
            prompts.localized_prompts?.[selectedLanguage] || prompts.prompt;
          // Client-sent instructions are IGNORED for predefined characters
        } else {
          // ── Custom character ──
          // Verify ownership
          if (character.user_id !== user.id) {
            return NextResponse.json(
              { error: 'Character not found' },
              { status: 404 },
            );
          }

          // Verify user has paid (custom characters require paid account)
          const isPaid = await hasUserPaid(user.id);
          if (!isPaid) {
            return NextResponse.json(
              { error: 'Custom characters require a paid account' },
              { status: 403 },
            );
          }

          // Resolve prompt from DB (not from client)
          const prompts = character.prompts as {
            prompt: string;
            localized_prompts: Record<string, string> | null;
          } | null;

          if (!prompts?.prompt) {
            return NextResponse.json(
              { error: 'Character prompt not found' },
              { status: 404 },
            );
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
        return NextResponse.json(
          { error: 'Failed to resolve character prompt' },
          { status: 500 },
        );
      }
    }

    // Create metadata for agent to start with
    const metadata = {
      instructions: resolvedInstructions,
      model,
      voice: voiceObj.id,
      temperature,
      max_output_tokens: maxOutputTokens,
      grok_image_enabled: grokImageEnabled,
      language: selectedLanguage,
      initial_instruction: ' ',
      user_id: user.id,
      character_id: selectedPresetId, // Track which character is being used
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
    return NextResponse.json(
      {
        error: 'Error generating token',
        details: error instanceof Error ? error.message : JSON.stringify(error),
      },
      { status: 500 },
    );
  }
}
