import { generateHash } from '@/lib/audio';
import { audioFolder } from '@/lib/storage/layout';
import type { TtsProvider } from './models';

interface DashboardSpeechKeyInput {
  isPaidUser: boolean;
  /** Grok speech language; omit for automatic detection. */
  language?: string;
  provider: TtsProvider;
  /** Provider model that renders the audio. */
  runtimeModel: string;
  seed?: number;
  speed?: number;
  /** Delivery style, for models that honour it. */
  style?: string;
  temperature?: number;
  text: string;
  voiceName: string;
}

/**
 * Dashboard speech is cached in Redis under its R2 key, which is also the
 * `audio_files.storage_key` that history deletes evict. Each setting the
 * provider receives joins the hash only when set, so default requests keep
 * the original key and existing cache entries.
 */
export async function dashboardSpeechKey({
  isPaidUser,
  language,
  provider,
  runtimeModel,
  seed,
  speed,
  style,
  temperature,
  text,
  voiceName,
}: DashboardSpeechKeyInput): Promise<string> {
  let input =
    seed === undefined
      ? `${text}-${voiceName}-${runtimeModel}`
      : `${text}-${voiceName}-${runtimeModel}-${seed}`;
  if (temperature !== undefined) {
    input += `-temp:${temperature}`;
  }
  if (speed !== undefined) {
    input += `-speed:${speed}`;
  }
  if (style !== undefined) {
    input += `-style:${JSON.stringify(style)}`;
  }
  if (language !== undefined) {
    input += `-lang:${language}`;
  }
  const hash = await generateHash(input);
  const extension = provider === 'grok' ? 'mp3' : 'wav';
  return `${audioFolder('speech', isPaidUser)}/${voiceName}-${hash}.${extension}`;
}
