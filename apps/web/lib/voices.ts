const FEATURED_VOICE_SORT_ORDER = 0;

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

export type VoiceModel =
  | 'Gemini 2.5'
  | 'Gemini 3.1'
  | 'Gemini 3.8'
  | 'Grok'
  | 'Replicate';
export type VoiceGender = 'Female' | 'Male' | 'Neutral';

export const VOICE_MODELS: VoiceModel[] = [
  'Gemini 3.8',
  'Gemini 3.1',
  'Gemini 2.5',
  'Grok',
  'Replicate',
];

export const VOICE_GENDERS: VoiceGender[] = ['Female', 'Male', 'Neutral'];

export const MODEL_COLORS: Record<VoiceModel, string> = {
  'Gemini 2.5': '#F163A8',
  'Gemini 3.1': '#B898EC',
  'Gemini 3.8': '#72B5E9',
  Grok: '#65B88F',
  Replicate: '#EEBB2D',
};

/** Minimal shape expected by VoiceSelect — a subset of Tables<'voices'>. */
export interface Voice {
  description: string;
  gender: VoiceGender;
  id: string;
  model: VoiceModel;
  name: string;
  sampleUrl?: string | null;
}

/** Fallback empty list; callers always pass real voices. */
export const VOICES: Voice[] = [];

/** Maps the raw DB model string to a human-readable VoiceModel label. */
export function getDisplayModel(dbModel: string): VoiceModel {
  if (dbModel === 'gpro') return 'Gemini 2.5';
  if (dbModel === 'gpro38') return 'Gemini 3.8';
  if (dbModel === 'gpro31') return 'Gemini 3.1';
  if (dbModel === 'xai') return 'Grok';
  return 'Replicate';
}

/** Converts a Supabase voices row to the VoiceSelect Voice shape. */
export function toVoice(voice: Tables<'voices'>): Voice {
  return {
    description: voice.description ?? '',
    gender: (voice.type as VoiceGender | null) ?? 'Neutral',
    id: voice.id,
    model: getDisplayModel(voice.model),
    name: voice.name,
    sampleUrl: voice.sample_url,
  };
}
