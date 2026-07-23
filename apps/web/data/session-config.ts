import type { ModelId } from './models';

export interface SessionConfig {
  // audio_references row id, used when model is 'inworld-realtime'
  audioReferenceId?: string | null;
  maxOutputTokens: number | null;
  model: (typeof ModelId)[keyof typeof ModelId];
  temperature: number;
  voice: string; // was VoiceId, now a voice name string from DB
}
