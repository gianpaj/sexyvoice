import { z } from 'zod';

import { CALL_VOICE_SAMPLE_TEXT } from './call-voice-sample';
import { resolveBaseCloneLocale } from './constants';
import { saveCallVoiceProfile } from './save-call-voice-profile';

const cloneResponse = z.object({
  voice: z.object({ voiceId: z.string().min(1) }),
});
const previewResponse = z.object({ audioContent: z.string().min(1) });
// Proto3 JSON omits zero, and may encode counts as strings.
const listVoicesResponse = z.object({
  totalSize: z.coerce.number().int().nonnegative().default(0),
});

/** Inworld names Norwegian Bokmål `nb`; plain `no` is an unevaluated tier. */
function toInworldLanguage(locale: string) {
  const language = resolveBaseCloneLocale(locale);
  return language === 'no' ? 'nb' : language;
}

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
  const response = await inworldRequest('/voices/v1/voices:clone', {
    method: 'POST',
    body: JSON.stringify({
      displayName: name,
      languageCode: toInworldLanguage(locale),
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
    generateSample: () =>
      synthesizeInworldSpeech(voice.voiceId, CALL_VOICE_SAMPLE_TEXT),
    deleteVoice: () => deleteInworldVoice(voice.voiceId),
  });
}

export const INWORLD_TTS_MODEL = 'inworld-tts-2';
/** Custom voices allowed in the workspace on the Builder plan. */
export const INWORLD_WORKSPACE_VOICE_LIMIT = 3000;

/** Custom voices in the workspace: clones and designs, not system voices. */
export async function countInworldWorkspaceVoices() {
  const query = new URLSearchParams({
    filter: 'owned = "true"',
    pageSize: '1',
  });
  const response = await inworldRequest(`/voices/v1/voices?${query}`);
  return listVoicesResponse.parse(await response.json()).totalSize;
}

/**
 * Speaks `text` in a workspace voice and returns a WAV file. Without
 * `locale`, Inworld detects the language from the text. A voice can speak
 * languages other than the one it was cloned in, without its accent.
 */
export async function synthesizeInworldSpeech(
  voiceId: string,
  text: string,
  locale?: string,
) {
  const speech = await inworldRequest('/tts/v1/voice', {
    method: 'POST',
    body: JSON.stringify({
      text,
      voiceId,
      ...(locale && { language: toInworldLanguage(locale) }),
      modelId: INWORLD_TTS_MODEL,
      audioConfig: { audioEncoding: 'LINEAR16' },
    }),
  });
  const { audioContent } = previewResponse.parse(await speech.json());
  return Buffer.from(audioContent, 'base64');
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
