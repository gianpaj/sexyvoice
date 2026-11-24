import { hasUserPaid } from '@/lib/supabase/queries';
import { listVoiceChatCharacters } from '@/lib/voice-chat/characters';
import { createChatDb } from '@/lib/voice-chat/chat';

export async function createCharacterConversation(
  userId: string,
  {
    characterId,
    language,
    scene,
  }: {
    characterId: string;
    language: string;
    scene?: string | null;
  },
) {
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
        ...(scene !== undefined && { scene_instructions: scene ?? '' }),
      })
      .select('id')
      .single();
    return error ? null : (data?.id ?? null);
  } catch {
    return null;
  }
}
