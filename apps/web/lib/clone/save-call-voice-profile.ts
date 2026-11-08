import { randomUUID } from 'node:crypto';
import { captureException } from '@sentry/nextjs';

import { deleteFileFromR2, uploadFileToR2 } from '@/lib/storage/upload';
import { createAdminClient } from '@/lib/supabase/admin';
import { insertUsageEvent } from '@/lib/supabase/queries';
import type { CallCloneProvider } from './call-voice-config';
import {
  CALL_VOICE_SAMPLE_TEXT,
  type CallVoiceSampleFormat,
  createCallVoiceSampleKey,
  getCallVoiceSampleContentType,
} from './call-voice-sample';

/** The provider speaking `CALL_VOICE_SAMPLE_TEXT` in the new voice. */
interface CallVoiceSample {
  /** What the provider charges for the sample. */
  dollarCost: number;
  format: CallVoiceSampleFormat;
  generate: () => Promise<Buffer>;
  model: string;
}

export async function saveCallVoiceProfile({
  voiceId,
  name,
  locale,
  userId,
  provider,
  sample,
  deleteVoice,
}: {
  voiceId: string;
  name: string;
  locale: string;
  userId: string;
  provider: CallCloneProvider;
  sample: CallVoiceSample;
  deleteVoice: () => Promise<unknown>;
}) {
  const id = randomUUID();
  let sampleKey: string | undefined;
  try {
    const audio = await sample.generate();
    // Saving is free, so the platform pays for the sample. The zero-credit
    // event keeps that cost in usage reports. It stays when a later step
    // fails, so `sourceId` can name a profile that was never saved.
    await insertUsageEvent({
      creditsUsed: 0,
      dollarAmount: sample.dollarCost,
      inputChars: CALL_VOICE_SAMPLE_TEXT.length,
      metadata: {
        operation: 'saved_voice_sample',
        provider,
        voiceName: name,
      },
      model: sample.model,
      quantity: CALL_VOICE_SAMPLE_TEXT.length,
      sourceId: id,
      sourceType: 'voice_cloning',
      unit: 'chars',
      userId,
    });
    if (!audio.length) throw new Error('Voice sample is empty');
    sampleKey = createCallVoiceSampleKey(id, sample.format);
    const sampleUrl = await uploadFileToR2(
      sampleKey,
      audio,
      getCallVoiceSampleContentType(sampleKey),
    );
    // Users cannot write saved voices: provider and voice_id name a voice
    // the server deletes and speaks with its own API key.
    const { data, error } = await createAdminClient()
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
