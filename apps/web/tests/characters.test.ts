import { describe, expect, it } from 'vitest';

import {
  buildSaveCharacterPayload,
  type Character,
  type CharacterRow,
  characterDescription,
  characterPrompt,
  characterSampleUrl,
  DEFAULT_SESSION_CONFIG,
  parseSessionConfig,
  toCharacter,
} from '@/lib/calls/characters';

const VOICE_SAMPLE = 'https://files.example/ara.mp3';
const INTROS = {
  de: 'https://files.example/characters/de/lily.mp3',
  en: 'https://files.example/characters/en/lily.mp3',
};

const row = (overrides: Partial<CharacterRow> = {}): CharacterRow => ({
  id: 'lily',
  image: 'lily.webp',
  is_public: true,
  localized_descriptions: { de: 'Schüchtern', en: 'Shy', invalid: 42 },
  localized_sample_urls: null,
  name: 'Lily',
  session_config: { voice: 'Ara' },
  voices: { sample_url: VOICE_SAMPLE },
  ...overrides,
});

const base: Character = {
  id: '6f1d9c2a-0000-4000-8000-000000000002',
  isPublic: false,
  localizedDescriptions: { de: 'Geduldiger Lehrer', en: 'Patient tutor' },
  localizedPrompts: { de: 'Du bist Marco.', en: 'You are Marco.' },
  localizedSampleUrls: {},
  name: 'Marco',
  prompt: 'You are Marco.',
  sessionConfig: { ...DEFAULT_SESSION_CONFIG, voice: 'Rex' },
};

describe('parseSessionConfig', () => {
  it('fills defaults for a missing config', () => {
    expect(parseSessionConfig(null)).toEqual(DEFAULT_SESSION_CONFIG);
  });

  it('keeps the saved model, voice and saved voice reference', () => {
    expect(
      parseSessionConfig({
        audioReferenceId: 'reference-id',
        grokImageEnabled: true,
        maxOutputTokens: 300,
        model: 'inworld-tts',
        temperature: 0.4,
        voice: 'My voice',
      }),
    ).toEqual({
      audioReferenceId: 'reference-id',
      maxOutputTokens: 300,
      model: 'inworld-tts',
      temperature: 0.4,
      voice: 'My voice',
    });
  });

  it('reads the legacy token key and replaces an unknown model', () => {
    expect(
      parseSessionConfig({ max_output_tokens: 256, model: 'retired-model' }),
    ).toMatchObject({
      maxOutputTokens: 256,
      model: DEFAULT_SESSION_CONFIG.model,
    });
  });
});

describe('toCharacter', () => {
  it('maps a predefined character without prompt text', () => {
    expect(toCharacter(row())).toEqual({
      id: 'lily',
      image: 'lily.webp',
      isPublic: true,
      localizedDescriptions: { de: 'Schüchtern', en: 'Shy' },
      localizedPrompts: {},
      localizedSampleUrls: {},
      name: 'Lily',
      prompt: '',
      sessionConfig: { ...DEFAULT_SESSION_CONFIG, voice: 'Ara' },
      voiceSampleUrl: VOICE_SAMPLE,
    });
  });

  it('maps an own character with its prompts', () => {
    const character = toCharacter(
      row({
        image: null,
        is_public: false,
        prompts: {
          localized_prompts: { de: 'Du bist Lily.' },
          prompt: 'You are Lily.',
        },
        voices: null,
      }),
    );

    expect(character).toMatchObject({
      image: undefined,
      isPublic: false,
      localizedPrompts: { de: 'Du bist Lily.' },
      prompt: 'You are Lily.',
      voiceSampleUrl: undefined,
    });
  });
});

describe('localized fields', () => {
  it('falls back to the default prompt for a missing or empty language', () => {
    const character = {
      localizedPrompts: { de: 'Du bist Marco.', es: '' },
      prompt: 'You are Marco.',
    };
    expect(characterPrompt(character, 'de')).toBe('Du bist Marco.');
    expect(characterPrompt(character, 'es')).toBe('You are Marco.');
    expect(characterPrompt(character, 'fi')).toBe('You are Marco.');
  });

  it('falls back to the English description', () => {
    expect(characterDescription(base, 'de')).toBe('Geduldiger Lehrer');
    expect(characterDescription(base, 'fi')).toBe('Patient tutor');
  });

  describe('samples', () => {
    const lily = toCharacter(row({ localized_sample_urls: INTROS }));

    it('plays the intro in the call language', () => {
      expect(characterSampleUrl(lily, 'de')).toBe(INTROS.de);
    });

    it('falls back to the English intro', () => {
      expect(characterSampleUrl(lily, 'ja')).toBe(INTROS.en);
    });

    it('falls back to the voice sample without intros', () => {
      expect(characterSampleUrl(toCharacter(row()), 'de')).toBe(VOICE_SAMPLE);
      expect(characterSampleUrl(toCharacter(row()))).toBe(VOICE_SAMPLE);
    });

    it('plays a saved voice through the owner-checked proxy', () => {
      const character = toCharacter(
        row({
          localized_sample_urls: INTROS,
          session_config: { audioReferenceId: 'reference-id' },
        }),
      );
      expect(characterSampleUrl(character, 'de')).toBe(
        '/api/audio-references/reference-id/sample',
      );
    });
  });
});

const fields = {
  description: 'Paciente',
  name: 'Marco',
  prompt: 'Eres Marco.',
  sessionConfig: base.sessionConfig,
};

describe('buildSaveCharacterPayload', () => {
  it('adds a language to an edit without replacing the default prompt', () => {
    const payload = buildSaveCharacterPayload({
      ...fields,
      base,
      language: 'es',
      update: true,
    });

    expect(payload).toEqual({
      id: base.id,
      localizedDescriptions: {
        de: 'Geduldiger Lehrer',
        en: 'Patient tutor',
        es: 'Paciente',
      },
      localizedPrompts: {
        de: 'Du bist Marco.',
        en: 'You are Marco.',
        es: 'Eres Marco.',
      },
      name: 'Marco',
      prompt: 'You are Marco.',
      sessionConfig: base.sessionConfig,
    });
  });

  it('replaces the default prompt on an English edit', () => {
    const payload = buildSaveCharacterPayload({
      ...fields,
      base,
      language: 'en',
      prompt: 'You are Marco, stricter.',
      update: true,
    });

    expect(payload.prompt).toBe('You are Marco, stricter.');
    expect(payload.localizedPrompts.en).toBe('You are Marco, stricter.');
  });

  it('keeps every language on a duplicate but sends no ID', () => {
    const payload = buildSaveCharacterPayload({
      ...fields,
      base,
      language: 'es',
      name: 'Marco copy',
    });

    expect(payload).not.toHaveProperty('id');
    expect(Object.keys(payload.localizedPrompts).sort()).toEqual([
      'de',
      'en',
      'es',
    ]);
  });

  it('uses the new prompt as the default for a new character', () => {
    const payload = buildSaveCharacterPayload({ ...fields, language: 'es' });

    expect(payload).toEqual({
      localizedDescriptions: { es: 'Paciente' },
      localizedPrompts: { es: 'Eres Marco.' },
      name: 'Marco',
      prompt: 'Eres Marco.',
      sessionConfig: base.sessionConfig,
    });
  });
});
