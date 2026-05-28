import type { ModelId } from './models';

export interface SessionConfig {
  maxOutputTokens: number | null;
  model: (typeof ModelId)[keyof typeof ModelId];
  temperature: number;
  voice: string; // was VoiceId, now a voice name string from DB
}
