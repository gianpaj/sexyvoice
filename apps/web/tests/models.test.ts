import { describe, expect, it } from 'vitest';

import { DEFAULT_MODEL_ID, ModelId, normalizeModelId } from '@/data/models';
import { mapApiCharacterToPreset } from '@/lib/characters';

describe('normalizeModelId', () => {
  it('keeps a supported model id', () => {
    expect(normalizeModelId(ModelId.GROK_VOICE_THINK_FAST_2_0)).toBe(
      'grok-voice-think-fast-2.0',
    );
  });

  it('upgrades the retired grok-voice-think-fast-1.0 id', () => {
    expect(normalizeModelId('grok-voice-think-fast-1.0')).toBe(
      'grok-voice-think-fast-2.0',
    );
  });

  it('falls back to the default for missing or unknown ids', () => {
    expect(normalizeModelId(undefined)).toBe(DEFAULT_MODEL_ID);
    expect(normalizeModelId(null)).toBe(DEFAULT_MODEL_ID);
    expect(normalizeModelId('')).toBe(DEFAULT_MODEL_ID);
    expect(normalizeModelId('not-a-real-model')).toBe(DEFAULT_MODEL_ID);
  });
});

describe('mapApiCharacterToPreset', () => {
  it('upgrades a legacy model id stored in session_config', () => {
    const preset = mapApiCharacterToPreset({
      id: '00000000-0000-4000-a000-000000000201',
      name: 'Legacy character',
      session_config: {
        model: 'grok-voice-think-fast-1.0',
        voice: 'Eve',
        temperature: 0.8,
        maxOutputTokens: null,
      },
    });

    expect(preset.sessionConfig.model).toBe('grok-voice-think-fast-2.0');
  });
});
