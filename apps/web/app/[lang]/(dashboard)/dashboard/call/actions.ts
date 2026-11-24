'use server';

import { z } from 'zod';

import { callTokenPlaygroundStateSchema } from '@/lib/call-token-schema';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { canUseCallChat } from '@/lib/voice-chat/access';
import { listVoiceChatCharacters } from '@/lib/voice-chat/characters';
import { createChatDb } from '@/lib/voice-chat/chat';

const selection = z.object({
  characterId: z.uuid(),
  language: callTokenPlaygroundStateSchema.shape.language.unwrap(),
  scene: z.string().trim().max(8000).nullable(),
});

export async function openCallConversation(input: z.input<typeof selection>) {
  const parsed = selection.safeParse(input);
  if (!parsed.success) return null;
  const { characterId, language, scene } = parsed.data;
  const claims = await getVerifiedClaims(await createClient());
  const userId = claims?.sub;
  if (!(userId && canUseCallChat(userId))) return null;
  try {
    if (!(await hasUserPaid(userId))) return null;
    const character = (await listVoiceChatCharacters(userId)).find(
      ({ id }) => id === characterId,
    );
    if (!character) return null;
    const { data, error } = await createChatDb()
      .from('conversations')
      .insert({
        user_id: userId,
        character_id: character.id,
        character_name: character.name,
        language,
        scene_instructions: scene ?? '',
      })
      .select('id')
      .single();
    return error ? null : (data?.id ?? null);
  } catch {
    return null;
  }
}
