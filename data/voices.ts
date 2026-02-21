// biome-ignore lint/style/noEnum: grand
export enum VoiceId {
  ARA = 'Ara',
  REX = 'Rex',
  SAL = 'Sal',
  EVE = 'Eve',
  LEO = 'Leo',
  // Voices not yet available - uncomment when supported:
  // ANI = "Ani",
  // MIKA = "Mika",
  // VALENTINE = "Valentine",
  // GORK = "Gork",
}

// Mirrors the shared DB enum `feature_type` (used by voices.feature and prompts.type)
export type FeatureType = 'tts' | 'call';

// DB voice row shape (returned by SSR queries)
export interface DBVoice {
  id: string; // UUID
  name: string; // "Ara", "Eve", etc.
  type: string | null; // "Female", "Male", "Neutral"
  description: string | null;
  sample_url: string | null;
  feature: FeatureType; // Shared DB enum: "call" | "tts"
  model: string;
  language: string;
  sort_order: number;
}
