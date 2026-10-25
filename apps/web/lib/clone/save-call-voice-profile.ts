import { captureException } from '@sentry/nextjs';

import { createClient } from '@/lib/supabase/server';
import type { CallCloneProvider } from './call-voice-config';

export async function saveCallVoiceProfile({
  voiceId,
  name,
  locale,
  userId,
  provider,
  deleteVoice,
}: {
  voiceId: string;
  name: string;
  locale: string;
  userId: string;
  provider: CallCloneProvider;
  deleteVoice: () => Promise<unknown>;
}) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('audio_references')
      .insert({
        name,
        locale,
        user_id: userId,
        provider,
        voice_id: voiceId,
        is_paid: true,
      })
      .select('id, name, locale, provider')
      .single();
    if (error) throw error;
    if (!data) throw new Error('Voice profile was not saved');
    return data;
  } catch (error) {
    try {
      await deleteVoice();
    } catch (cleanupError) {
      captureException(cleanupError, {
        extra: { context: 'call_voice_cleanup', provider, userId },
      });
    }
    throw error;
  }
}
