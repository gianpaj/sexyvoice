import { describe, expect, it } from 'vitest';

import { type CharacterRow, mapCharacterToPreset } from '@/lib/call-presets';
import { getPresetSampleUrl } from '@/lib/characters';

const VOICE_SAMPLE = 'https://files.example/ara.mp3';
const INTROS = {
  de: 'https://files.example/characters/de/lily.mp3',
  en: 'https://files.example/characters/en/lily.mp3',
};

const row = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'lily',
    image: 'lily.webp',
    is_public: true,
    localized_descriptions: {},
    localized_sample_urls: null,
    name: 'Lily',
    prompt_id: 'prompt',
    prompts: { type: 'call' },
    session_config: { voice: 'Ara' },
    sort_order: 0,
    voice_id: 'voice',
    voices: { name: 'Ara', sample_url: VOICE_SAMPLE },
    ...overrides,
  }) as unknown as CharacterRow;

describe('character samples', () => {
  const lily = mapCharacterToPreset(row({ localized_sample_urls: INTROS }));

  it('plays the intro in the call language', () => {
    expect(getPresetSampleUrl(lily, 'de')).toBe(INTROS.de);
  });

  it('falls back to the English intro', () => {
    expect(getPresetSampleUrl(lily, 'ja')).toBe(INTROS.en);
  });

  it('falls back to the voice sample without intros', () => {
    expect(getPresetSampleUrl(mapCharacterToPreset(row()), 'de')).toBe(
      VOICE_SAMPLE,
    );
    const { localized_sample_urls: _, ...userRow } = row() as Record<
      string,
      unknown
    >;
    expect(
      getPresetSampleUrl(
        mapCharacterToPreset(userRow as unknown as CharacterRow),
      ),
    ).toBe(VOICE_SAMPLE);
  });
});
