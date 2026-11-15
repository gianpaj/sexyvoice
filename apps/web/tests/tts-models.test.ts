import { describe, expect, it } from 'vitest';

import {
  creditsFromTokens,
  GEMINI_38_AUDIO_TAGS,
  getTtsModel,
  isActiveTtsModel,
  TTS_MODELS,
} from '@/lib/tts/models';

const ORPHEUS =
  'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f';

const orpheus = TTS_MODELS.orpheus;
const grok = TTS_MODELS.xai;
const gemini = TTS_MODELS.gpro38;

describe('TTS model lookup', () => {
  it('resolves stored voice models to their catalog entry', () => {
    expect(getTtsModel('gpro38')?.provider).toBe('gemini');
    expect(getTtsModel('xai')?.provider).toBe('grok');
    expect(getTtsModel(ORPHEUS)?.provider).toBe('replicate');
  });

  it('treats retired and unknown models as unavailable', () => {
    for (const model of ['gpro', 'gpro31', 'some-owner/some-model']) {
      expect(getTtsModel(model)).toBeUndefined();
      expect(isActiveTtsModel(model)).toBe(false);
    }
    expect(getTtsModel(undefined)).toBeUndefined();
  });
});

describe('reservation estimates', () => {
  it('reserves 4 credits per estimated speech second unit for Orpheus', () => {
    expect(
      orpheus.estimateCredits(
        'This is a longer sentence that should take more time to speak',
        'tara',
      ),
    ).toBe(288); // 12 words
    expect(orpheus.estimateCredits('Hello     world    test', 'tara')).toBe(72);
    expect(orpheus.estimateCredits('   Hello world   ', 'tara')).toBe(48);
    expect(orpheus.estimateCredits('Hello\nworld\ntest', 'tara')).toBe(72);
    expect(orpheus.estimateCredits('', 'tara')).toBe(0);
  });

  it('doubles the Orpheus rate for Spanish and Italian voices', () => {
    expect(orpheus.estimateCredits('Hello world', 'javi')).toBe(96);
  });

  it('counts emotion tags as words', () => {
    const text =
      'Oh my, <pants> <moaning> oh <gasp> <moaning> oh oh <breathing> <moaning> oh oh oh <sigh> <moaning> wow. that was hot';
    expect(orpheus.estimateCredits(text, 'tara')).toBe(480); // 20 words
  });

  it('bills Grok in 100-character buckets, tags included', () => {
    expect(grok.estimateCredits('', 'eve')).toBe(0);
    expect(grok.estimateCredits('Hello world', 'eve')).toBe(100);
    expect(grok.estimateCredits('a'.repeat(101), 'eve')).toBe(200);
    expect(grok.estimateCredits('a'.repeat(250), 'eve')).toBe(300);
    expect(grok.estimateCredits('<fast>Hello</fast> [laugh]', 'eve')).toBe(100);
  });

  it('uses the Gemini 3.8 word estimate', () => {
    expect(gemini.estimateCredits('Hello world', 'kore')).toBe(14);
  });

  it('charges token-metered generations 1.1 credits a token', () => {
    expect(creditsFromTokens(100)).toBe(Math.ceil(100 * 1.1));
    expect(creditsFromTokens(-50)).toBe(0);
  });
});

describe('inline tags', () => {
  it('returns the Gemini 3.8 tag set for every language', () => {
    expect(gemini.inlineTags('es-ES 🇪🇸')).toBe(GEMINI_38_AUDIO_TAGS);
    expect(gemini.inlineTags('multiple')).toBe(GEMINI_38_AUDIO_TAGS);
    expect(GEMINI_38_AUDIO_TAGS).toContain('<laughter>');
  });

  it('returns Orpheus tags by language', () => {
    expect(orpheus.inlineTags('es-ES 🇪🇸')).toContain('<resoplido>');
    expect(orpheus.inlineTags('en-US 🇺🇸')).toContain('<sniffle>');
  });

  it('returns nothing for Grok', () => {
    expect(grok.inlineTags('es-ES 🇪🇸')).toBeUndefined();
  });
});
