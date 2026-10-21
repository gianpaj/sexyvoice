import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import manifest from '@/data/clone-demo-assets.json';
import {
  DEMO_FALLBACK_LANGUAGE,
  DEMO_LANGUAGE_CODES,
  demoCloneSpeakers,
  getDemoCloneSelection,
  getDemoCloneSpeaker,
  getDemoCloneTranscript,
  isDemoLanguageCode,
  resolveInitialDemoSpeakerId,
} from '@/data/demo-clone';
import { getCloneDemoRedirect } from '@/lib/clone/demo-redirect';

const WEBSITE_LOCALES = ['en', 'es', 'de', 'da', 'it', 'fr'] as const;

describe('demo clone speakers', () => {
  it('bundles two voices with three takes of one sentence each', () => {
    expect(demoCloneSpeakers).toHaveLength(2);
    for (const speaker of demoCloneSpeakers) {
      expect(speaker.takes.map(({ id }) => id)).toEqual([
        'natural',
        'sarcastic',
        'calmSlow',
      ]);
      for (const take of speaker.takes) {
        expect(getDemoCloneTranscript(take.prompt)).toBe(speaker.script);
      }
      expect(speaker.takes[2].prompt).toContain('[emotion=calm][pace=slow]');
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
        const bytes = readFileSync(resolve('public', clip.src.slice(1)));
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(
          asset.sha256,
        );
      }
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
      '/en/dashboard/clone?demo=kat',
      '/xx/dashboard/clone?demo=kat&take=natural',
      '/en/dashboard/clone?demo=kat&take=natural#fragment',
      null,
    ]) {
      expect(getCloneDemoRedirect(path)).toBeNull();
    }
  });
});
