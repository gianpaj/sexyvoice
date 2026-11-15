import { getTtsModelId, TTS_MODEL_IDS } from '@/lib/tts/models';

const FEATURED_VOICE_SORT_ORDER = 0;

function isFeaturedVoice(voice: Pick<Tables<'voices'>, 'sort_order'>): boolean {
  return voice.sort_order === FEATURED_VOICE_SORT_ORDER;
}

type SortableVoice = Pick<Tables<'voices'>, 'model' | 'name' | 'sort_order'>;

function catalogOrder(dbModel: string): number {
  const id = getTtsModelId(dbModel);
  return id ? TTS_MODEL_IDS.indexOf(id) : TTS_MODEL_IDS.length;
}

/**
 * Voice order: featured first, then by name, then by catalog model. The
 * generate page sorts its voice list with this before rendering the picker or
 * choosing the default voice.
 */
export function compareVoices(a: SortableVoice, b: SortableVoice): number {
  return (
    a.sort_order - b.sort_order ||
    a.name.localeCompare(b.name) ||
    catalogOrder(a.model) - catalogOrder(b.model)
  );
}

/** First featured voice, given a list already sorted with compareVoices. */
export function getFeaturedVoice(
  voices: Tables<'voices'>[],
): Tables<'voices'> | undefined {
  return voices.find(isFeaturedVoice);
}

export type VoiceGender = 'Female' | 'Male' | 'Neutral';

export const VOICE_GENDERS: VoiceGender[] = ['Female', 'Male', 'Neutral'];
