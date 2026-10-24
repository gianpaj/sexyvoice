import { Mistral } from '@mistralai/mistralai';
import { captureException } from '@sentry/nextjs';

import { createClient } from '@/lib/supabase/server';

let client: Mistral | undefined;

export function getMistralClient() {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY is not configured');
  client ??= new Mistral({ apiKey });
  return client;
}

export async function saveMistralVoice(
  audio: Buffer,
  name: string,
  locale: string,
  userId: string,
) {
  const mistral = getMistralClient();
  const voice = await mistral.audio.voices.create({
    name,
    languages: [locale],
    sampleAudio: audio.toString('base64'),
    sampleFilename: 'reference.wav',
  });
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('audio_references')
      .insert({
        name,
        locale,
        user_id: userId,
        provider: 'mistral',
        voice_id: voice.id,
        is_paid: true,
      })
      .select('id, name, locale')
      .single();
    if (error) throw error;
    if (!data) throw new Error('Voice profile was not saved');
    return data;
  } catch (error) {
    try {
      await mistral.audio.voices.delete({ voiceId: voice.id });
    } catch (cleanupError) {
      captureException(cleanupError, {
        extra: { context: 'mistral_voice_cleanup', userId },
      });
    }
    throw error;
  }
}
