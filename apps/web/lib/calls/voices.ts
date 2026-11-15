import type { SessionConfig } from '@/lib/calls/characters';
import { callModelFor } from '@/lib/calls/models';
import { savedVoiceProvider } from '@/lib/clone/call-voice-config';

/** A built-in call voice from the catalog. */
export type CallVoice = Pick<
  Tables<'voices'>,
  'description' | 'id' | 'name' | 'sample_url' | 'type'
>;

export type SavedCallVoice = Pick<
  Tables<'audio_references'>,
  'id' | 'name' | 'locale' | 'provider'
>;

/** Names of the characters that use each saved voice, by voice ID. */
export function savedVoiceUsers(
  characters: { name: string; session_config: unknown }[],
) {
  const users: Record<string, string[]> = {};
  for (const { name, session_config } of characters) {
    const id = (session_config as { audioReferenceId?: unknown } | null)
      ?.audioReferenceId;
    if (typeof id === 'string') {
      users[id] ??= [];
      users[id].push(name);
    }
  }
  return users;
}

// The shared cloned-audio voice row satisfies legacy voices foreign keys.
// The actual profile is identified by session_config.audioReferenceId.
export const CLONED_VOICE_ID = '420c4014-7d6d-44ef-b87d-962a3124a170';

/**
 * A deleted saved voice leaves a character without one until it is edited,
 * so it cannot call.
 */
export function savedVoiceMissing(
  config: Pick<SessionConfig, 'audioReferenceId'>,
  savedVoices: Pick<SavedCallVoice, 'id'>[],
) {
  return (
    Boolean(config.audioReferenceId) &&
    !savedVoices.some(({ id }) => id === config.audioReferenceId)
  );
}

/** Owner-checked proxy for a saved voice's reference audio. */
export const savedVoiceSampleUrl = (id: string) =>
  `/api/audio-references/${id}/sample`;

/**
 * Points a session config at a voice. Saved voices are provider profiles named
 * by their reference ID; built-in voices clear the reference and the model.
 */
export function withCallVoice(
  config: SessionConfig,
  voice: { name: string; savedId?: string; provider?: string },
): SessionConfig {
  return {
    ...config,
    audioReferenceId: voice.savedId,
    model: callModelFor(
      voice.savedId ? savedVoiceProvider(voice.provider ?? '') : undefined,
    ),
    voice: voice.name,
  };
}
