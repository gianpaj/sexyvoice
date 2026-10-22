import { defaultSessionConfig } from '@/data/default-config';
import { ModelId } from '@/data/models';
import type { SessionConfig } from '@/data/session-config';

export type SavedCallVoice = Pick<
  Tables<'audio_references'>,
  'id' | 'name' | 'locale'
>;

// The shared cloned-audio voice row satisfies legacy voices foreign keys.
// The actual profile is identified by session_config.audioReferenceId.
export const CLONED_VOICE_ID = '420c4014-7d6d-44ef-b87d-962a3124a170';

/** Owner-checked proxy for a saved voice's reference audio. */
export const savedVoiceSampleUrl = (id: string) =>
  `/api/audio-references/${id}/sample`;

/**
 * Points a session config at a voice. Saved voices are Mistral profiles named
 * by their reference ID; built-in voices clear the reference and the model.
 */
export function withCallVoice(
  config: SessionConfig,
  voice: { name: string; savedId?: string },
): SessionConfig {
  return {
    ...config,
    audioReferenceId: voice.savedId,
    model: voice.savedId ? ModelId.MISTRAL_TTS : defaultSessionConfig.model,
    voice: voice.name,
  };
}
