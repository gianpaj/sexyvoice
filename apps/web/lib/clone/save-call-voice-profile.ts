import { randomUUID } from 'node:crypto';
import { captureException } from '@sentry/nextjs';

import { deleteFileFromR2, uploadFileToR2 } from '@/lib/storage/upload';
import { createClient } from '@/lib/supabase/server';
import type { CallCloneProvider } from './call-voice-config';
import { createCallVoiceSampleKey } from './call-voice-sample';

export async function saveCallVoiceProfile({
  voiceId,
  name,
  locale,
  userId,
  provider,
  deleteVoice,
  generateSample,
}: {
  voiceId: string;
  name: string;
  locale: string;
  userId: string;
  provider: CallCloneProvider;
  deleteVoice: () => Promise<unknown>;
  generateSample: () => Promise<Buffer>;
}) {
  const id = randomUUID();
  let sampleKey: string | undefined;
  try {
    const sample = await generateSample();
    if (!sample.length) throw new Error('Voice sample is empty');
    sampleKey = createCallVoiceSampleKey(id);
    const sampleUrl = await uploadFileToR2(sampleKey, sample, 'audio/wav');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('audio_references')
      .insert({
        id,
        name,
        locale,
        user_id: userId,
        provider,
        voice_id: voiceId,
        is_paid: true,
        sample_url: sampleUrl,
      })
      .select('id, name, locale, provider')
      .single();
    if (error) throw error;
    if (!data) throw new Error('Voice profile was not saved');
    return data;
  } catch (error) {
    if (sampleKey) {
      try {
        await deleteFileFromR2(sampleKey);
      } catch (cleanupError) {
        captureException(cleanupError, {
          extra: { context: 'call_voice_sample_cleanup', provider, userId },
        });
      }
    }
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
