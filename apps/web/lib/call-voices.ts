import { defaultSessionConfig } from '@/data/default-config';
import { ModelId } from '@/data/models';
import type { Preset } from '@/data/presets';
import type { SessionConfig } from '@/data/session-config';
import type { CallCloneProvider } from '@/lib/clone/call-voice-config';

export type SavedCallVoice = Pick<
  Tables<'audio_references'>,
  'id' | 'name' | 'locale' | 'provider'
>;

export function callVoiceProvider(model: string): CallCloneProvider | null {
  if (model === ModelId.MISTRAL_TTS) return 'mistral';
  if (model === ModelId.INWORLD_TTS) return 'inworld';
  return null;
}

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

/**
 * What stops a character from calling. The panel's Start call and a card's
 * Call both use this, so they never disagree.
 */
export function callReadiness(
  preset: Pick<Preset, 'isPublic' | 'sessionConfig'>,
  instructions: string,
  savedVoices: Pick<SavedCallVoice, 'id'>[],
) {
  const voiceMissing = savedVoiceMissing(preset.sessionConfig, savedVoices);
  // Public characters keep their prompts on the server.
  const personalityMissing = !(preset.isPublic || instructions.trim());
  return {
    canCall: !(voiceMissing || personalityMissing),
    personalityMissing,
    voiceMissing,
  };
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
  let model = defaultSessionConfig.model;
  if (voice.savedId) {
    model =
      voice.provider === 'inworld' ? ModelId.INWORLD_TTS : ModelId.MISTRAL_TTS;
  }
  return {
    ...config,
    audioReferenceId: voice.savedId,
    model,
    voice: voice.name,
  };
}
