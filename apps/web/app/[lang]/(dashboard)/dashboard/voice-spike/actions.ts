'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { listSpikeCharacters } from '@/lib/voice-spike/characters';
import { createChatDb } from '@/lib/voice-spike/chat';
import {
  isLocalSpikeEnvironment,
  isSpikeAllowed,
} from '@/lib/voice-spike/protocol';

const selection = z.union([z.uuid(), z.literal('demo')]);

export async function startSpikeConversation(
  locale: Locale,
  _previous: boolean,
  form: FormData,
): Promise<boolean> {
  if (!(isLocalSpikeEnvironment() && i18n.locales.includes(locale)))
    return false;
  const characterId = selection.safeParse(form.get('character'));
  if (!characterId.success) return false;
  const claims = await getVerifiedClaims(await createClient());
  const userId = claims?.sub;
  if (
    !(
      userId &&
      isSpikeAllowed(
        userId,
        process.env.VOICE_SPIKE_USER_IDS,
        process.env.VERCEL_ENV,
        process.env.NODE_ENV,
      )
    )
  )
    return false;

  const page = `/${locale}/dashboard/voice-spike`;
  if (characterId.data === 'demo') redirect(page);
  let threadId: string;
  try {
    if (!(await hasUserPaid(userId))) return false;
    const character = (await listSpikeCharacters(userId)).find(
      ({ id }) => id === characterId.data,
    );
    if (!character) return false;
    const { data, error } = await createChatDb()
      .from('conversations')
      .insert({
        user_id: userId,
        character_id: character.id,
        character_name: character.name,
        language: locale,
      })
      .select('id')
      .single();
    if (error || !data) return false;
    threadId = data.id;
  } catch {
    return false;
  }
  redirect(`${page}?conversation=${threadId}`);
}
