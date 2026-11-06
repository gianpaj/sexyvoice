import { Mistral } from '@mistralai/mistralai';

import { isWav } from '@/lib/audio';
import { getProviderStatusCode } from '@/lib/provider-errors';
import { CALL_VOICE_SAMPLE_TEXT } from './call-voice-sample';
import { CLONE_PROVIDERS } from './providers';
import { saveCallVoiceProfile } from './save-call-voice-profile';

let client: Mistral | undefined;

function getMistralClient() {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY is not configured');
  client ??= new Mistral({ apiKey });
  return client;
}

/** Speaks `text` with a saved voice or a reference clip; returns WAV audio. */
export async function synthesizeMistralSpeech(
  text: string,
  voice: { referenceAudio: Buffer } | { voiceId: string },
): Promise<Buffer> {
  const { audioData } = await getMistralClient().audio.speech.complete({
    input: text,
    model: CLONE_PROVIDERS.mistral.model,
    ...('voiceId' in voice
      ? { voiceId: voice.voiceId }
      : { refAudio: voice.referenceAudio.toString('base64') }),
    responseFormat: 'wav',
    stream: false,
  });
  if (!audioData) {
    throw new Error('Mistral Voxtral response did not include audio data');
  }
  const audio =
    typeof audioData === 'string'
      ? Buffer.from(audioData, 'base64')
      : Buffer.from(audioData);
  if (!isWav(audio)) {
    throw new Error('Mistral Voxtral response did not return a valid WAV file');
  }
  return audio;
}

/** The voice's stored sample, as WAV audio. */
export async function getMistralVoiceSample(voiceId: string): Promise<Buffer> {
  return Buffer.from(
    await getMistralClient().audio.voices.getSampleAudio({ voiceId }),
    'base64',
  );
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
    generateSample: () =>
      synthesizeMistralSpeech(CALL_VOICE_SAMPLE_TEXT, { voiceId: voice.id }),
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
