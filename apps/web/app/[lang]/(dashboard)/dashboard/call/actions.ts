'use server';

import { z } from 'zod';

import { callTokenPlaygroundStateSchema } from '@/lib/call-token-schema';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { canUseCallChat } from '@/lib/voice-chat/access';
import { createCharacterConversation } from '@/lib/voice-chat/conversations';

const selection = z.object({
  characterId: z.uuid(),
  language: callTokenPlaygroundStateSchema.shape.language.unwrap(),
  scene: z.string().trim().max(8000).nullable(),
});

export async function openCallConversation(input: {
  characterId: string;
  language: string;
  scene: string | null;
}) {
  const parsed = selection.safeParse(input);
  if (!parsed.success) return null;
  const { characterId, language, scene } = parsed.data;
  const claims = await getVerifiedClaims(await createClient());
  const userId = claims?.sub;
  if (!(userId && canUseCallChat(userId))) return null;
  return createCharacterConversation(userId, { characterId, language, scene });
}
