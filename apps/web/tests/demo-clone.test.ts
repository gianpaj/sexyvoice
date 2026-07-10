import { describe, expect, it } from 'vitest';

import {
  DEMO_FALLBACK_LANGUAGE,
  DEMO_LANGUAGE_CODES,
  demoCloneClips,
  demoCloneSentences,
  demoCloneSpeakers,
  getDemoCloneClip,
  getDemoCloneClipKey,
  isDemoLanguageCode,
  resolveInitialDemoLanguage,
} from '@/data/demo-clone';

const WEBSITE_LOCALES = ['en', 'es', 'de', 'da', 'it', 'fr'] as const;

const everyTriple = () =>
  demoCloneSpeakers.flatMap((speaker) =>
    DEMO_LANGUAGE_CODES.flatMap((languageCode) =>
      demoCloneSentences.map((sentence) => ({
        languageCode,
        sentenceId: sentence.id,
        speakerId: speaker.id,
      })),
    ),
  );

describe('demo clone grid', () => {
  it('resolves a clip for every speaker x language x sentence triple', () => {
    const missing = everyTriple().filter(
      ({ speakerId, languageCode, sentenceId }) =>
        !getDemoCloneClip(speakerId, languageCode, sentenceId),
    );

    expect(missing).toEqual([]);
  });

  it('has no orphan clips that no triple can reach', () => {
    const reachable = new Set(
      everyTriple().map(({ speakerId, languageCode, sentenceId }) =>
        getDemoCloneClipKey(speakerId, languageCode, sentenceId),
      ),
    );

    const orphans = Object.keys(demoCloneClips).filter(
      (key) => !reachable.has(key),
    );

    expect(orphans).toEqual([]);
  });

  it('has exactly speakers x languages x sentences clips', () => {
    expect(Object.keys(demoCloneClips)).toHaveLength(
      demoCloneSpeakers.length *
        DEMO_LANGUAGE_CODES.length *
        demoCloneSentences.length,
    );
  });

  it('gives every sentence text in every demo language', () => {
    for (const sentence of demoCloneSentences) {
      for (const code of DEMO_LANGUAGE_CODES) {
        expect(sentence.text[code]?.trim()).toBeTruthy();
      }
    }
  });

  it('uses unique speaker and sentence ids', () => {
    const speakerIds = demoCloneSpeakers.map((s) => s.id);
    const sentenceIds = demoCloneSentences.map((s) => s.id);

    expect(new Set(speakerIds).size).toBe(speakerIds.length);
    expect(new Set(sentenceIds).size).toBe(sentenceIds.length);
  });

  it('points every clip and reference at an https URL', () => {
    const urls = [
      ...Object.values(demoCloneClips).map((clip) => clip.src),
      ...demoCloneSpeakers.map((speaker) => speaker.referenceSrc),
    ];

    for (const url of urls) {
      expect(url).toMatch(/^https:\/\//);
    }
  });

  it('gives every clip and reference a positive duration', () => {
    const durations = [
      ...Object.values(demoCloneClips).map((clip) => clip.durationSeconds),
      ...demoCloneSpeakers.map((speaker) => speaker.referenceDurationSeconds),
    ];

    for (const duration of durations) {
      expect(duration).toBeGreaterThan(0);
    }
  });
});

describe('resolveInitialDemoLanguage', () => {
  it('keeps the page locale when the demo has clips for it', () => {
    expect(resolveInitialDemoLanguage('it')).toBe('it');
    expect(resolveInitialDemoLanguage('es')).toBe('es');
    expect(resolveInitialDemoLanguage('en')).toBe('en');
  });

  it('falls back to English for website locales outside the grid', () => {
    expect(resolveInitialDemoLanguage('de')).toBe('en');
    expect(resolveInitialDemoLanguage('da')).toBe('en');
    expect(resolveInitialDemoLanguage('fr')).toBe('en');
  });

  it('resolves every website locale to a language the grid covers', () => {
    for (const locale of WEBSITE_LOCALES) {
      const resolved = resolveInitialDemoLanguage(locale);

      expect(isDemoLanguageCode(resolved)).toBe(true);
    }
  });

  it('falls back for an unknown locale', () => {
    expect(resolveInitialDemoLanguage('zz')).toBe(DEMO_FALLBACK_LANGUAGE);
  });
});
