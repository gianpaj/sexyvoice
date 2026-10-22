export type SavedCallVoice = Pick<
  Tables<'audio_references'>,
  'id' | 'name' | 'locale'
>;

// The shared cloned-audio voice row satisfies legacy voices foreign keys.
// The actual profile is identified by session_config.audioReferenceId.
export const CLONED_VOICE_ID = '420c4014-7d6d-44ef-b87d-962a3124a170';
