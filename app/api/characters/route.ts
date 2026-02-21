import { captureException } from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  countUserCallCharacters,
  getVoiceIdByName,
  hasUserPaid,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

const MAX_CUSTOM_CHARACTERS = 10;
const MAX_NAME_LENGTH = 50;
const MAX_PROMPT_LENGTH = 5000;

// ── Zod Schemas ──

const sessionConfigSchema = z.object({
  model: z.string().min(1, 'Model is required'),
  voice: z.string().min(1, 'Voice is required'),
  temperature: z.number().min(0.6).max(1.2),
  maxOutputTokens: z.number().nullable(),
  grokImageEnabled: z.boolean(),
});

const createOrUpdateSchema = z.object({
  id: z.string().uuid('Invalid character ID').optional(),
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(
      MAX_NAME_LENGTH,
      `Name must be ${MAX_NAME_LENGTH} characters or fewer`,
    ),
  localizedDescriptions: z.record(z.string(), z.string()).optional(),
  prompt: z
    .string({ message: 'Prompt is required' })
    .max(
      MAX_PROMPT_LENGTH,
      `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer`,
    ),
  localizedPrompts: z.record(z.string(), z.string()).optional(),
  sessionConfig: sessionConfigSchema,
  voiceName: z.string().min(1, 'Voice name is required'),
});

const deleteSchema = z.object({
  id: z.string().uuid('Character ID is required'),
});

type CreateOrUpdateBody = z.infer<typeof createOrUpdateSchema>;

/** Human-readable labels for top-level body fields. */
const fieldLabels: Record<string, string> = {
  sessionConfig: 'Session config',
  id: 'Character ID',
};

function formatZodError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Validation error';

  // For "expected X, received undefined" on a top-level key, produce a
  // friendlier "<Label> is required" message.
  if (
    issue.code === 'invalid_type' &&
    issue.message.includes('received undefined') &&
    issue.path.length === 1
  ) {
    const label = fieldLabels[String(issue.path[0])];
    if (label) return `${label} is required`;
  }

  return issue.message;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: POST handles both create and update flows
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has paid
    const isPaid = await hasUserPaid(user.id);
    if (!isPaid) {
      return NextResponse.json(
        { error: 'Custom characters require a paid account' },
        { status: 403 },
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 },
      );
    }

    const parsed = createOrUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400 },
      );
    }

    const body: CreateOrUpdateBody = parsed.data;

    // Validate voice exists in DB
    let voiceObj: { id: string; name: string; language: string; model: string };
    try {
      voiceObj = await getVoiceIdByName(body.voiceName, false);
    } catch {
      return NextResponse.json(
        { error: 'Voice no longer available' },
        { status: 400 },
      );
    }

    const isUpdate = !!body.id;

    if (isUpdate) {
      // ── UPDATE existing character ──

      // Verify character exists, is not predefined, and belongs to user
      const { data: existingCharacter, error: fetchError } = await supabase
        .from('characters')
        .select('id, prompt_id, user_id, is_public')
        .eq('id', body.id!)
        .single();

      if (fetchError || !existingCharacter) {
        return NextResponse.json(
          { error: 'Character not found' },
          { status: 404 },
        );
      }
      if (existingCharacter.is_public) {
        return NextResponse.json(
          { error: 'Cannot modify predefined characters' },
          { status: 403 },
        );
      }
      if (existingCharacter.user_id !== user.id) {
        return NextResponse.json(
          { error: 'Character not found' },
          { status: 404 },
        );
      }

      // Update prompt
      const { error: promptUpdateError } = await supabase
        .from('prompts')
        .update({
          prompt: body.prompt,
          localized_prompts: body.localizedPrompts ?? {},
        })
        .eq('id', existingCharacter.prompt_id);

      if (promptUpdateError) {
        captureException(promptUpdateError, {
          extra: { userId: user.id, characterId: body.id },
        });
        return NextResponse.json(
          { error: 'Failed to update prompt' },
          { status: 500 },
        );
      }

      // Update character
      const { data: updatedCharacter, error: charUpdateError } = await supabase
        .from('characters')
        .update({
          name: body.name,
          localized_descriptions: body.localizedDescriptions ?? {},
          voice_id: voiceObj.id,
          session_config: {
            ...body.sessionConfig,
            voice: body.voiceName,
          },
        })
        .eq('id', body.id!)
        .select(
          `
          id, name, localized_descriptions, image, session_config, sort_order, is_public,
          voice_id,
          voices ( name, sample_url ),
          prompt_id,
          prompts ( prompt, localized_prompts )
        `,
        )
        .single();

      if (charUpdateError) {
        captureException(charUpdateError, {
          extra: { userId: user.id, characterId: body.id },
        });
        return NextResponse.json(
          { error: 'Failed to update character' },
          { status: 500 },
        );
      }

      return NextResponse.json(updatedCharacter);
    }

    // ── CREATE new character ──

    // Check limit
    const currentCount = await countUserCallCharacters(user.id);
    if (currentCount >= MAX_CUSTOM_CHARACTERS) {
      return NextResponse.json(
        {
          error: `Maximum of ${MAX_CUSTOM_CHARACTERS} custom characters reached`,
        },
        { status: 400 },
      );
    }

    // Insert prompt first
    const { data: newPrompt, error: promptInsertError } = await supabase
      .from('prompts')
      .insert({
        user_id: user.id,
        type: 'call' as const,
        is_public: false,
        prompt: body.prompt,
        localized_prompts: body.localizedPrompts ?? {},
      })
      .select('id')
      .single();

    if (promptInsertError || !newPrompt) {
      captureException(promptInsertError, {
        extra: { userId: user.id },
      });
      return NextResponse.json(
        { error: 'Failed to create prompt' },
        { status: 500 },
      );
    }

    // Insert character
    const { data: newCharacter, error: charInsertError } = await supabase
      .from('characters')
      .insert({
        user_id: user.id,
        prompt_id: newPrompt.id,
        voice_id: voiceObj.id,
        is_public: false,
        name: body.name,
        localized_descriptions: body.localizedDescriptions ?? {},
        session_config: {
          ...body.sessionConfig,
          voice: body.voiceName,
        },
        sort_order: currentCount,
      })
      .select(
        `
        id, name, localized_descriptions, image, session_config, sort_order, is_public,
        voice_id,
        voices ( name, sample_url ),
        prompt_id,
        prompts ( prompt, localized_prompts )
      `,
      )
      .single();

    if (charInsertError || !newCharacter) {
      captureException(charInsertError, {
        extra: { userId: user.id, promptId: newPrompt.id },
      });
      // Clean up orphaned prompt
      await supabase.from('prompts').delete().eq('id', newPrompt.id);
      return NextResponse.json(
        { error: 'Failed to create character' },
        { status: 500 },
      );
    }

    return NextResponse.json(newCharacter, { status: 201 });
  } catch (error) {
    captureException(error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 },
      );
    }

    const parsed = deleteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400 },
      );
    }

    const { id } = parsed.data;

    // Fetch character to get prompt_id and verify ownership
    const { data: character, error: fetchError } = await supabase
      .from('characters')
      .select('id, prompt_id, user_id, is_public')
      .eq('id', id)
      .single();

    if (fetchError || !character) {
      return NextResponse.json(
        { error: 'Character not found' },
        { status: 404 },
      );
    }
    if (character.is_public) {
      return NextResponse.json(
        { error: 'Cannot delete predefined characters' },
        { status: 403 },
      );
    }
    if (character.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Character not found' },
        { status: 404 },
      );
    }

    // Delete character first
    const { error: charDeleteError } = await supabase
      .from('characters')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('is_public', false);

    if (charDeleteError) {
      captureException(charDeleteError, {
        extra: { userId: user.id, characterId: id },
      });
      return NextResponse.json(
        { error: 'Failed to delete character' },
        { status: 500 },
      );
    }

    // Delete the orphaned prompt
    const { error: promptDeleteError } = await supabase
      .from('prompts')
      .delete()
      .eq('id', character.prompt_id)
      .eq('user_id', user.id);

    if (promptDeleteError) {
      // Non-critical: log but don't fail the request
      captureException(promptDeleteError, {
        extra: {
          userId: user.id,
          characterId: id,
          promptId: character.prompt_id,
          context: 'orphaned prompt cleanup',
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    captureException(error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
