/**
 * R2 folders for generated audio. Free-user folders are the ones the R2
 * lifecycle rules and the orphan cleanup may delete; the dashboard and the
 * external API use the same names in their own buckets.
 */
export const AUDIO_FOLDERS = {
  clone: { free: 'cloned-audio-free', paid: 'cloned-audio' },
  speech: { free: 'generated-audio-free', paid: 'generated-audio' },
} as const;

export type AudioKind = keyof typeof AUDIO_FOLDERS;

export function audioFolder(kind: AudioKind, isPaidUser: boolean): string {
  return isPaidUser ? AUDIO_FOLDERS[kind].paid : AUDIO_FOLDERS[kind].free;
}
