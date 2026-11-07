import { captureException } from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  deleteCustomCharacters,
  MAX_CHARACTER_DESCRIPTION_LENGTH,
  MAX_CHARACTER_NAME_LENGTH,
  MAX_CHARACTER_PROMPT_LENGTH,
  MAX_CUSTOM_CHARACTERS,
  OWN_CHARACTER_COLUMNS,
  type SaveCharacterPayload,
} from '@/lib/calls/characters';
import { callVoiceProvider, normalizeCallModel } from '@/lib/calls/models';
import { CLONED_VOICE_ID } from '@/lib/calls/voices';
import { APIErrorResponse } from '@/lib/error-ts';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { resolveCallVoice } from '@/lib/supabase/call-voices';
import { countUserCallCharacters, hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

const required = (label: string) => (issue: { input: unknown }) =>
  issue.input === undefined ? `${label} is required` : undefined;

const sessionConfigSchema = z.object(
  {
    audioReferenceId: z.uuid().optional(),
    maxOutputTokens: z.number().int().positive().nullable(),
    // Normalized before it is spread into the session_config JSONB, so a
    // stale client cannot write an unknown model id into a saved character.
    model: z.string().min(1, 'Model is required').transform(normalizeCallModel),
    temperature: z.number().min(0).max(1.2),
    voice: z.string().min(1, 'Voice is required'),
  },
  { error: required('Session config') },
);

const localizedText = (label: string, max: number) =>
  z
    .record(
      z.string(),
      z.string().max(max, `${label} must be ${max} characters or fewer`),
    )
    .default({});

const saveSchema = z.object({
  id: z.uuid().optional(),
  localizedDescriptions: localizedText(
    'Description',
    MAX_CHARACTER_DESCRIPTION_LENGTH,
  ),
  localizedPrompts: localizedText('Prompt', MAX_CHARACTER_PROMPT_LENGTH),
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(
      MAX_CHARACTER_NAME_LENGTH,
      `Name must be ${MAX_CHARACTER_NAME_LENGTH} characters or fewer`,
    ),
  prompt: z
    .string({ message: 'Prompt is required' })
    .max(
      MAX_CHARACTER_PROMPT_LENGTH,
      `Prompt must be ${MAX_CHARACTER_PROMPT_LENGTH} characters or fewer`,
    ),
  sessionConfig: sessionConfigSchema,
});

const deleteSchema = z.object({
  id: z.uuid({ error: required('Character ID') }),
});

const validationError = (error: z.ZodError) =>
  APIErrorResponse(error.issues[0]?.message ?? 'Validation error', 400);

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The user's own custom character, or the response that refuses it. */
async function findOwnCharacter(
  supabase: Supabase,
  id: string,
  userId: string,
  predefinedError: string,
) {
  const { data: character } = await supabase
    .from('characters')
    .select('id, prompt_id, user_id, is_public')
    .eq('id', id)
    .maybeSingle();
  if (!character) {
    return { response: APIErrorResponse('Character not found', 404) };
  }
  if (character.is_public) {
    return { response: APIErrorResponse(predefinedError, 403) };
  }
  if (character.user_id !== userId) {
    return { response: APIErrorResponse('Character not found', 404) };
  }
  return { character };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const claims = await getVerifiedClaims(supabase);

    if (!claims?.sub) {
      return APIErrorResponse('Unauthorized', 401);
    }

    // Check if user has paid
    const isPaid = await hasUserPaid(claims.sub);
    if (!isPaid) {
      return APIErrorResponse('Custom characters require a paid account', 403);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return APIErrorResponse('Invalid JSON in request body', 400);
    }

    const parsed = saveSchema.safeParse(rawBody);
    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const body: SaveCharacterPayload = parsed.data;
    const { localizedDescriptions, localizedPrompts, name, sessionConfig } =
      body;

    const resolvedVoice = await resolveCallVoice(sessionConfig, claims.sub);
    if (!resolvedVoice)
      return APIErrorResponse('Voice no longer available', 400);
    const voiceId = callVoiceProvider(sessionConfig.model)
      ? CLONED_VOICE_ID
      : resolvedVoice.id;

    if (body.id) {
      const found = await findOwnCharacter(
        supabase,
        body.id,
        claims.sub,
        'Cannot modify predefined characters',
      );
      if (found.response) return found.response;

      // The prompt and the character are updated in two statements.
      const { error: promptUpdateError } = await supabase
        .from('prompts')
        .update({ localized_prompts: localizedPrompts, prompt: body.prompt })
        .eq('id', found.character.prompt_id);

      if (promptUpdateError) {
        captureException(promptUpdateError, {
          extra: { characterId: body.id, userId: claims.sub },
        });
        return APIErrorResponse('Failed to update prompt', 500);
      }

      const { data: updatedCharacter, error: charUpdateError } = await supabase
        .from('characters')
        .update({
          localized_descriptions: localizedDescriptions,
          name,
          session_config: { ...sessionConfig },
          voice_id: voiceId,
        })
        .eq('id', body.id)
        .select(OWN_CHARACTER_COLUMNS)
        .single();

      if (charUpdateError) {
        captureException(charUpdateError, {
          extra: { characterId: body.id, userId: claims.sub },
        });
        return APIErrorResponse('Failed to update character', 500);
      }

      return NextResponse.json(updatedCharacter);
    }

    // The count and the insert are separate statements, so two concurrent
    // creates can pass the limit.
    const currentCount = await countUserCallCharacters(claims.sub);
    if (currentCount >= MAX_CUSTOM_CHARACTERS) {
      return APIErrorResponse(
        `Maximum of ${MAX_CUSTOM_CHARACTERS} custom characters reached`,
        400,
      );
    }

    const { data: newPrompt, error: promptInsertError } = await supabase
      .from('prompts')
      .insert({
        is_public: false,
        localized_prompts: localizedPrompts,
        prompt: body.prompt,
        type: 'call' as const,
        user_id: claims.sub,
      })
      .select('id')
      .single();

    if (promptInsertError || !newPrompt) {
      captureException(promptInsertError, {
        extra: { userId: claims.sub },
      });
      return APIErrorResponse('Failed to create prompt', 500);
    }

    const { data: newCharacter, error: charInsertError } = await supabase
      .from('characters')
      .insert({
        is_public: false,
        localized_descriptions: localizedDescriptions,
        name,
        prompt_id: newPrompt.id,
        session_config: { ...sessionConfig },
        sort_order: currentCount,
        user_id: claims.sub,
        voice_id: voiceId,
      })
      .select(OWN_CHARACTER_COLUMNS)
      .single();

    if (charInsertError || !newCharacter) {
      captureException(charInsertError, {
        extra: { promptId: newPrompt.id, userId: claims.sub },
      });
      // A prompt without its character is never shown; remove it.
      await deleteCustomCharacters(supabase, claims.sub, newPrompt.id);
      return APIErrorResponse('Failed to create character', 500);
    }

    return NextResponse.json(newCharacter, { status: 201 });
  } catch (error) {
    captureException(error);
    return APIErrorResponse('Internal server error', 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const claims = await getVerifiedClaims(supabase);

    if (!claims?.sub) {
      return APIErrorResponse('Unauthorized', 401);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return APIErrorResponse('Invalid JSON in request body', 400);
    }

    const parsed = deleteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { id } = parsed.data;
    const found = await findOwnCharacter(
      supabase,
      id,
      claims.sub,
      'Cannot delete predefined characters',
    );
    if (found.response) return found.response;

    const { data: deleted, error: deleteError } = await deleteCustomCharacters(
      supabase,
      claims.sub,
      found.character.prompt_id,
    );

    if (deleteError || !deleted?.length) {
      captureException(deleteError ?? new Error('Character prompt not owned'), {
        extra: {
          characterId: id,
          promptId: found.character.prompt_id,
          userId: claims.sub,
        },
      });
      return APIErrorResponse('Failed to delete character', 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    captureException(error);
    return APIErrorResponse('Internal server error', 500);
  }
}
