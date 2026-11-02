import { describe, expect, it } from 'vitest';

import { type CharacterRow, mapCharacterToPreset } from '@/lib/call-presets';

const row = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'lily',
    image: 'lily.webp',
    is_public: true,
    localized_descriptions: {},
    name: 'Lily',
    prompt_id: 'prompt',
    prompts: { type: 'call' },
    sample_url: null,
    session_config: { voice: 'Ara' },
    sort_order: 0,
    voice_id: 'voice',
    voices: { name: 'Ara', sample_url: 'https://files.example/ara.mp3' },
    ...overrides,
  }) as unknown as CharacterRow;

describe('mapCharacterToPreset', () => {
  it('plays the character sample when it has one', () => {
    const preset = mapCharacterToPreset(
      row({ sample_url: 'https://files.example/characters/lily.mp3' }),
    );
    expect(preset.voiceSampleUrl).toBe(
      'https://files.example/characters/lily.mp3',
    );
  });

  it('falls back to the voice sample', () => {
    expect(mapCharacterToPreset(row()).voiceSampleUrl).toBe(
      'https://files.example/ara.mp3',
    );
    const { sample_url: _, ...userRow } = row() as Record<string, unknown>;
    expect(
      mapCharacterToPreset(userRow as unknown as CharacterRow).voiceSampleUrl,
    ).toBe('https://files.example/ara.mp3');
  });
});
