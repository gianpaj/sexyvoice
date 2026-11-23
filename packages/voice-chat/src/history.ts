import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const roleSchema = z.enum(['user', 'assistant']);
export const historySchema = z.array(
  z.object({
    id: z.string(),
    role: roleSchema,
    parts: z.array(z.object({ type: z.literal('text'), content: z.string() })),
    status: z.enum(['completed', 'interrupted']),
  }),
);
export const threadSchema = z.object({
  character_id: z.uuid().nullable(),
  character_name: z.string(),
  uses_default_character: z.boolean(),
  language: z.string(),
  scene_instructions: z.string(),
});

export const conversationContextSchema = z.array(
  z.object({
    id: z.string(),
    role: roleSchema,
    content: z.string(),
    interrupted: z.boolean(),
  }),
);

const characterSchema = z.object({
  name: z.string(),
  is_public: z.boolean(),
  user_id: z.string().nullable(),
  session_config: z.unknown(),
  prompts: z
    .object({
      prompt: z.string(),
      localized_prompts: z.record(z.string(), z.string()).nullable(),
    })
    .nullable(),
});

export async function loadThreadCharacter(
  db: SupabaseClient,
  userId: string,
  characterId: string,
  language: string,
) {
  const { data, error } = await db
    .from('characters')
    .select(
      'name, is_public, user_id, session_config, prompts(prompt, localized_prompts)',
    )
    .eq('id', characterId)
    .maybeSingle();
  if (error) throw new Error('Could not load character');
  if (!data) return null;
  const character = characterSchema.parse(data);
  if (!character.is_public && character.user_id !== userId) return null;
  const instructions =
    character.prompts?.localized_prompts?.[language]?.trim() ||
    character.prompts?.prompt.trim();
  return instructions
    ? {
        name: character.name,
        isPublic: character.is_public,
        sessionConfig: character.session_config,
        instructions,
      }
    : null;
}

export function replyInstructions(
  thread: z.infer<typeof threadSchema>,
  {
    character,
    memory,
    recalled,
  }: {
    character?: string;
    memory?: string;
    recalled?: string;
  } = {},
) {
  return [
    thread.uses_default_character
      ? 'You are a friendly conversational test assistant.'
      : `You are ${thread.character_name}. Conversation language: ${thread.language}.`,
    character,
    'Reply briefly. Treat typed and spoken messages as part of one conversation.',
    thread.scene_instructions,
    memory,
    recalled,
  ].filter((value): value is string => Boolean(value));
}
