import { describe, expect, it } from 'vitest';

import { GEMINI_38_AUDIO_TAGS, getEmotionTags } from '@/lib/ai';

const ORPHEUS =
  'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f';

describe('getEmotionTags', () => {
  it('returns the Gemini 3.8 tag set for every gpro38 language', () => {
    expect(getEmotionTags({ language: 'es-ES 🇪🇸', model: 'gpro38' })).toBe(
      GEMINI_38_AUDIO_TAGS,
    );
    expect(getEmotionTags({ language: 'multiple', model: 'gpro38' })).toBe(
      GEMINI_38_AUDIO_TAGS,
    );
    expect(GEMINI_38_AUDIO_TAGS).toContain('<laughter>');
  });

  it('returns Orpheus tags by language', () => {
    expect(getEmotionTags({ language: 'es-ES 🇪🇸', model: ORPHEUS })).toContain(
      '<resoplido>',
    );
    expect(getEmotionTags({ language: 'en-US 🇺🇸', model: ORPHEUS })).toContain(
      '<sniffle>',
    );
  });

  it('returns nothing for models without inline tags', () => {
    expect(getEmotionTags({ language: 'es-ES 🇪🇸', model: 'gpro' })).toBe(
      undefined,
    );
    expect(getEmotionTags({ language: 'es-ES 🇪🇸', model: 'gpro31' })).toBe(
      undefined,
    );
    expect(getEmotionTags({ language: 'es-ES 🇪🇸', model: 'xai' })).toBe(
      undefined,
    );
  });
});
