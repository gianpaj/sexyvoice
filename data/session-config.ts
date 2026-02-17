import type { ModelId } from './models';

export interface SessionConfig {
  model: (typeof ModelId)[keyof typeof ModelId];
  voice: string; // was VoiceId, now a voice name string from DB
  temperature: number;
  maxOutputTokens: number | null;
  grokImageEnabled: boolean;
}
