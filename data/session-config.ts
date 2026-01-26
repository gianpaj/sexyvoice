import type { VoiceId } from '@/data/voices';
import type { ModelId } from './models';

export interface SessionConfig {
  model: (typeof ModelId)[keyof typeof ModelId];
  voice: VoiceId;
  temperature: number;
  maxOutputTokens: number | null;
  grokImageEnabled: boolean;
}
