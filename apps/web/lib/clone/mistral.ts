import { Mistral } from '@mistralai/mistralai';

import { getProviderStatusCode } from '@/lib/provider-errors';
import { CALL_VOICE_SAMPLE_TEXT } from './call-voice-sample';
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
    generateSample: async () => {
      const speech = await mistral.audio.speech.complete({
        model: 'voxtral-mini-tts-3-0',
        input: CALL_VOICE_SAMPLE_TEXT,
        voiceId: voice.id,
        responseFormat: 'wav',
        stream: false,
      });
      if (!speech.audioData) throw new Error('Voice sample is missing');
      return typeof speech.audioData === 'string'
        ? Buffer.from(speech.audioData, 'base64')
        : Buffer.from(speech.audioData);
    },
    deleteVoice: () => deleteMistralVoice(voice.id),
  });
}

export async function deleteMistralVoice(voiceId: string) {
  try {
    await getMistralClient().audio.voices.delete({ voiceId });
  } catch (error) {
    if (getProviderStatusCode(error) !== 404) throw error;
  }
}
