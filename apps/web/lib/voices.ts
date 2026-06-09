export const FEATURED_VOICE_SORT_ORDER = 0;

export function isFeaturedVoice(
  voice: Pick<Tables<'voices'>, 'sort_order'>,
): boolean {
  return voice.sort_order === FEATURED_VOICE_SORT_ORDER;
}

export function getFeaturedVoice(
  voices: Tables<'voices'>[],
): Tables<'voices'> | undefined {
  return voices.find(isFeaturedVoice);
}

// ── Voice selector types & constants ─────────────────────────────────────────

export type VoiceModel = 'Gemini 2.5' | 'Gemini 3.1' | 'Grok' | 'Replicate';
export type VoiceGender = 'Female' | 'Male' | 'Neutral';

export const VOICE_MODELS: VoiceModel[] = [
  'Gemini 2.5',
  'Gemini 3.1',
  'Grok',
  'Replicate',
];

export const VOICE_GENDERS: VoiceGender[] = ['Female', 'Male', 'Neutral'];

export const MODEL_COLORS: Record<VoiceModel, string> = {
  'Gemini 2.5': '#4285f4',
  'Gemini 3.1': '#34a853',
  Grok: '#9b59b6',
  Replicate: '#e67e22',
};

/** Minimal shape expected by VoiceSelect — a subset of Tables<'voices'>. */
export type Voice = {
  id: string;
  name: string;
  description: string;
  model: VoiceModel;
  gender: VoiceGender;
  sampleUrl?: string | null;
};

/** Fallback empty list; callers always pass real voices. */
export const VOICES: Voice[] = [];

/** Maps the raw DB model string to a human-readable VoiceModel label. */
export function getDisplayModel(dbModel: string): VoiceModel {
  if (dbModel === 'gpro') return 'Gemini 2.5';
  if (dbModel === 'gpro31') return 'Gemini 3.1';
  if (dbModel === 'xai') return 'Grok';
  return 'Replicate';
}

/** Converts a Supabase voices row to the VoiceSelect Voice shape. */
export function toVoice(voice: Tables<'voices'>): Voice {
  return {
    id: voice.id,
    name: voice.name,
    description: voice.description ?? '',
    model: getDisplayModel(voice.model),
    gender: (voice.type as VoiceGender | null) ?? 'Neutral',
    sampleUrl: voice.sample_url,
  };
}
