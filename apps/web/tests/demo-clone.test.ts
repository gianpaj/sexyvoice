import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import manifest from '@/data/clone-demo-assets.json';
import { CLONE_DEMO_VOICES } from '@/data/clone-demo-config';
import { CLONE_DEMO_LANGUAGES } from '@/data/clone-demo-languages';
import {
  DEMO_FALLBACK_LANGUAGE,
  DEMO_LANGUAGE_CODES,
  demoCloneSpeakers,
  getDemoCloneLanguages,
  getDemoCloneSelection,
  getDemoCloneSpeaker,
  getDemoCloneTranscript,
  isDemoLanguageCode,
  resolveInitialDemoLanguageCode,
  resolveInitialDemoSpeakerId,
} from '@/data/demo-clone';
import { VOXTRAL_SUPPORTED_LOCALE_CODES } from '@/lib/clone/constants';
import { getCloneDemoRedirect } from '@/lib/clone/demo-redirect';

const WEBSITE_LOCALES = ['en', 'es', 'de', 'da', 'it', 'fr'] as const;

describe('demo clone speakers', () => {
  it('keeps three short deliveries and puts Kat’s same-text example first', () => {
    expect(demoCloneSpeakers).toHaveLength(2);
    for (const speaker of demoCloneSpeakers) {
      const deliveries = speaker.takes.filter(
        ({ id }) => id !== 'sameOriginal',
      );
      expect(deliveries.map(({ id }) => id)).toEqual([
        'natural',
        'sarcastic',
        'calmSlow',
      ]);
      for (const take of deliveries) {
        expect(getDemoCloneTranscript(take.prompt)).toBe(speaker.script);
      }
      expect(deliveries[2].prompt).toContain('[emotion=calm][pace=slow]');
    }
    expect(getDemoCloneSpeaker('kat').takes[0].id).toBe('sameOriginal');
    expect(getDemoCloneSpeaker('kat').takes).toHaveLength(4);
    expect(getDemoCloneSpeaker('heike').takes).toHaveLength(3);
    expect(getDemoCloneSelection('heike', 'sameOriginal')).toBeNull();
  });

  it('uses Kat’s full reference passage without delivery tags', () => {
    expect(getDemoCloneSelection('kat', 'sameOriginal')?.take.prompt).toBe(
      'Downtown Drugstore had a bell on the door that made a single tink sound when you opened it.\nOxford Pharmacy had two bells on its doors, so it was more of a ta-tank, though nothing to startle over.',
    );
  });

  it('places Kat’s calm and slow tags after the opening interjection', () => {
    expect(getDemoCloneSelection('kat', 'calmSlow')?.take.prompt).toBe(
      "Oh, [emotion=calm][pace=slow]you're here just when I was thinking about you.",
    );
  });

  it('matches every prepared prompt to its generation request', () => {
    for (const request of manifest.requests) {
      expect(
        getDemoCloneSelection(request.voice, request.take)?.take.prompt,
      ).toBe(request.input);
    }
  });

  it('ships every audio clip with verified duration and content hashes', () => {
    for (const speaker of demoCloneSpeakers) {
      for (const clip of [speaker.reference, ...speaker.takes]) {
        expect(clip.src).toMatch(/^\/demo-clones\/voxtral-3\//);
        const filename = clip.src
          .split('/')
          .pop() as keyof typeof manifest.assets;
        const asset = manifest.assets[filename];
        expect(clip.durationSeconds).toBe(asset.durationSeconds);
        expect(clip.durationSeconds).toBeGreaterThan(0);
        expect(clip.peaks).toBe(asset.waveform.peaks);
        const bytes = readFileSync(resolve('public', clip.src.slice(1)));
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(
          asset.sha256,
        );
      }
    }
  });

  it('stores valid waveform peaks bound to each final MP3', () => {
    for (const asset of Object.values(manifest.assets)) {
      expect(asset.waveform.sourceSha256).toBe(asset.sha256);
      expect(asset.waveform.peaks.length).toBeGreaterThanOrEqual(1);
      expect(asset.waveform.peaks.length).toBeLessThanOrEqual(8);
      const points = asset.waveform.peaks[0].length;
      expect(points).toBeGreaterThanOrEqual(1);
      expect(points).toBeLessThanOrEqual(4096);
      for (const channel of asset.waveform.peaks) {
        expect(channel).toHaveLength(points);
        for (const value of channel) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(-1);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('uses unique speaker ids', () => {
    const ids = demoCloneSpeakers.map((speaker) => speaker.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has exactly one ready speaker for English and German', () => {
    const codes = demoCloneSpeakers.map((speaker) => speaker.languageCode);

    expect(codes).toEqual(['en', 'de']);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(isDemoLanguageCode(code)).toBe(true);
    }
  });

  it('uses independent source references and audio for each ready voice', () => {
    const sourceKeys = CLONE_DEMO_VOICES.map((voice) => voice.sourceKey);
    const sourceHashes = Object.values(manifest.sourceHashes);
    const referencePaths = demoCloneSpeakers.map(
      ({ reference }) => reference.src,
    );
    const referenceHashes = demoCloneSpeakers.map(({ reference }) => {
      const filename = reference.src
        .split('/')
        .pop() as keyof typeof manifest.assets;
      return manifest.assets[filename].sha256;
    });

    for (const values of [
      sourceKeys,
      sourceHashes,
      referencePaths,
      referenceHashes,
    ]) {
      expect(values).toHaveLength(demoCloneSpeakers.length);
      expect(new Set(values).size).toBe(demoCloneSpeakers.length);
    }
  });

  it('has an English speaker to fall back to', () => {
    const fallback = demoCloneSpeakers.find(
      (speaker) => speaker.languageCode === DEMO_FALLBACK_LANGUAGE,
    );

    expect(fallback).toBeDefined();
  });
});

describe('demo clone languages', () => {
  it('derives nine ordered language codes from one catalog and matches Voxtral', () => {
    expect(DEMO_LANGUAGE_CODES).toEqual([
      'en',
      'de',
      'es',
      'fr',
      'it',
      'nl',
      'pt',
      'ar',
      'hi',
    ]);
    expect(DEMO_LANGUAGE_CODES).toEqual(
      CLONE_DEMO_LANGUAGES.map(({ languageCode }) => languageCode),
    );
    expect(new Set(DEMO_LANGUAGE_CODES)).toEqual(
      VOXTRAL_SUPPORTED_LOCALE_CODES,
    );
  });

  it('stages distinct translated anxious prompts without assigning audio', () => {
    const languages = getDemoCloneLanguages('en');
    expect(languages[0].prompt).toBe(
      '[emotion=anxious] Hi… um, sorry to bother you. I just… I didn’t know who else to call. Are you… busy?',
    );
    expect(new Set(languages.map(({ prompt }) => prompt)).size).toBe(9);
    for (const language of languages) {
      expect(language.prompt.match(/\[[^\]]*\]/g)).toEqual([
        '[emotion=anxious]',
      ]);
      expect(getDemoCloneTranscript(language.prompt).length).toBeGreaterThan(
        40,
      );
      expect(Object.keys(language).sort()).toEqual([
        'languageCode',
        'prompt',
        'speaker',
      ]);
      if (language.speaker) {
        expect(language.speaker).toBe(
          demoCloneSpeakers.find(
            ({ languageCode }) => languageCode === language.languageCode,
          ),
        );
        for (const take of language.speaker.takes) {
          expect(take.prompt).not.toBe(language.prompt);
        }
      } else {
        expect(language.speaker).toBeNull();
      }
    }
    expect(languages.filter(({ speaker }) => speaker !== null)).toHaveLength(2);
    expect(languages.filter(({ speaker }) => speaker === null)).toHaveLength(7);
  });

  it.each([
    ['en-US', 'en'],
    ['DE-de', 'de'],
    [' es_MX ', 'es'],
    ['fr-CA', 'fr'],
    ['it-IT', 'it'],
    ['nl-NL', 'nl'],
    ['pt-BR', 'pt'],
    ['ar-EG', 'ar'],
    ['hi-IN', 'hi'],
    ['da-DK', 'en'],
    ['zz', 'en'],
    ['', 'en'],
  ])('normalizes %j to %s', (locale, expected) => {
    expect(resolveInitialDemoLanguageCode(locale)).toBe(expected);
    expect(getDemoCloneLanguages(locale)[0].languageCode).toBe(expected);
  });

  it('puts the locale first and preserves the remaining catalog order without mutation', () => {
    const catalogBefore = structuredClone(CLONE_DEMO_LANGUAGES);
    const speakersBefore = structuredClone(demoCloneSpeakers);
    const englishBefore = getDemoCloneLanguages('en');
    for (const locale of [...WEBSITE_LOCALES, ...DEMO_LANGUAGE_CODES]) {
      const initial = resolveInitialDemoLanguageCode(locale);
      const languages = getDemoCloneLanguages(locale);
      expect(languages.map(({ languageCode }) => languageCode)).toEqual([
        initial,
        ...DEMO_LANGUAGE_CODES.filter((code) => code !== initial),
      ]);
      expect(languages).toHaveLength(9);
    }
    expect(CLONE_DEMO_LANGUAGES).toEqual(catalogBefore);
    expect(demoCloneSpeakers).toEqual(speakersBefore);
    expect(getDemoCloneLanguages('en')).toEqual(englishBefore);
    const changed = getDemoCloneLanguages('de');
    changed[0].prompt = 'changed';
    changed.reverse();
    expect(getDemoCloneLanguages('en')).toEqual(englishBefore);
  });

  it('keeps pending languages out of ready selections and signup redirects', () => {
    for (const { languageCode, speaker } of getDemoCloneLanguages('en')) {
      if (speaker) continue;
      expect(resolveInitialDemoSpeakerId(languageCode)).toBe('kat');
      expect(getDemoCloneSpeaker(languageCode)).toBe(demoCloneSpeakers[0]);
      for (const take of [
        'sameOriginal',
        'natural',
        'sarcastic',
        'calmSlow',
        'anxious',
      ]) {
        expect(getDemoCloneSelection(languageCode, take)).toBeNull();
        expect(
          getCloneDemoRedirect(
            `/en/dashboard/clone?demo=${languageCode}&take=${take}`,
          ),
        ).toBeNull();
      }
    }
    for (const speaker of demoCloneSpeakers) {
      expect(getDemoCloneSelection(speaker.id, 'anxious')).toBeNull();
      expect(
        getCloneDemoRedirect(
          `/en/dashboard/clone?demo=${speaker.id}&take=anxious`,
        ),
      ).toBeNull();
    }
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

describe('demo handoff', () => {
  it('resolves only complete known selections', () => {
    expect(getDemoCloneSelection('heike', 'calmSlow')?.take.prompt).toContain(
      '[pace=slow]',
    );
    expect(getDemoCloneSelection('unknown', 'natural')).toBeNull();
    expect(getDemoCloneSelection('kat', 'angry')).toBeNull();
    expect(getDemoCloneSelection('kat', null)).toBeNull();
  });

  it('keeps only allowlisted demo paths through signup', () => {
    expect(
      getCloneDemoRedirect('/en/dashboard/clone?demo=kat&take=sameOriginal'),
    ).toBe('/en/dashboard/clone?demo=kat&take=sameOriginal');
    for (const locale of WEBSITE_LOCALES) {
      expect(
        getCloneDemoRedirect(
          `/${locale}/dashboard/clone?take=calmSlow&demo=heike&other=ignored`,
        ),
      ).toBe(`/${locale}/dashboard/clone?demo=heike&take=calmSlow`);
    }
    for (const path of [
      'https://evil.com/en/dashboard/clone?demo=kat&take=natural',
      '//evil.com/en/dashboard/clone?demo=kat&take=natural',
      '/en/\\evil.com?demo=kat&take=natural',
      '/en/dashboard/generate?demo=kat&take=natural',
      '/en/dashboard/clone?demo=bad&take=natural',
      '/en/dashboard/clone?demo=heike&take=sameOriginal',
      '/en/dashboard/clone?demo=kat',
      '/xx/dashboard/clone?demo=kat&take=natural',
      '/en/dashboard/clone?demo=kat&take=natural#fragment',
      null,
    ]) {
      expect(getCloneDemoRedirect(path)).toBeNull();
    }
  });
});
