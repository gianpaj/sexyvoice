import type { CallModelId } from '@/lib/calls/models';

export interface SessionConfig {
  audioReferenceId?: string;
  maxOutputTokens: number | null;
  model: CallModelId;
  temperature: number;
  voice: string; // was VoiceId, now a voice name string from DB
}
