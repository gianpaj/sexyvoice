import { Mistral } from '@mistralai/mistralai';

import { saveCallVoiceProfile } from './save-call-voice-profile';

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
  return saveCallVoiceProfile({
    voiceId: voice.id,
    name,
    locale,
    userId,
    provider: 'mistral',
    deleteVoice: () => mistral.audio.voices.delete({ voiceId: voice.id }),
  });
}
