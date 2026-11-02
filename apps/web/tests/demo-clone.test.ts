import { describe, expect, it } from 'vitest';

import {
  DEMO_FALLBACK_LANGUAGE,
  DEMO_LANGUAGE_CODES,
  demoCloneSpeakers,
  getDemoCloneSpeaker,
  isDemoLanguageCode,
  resolveInitialDemoSpeakerId,
} from '@/data/demo-clone';

const WEBSITE_LOCALES = ['en', 'es', 'de', 'da', 'it', 'fr'] as const;

describe('demo clone speakers', () => {
  it('gives every speaker a reference clip, a result clip, and a script', () => {
    for (const speaker of demoCloneSpeakers) {
      expect(speaker.reference.src).toMatch(/^https:\/\//);
      expect(speaker.result.src).toMatch(/^https:\/\//);
      expect(speaker.script.trim()).toBeTruthy();
    }
  });

  it('gives every clip a positive duration', () => {
    for (const speaker of demoCloneSpeakers) {
      expect(speaker.reference.durationSeconds).toBeGreaterThan(0);
      expect(speaker.result.durationSeconds).toBeGreaterThan(0);
    }
  });

  it('uses unique speaker ids', () => {
    const ids = demoCloneSpeakers.map((speaker) => speaker.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers each demo language with exactly one speaker', () => {
    const codes = demoCloneSpeakers.map((speaker) => speaker.languageCode);

    expect([...codes].sort()).toEqual([...DEMO_LANGUAGE_CODES].sort());
  });

  it('has an English speaker to fall back to', () => {
    const fallback = demoCloneSpeakers.find(
      (speaker) => speaker.languageCode === DEMO_FALLBACK_LANGUAGE,
    );

    expect(fallback).toBeDefined();
  });
});

describe('getDemoCloneSpeaker', () => {
  it('resolves a speaker by id', () => {
    expect(getDemoCloneSpeaker('heike').id).toBe('heike');
  });

  it('falls back to the first speaker for an unknown id', () => {
    expect(getDemoCloneSpeaker('nobody')).toBe(demoCloneSpeakers[0]);
  });
});

describe('resolveInitialDemoSpeakerId', () => {
  it('picks the speaker whose language matches the page locale', () => {
    expect(resolveInitialDemoSpeakerId('de')).toBe('heike');
    expect(resolveInitialDemoSpeakerId('en')).toBe('kat');
  });

  it('falls back to the English speaker for uncovered locales', () => {
    expect(resolveInitialDemoSpeakerId('es')).toBe('kat');
    expect(resolveInitialDemoSpeakerId('da')).toBe('kat');
    expect(resolveInitialDemoSpeakerId('fr')).toBe('kat');
  });

  it('falls back for an unknown locale', () => {
    expect(resolveInitialDemoSpeakerId('zz')).toBe('kat');
  });

  it('resolves every website locale to a real speaker', () => {
    const ids = new Set(demoCloneSpeakers.map((speaker) => speaker.id));

    for (const locale of WEBSITE_LOCALES) {
      expect(ids.has(resolveInitialDemoSpeakerId(locale))).toBe(true);
    }
  });
});

describe('isDemoLanguageCode', () => {
  it('accepts the demo languages and rejects everything else', () => {
    for (const code of DEMO_LANGUAGE_CODES) {
      expect(isDemoLanguageCode(code)).toBe(true);
    }

    expect(isDemoLanguageCode('zz')).toBe(false);
  });
});
