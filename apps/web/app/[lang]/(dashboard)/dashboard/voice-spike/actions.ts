'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import {
  canUseCallChat,
  isLocalVoiceChatEnvironment,
} from '@/lib/voice-chat/access';
import { createCharacterConversation } from '@/lib/voice-chat/conversations';

const selection = z.union([z.uuid(), z.literal('default')]);

export async function startCharacterConversation(
  locale: Locale,
  _previous: boolean,
  form: FormData,
): Promise<boolean> {
  if (!(isLocalVoiceChatEnvironment() && i18n.locales.includes(locale)))
    return false;
  const characterId = selection.safeParse(form.get('character'));
  if (!characterId.success) return false;
  const claims = await getVerifiedClaims(await createClient());
  const userId = claims?.sub;
  if (!(userId && canUseCallChat(userId))) return false;

  const page = `/${locale}/dashboard/voice-spike`;
  if (characterId.data === 'default') redirect(page);
  const threadId = await createCharacterConversation(userId, {
    characterId: characterId.data,
    language: locale,
  });
  if (!threadId) return false;
  redirect(`${page}?conversation=${threadId}`);
}
