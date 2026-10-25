import { z } from 'zod';

import { CALL_VOICE_SAMPLE_TEXT } from './call-voice-sample';
import { resolveBaseCloneLocale } from './constants';
import { saveCallVoiceProfile } from './save-call-voice-profile';

const cloneResponse = z.object({
  voice: z.object({ voiceId: z.string().min(1) }),
});
const previewResponse = z.object({ audioContent: z.string().min(1) });

async function inworldRequest(path: string, init?: RequestInit) {
  const apiKey = process.env.INWORLD_API_KEY;
  if (!apiKey) throw new Error('INWORLD_API_KEY is not configured');
  const response = await fetch(`https://api.inworld.ai${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(60_000),
  });
  if (
    !(response.ok || (init?.method === 'DELETE' && response.status === 404))
  ) {
    // Provider bodies can contain reference audio or credentials; keep them out of logs.
    throw new Error(`Inworld voice request failed (${response.status})`);
  }
  return response;
}

export async function saveInworldVoice(
  audio: Buffer,
  name: string,
  locale: string,
  userId: string,
) {
  const language = resolveBaseCloneLocale(locale);
  const response = await inworldRequest('/voices/v1/voices:clone', {
    method: 'POST',
    body: JSON.stringify({
      displayName: name,
      languageCode: language === 'no' ? 'nb' : language,
      voiceSamples: [{ audioData: audio.toString('base64') }],
    }),
  });
  const { voice } = cloneResponse.parse(await response.json());
  return saveCallVoiceProfile({
    voiceId: voice.voiceId,
    name,
    locale,
    userId,
    provider: 'inworld',
    generateSample: async () => {
      const speech = await inworldRequest('/tts/v1/voice', {
        method: 'POST',
        body: JSON.stringify({
          text: CALL_VOICE_SAMPLE_TEXT,
          voiceId: voice.voiceId,
          modelId: 'inworld-tts-2',
          audioConfig: { audioEncoding: 'LINEAR16' },
        }),
      });
      const { audioContent } = previewResponse.parse(await speech.json());
      return Buffer.from(audioContent, 'base64');
    },
    deleteVoice: () => deleteInworldVoice(voice.voiceId),
  });
}

export async function deleteInworldVoice(voiceId: string) {
  await inworldRequest(`/voices/v1/voices/${encodeURIComponent(voiceId)}`, {
    method: 'DELETE',
  });
}

export async function getInworldVoiceSample(voiceId: string) {
  const query = new URLSearchParams({
    voice_id: voiceId,
    model_id: 'inworld-tts-2',
  });
  const response = await inworldRequest(`/tts/v1/voice:preview?${query}`);
  const { audioContent } = previewResponse.parse(await response.json());
  return Buffer.from(audioContent, 'base64');
}
