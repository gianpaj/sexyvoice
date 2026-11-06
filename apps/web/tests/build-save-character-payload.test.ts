import { describe, expect, it } from 'vitest';

import { defaultSessionConfig } from '@/data/default-config';
import type { Preset } from '@/data/presets';
import { buildSaveCharacterPayload } from '@/lib/characters';

const base: Preset = {
  id: '6f1d9c2a-0000-4000-8000-000000000002',
  instructions: 'You are Marco.',
  localizedDescriptions: { de: 'Geduldiger Lehrer', en: 'Patient tutor' },
  localizedInstructions: { de: 'Du bist Marco.', en: 'You are Marco.' },
  name: 'Marco',
  sessionConfig: { ...defaultSessionConfig, voice: 'Rex' },
};

const fields = {
  description: 'Paciente',
  instructions: 'Eres Marco.',
  name: 'Marco',
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
      voiceName: 'Rex',
    });
  });

  it('replaces the default prompt on an English edit', () => {
    const payload = buildSaveCharacterPayload({
      ...fields,
      base,
      instructions: 'You are Marco, stricter.',
      language: 'en',
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
      voiceName: 'Rex',
    });
  });
});
