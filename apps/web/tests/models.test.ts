import { describe, expect, it } from 'vitest';

import {
  CALL_MODEL_IDS,
  callModelFor,
  callVoiceProvider,
  DEFAULT_CALL_MODEL,
  normalizeCallModel,
} from '@/lib/calls/models';
import { mapApiCharacterToPreset } from '@/lib/characters';

describe('normalizeCallModel', () => {
  it.each(CALL_MODEL_IDS)('keeps the supported model %s', (model) => {
    expect(normalizeCallModel(model)).toBe(model);
  });

  it('defaults to grok-voice-think-fast-2.0', () => {
    expect(DEFAULT_CALL_MODEL).toBe('grok-voice-think-fast-2.0');
  });

  it('falls back to the default for missing or unknown ids', () => {
    expect(normalizeCallModel(undefined)).toBe(DEFAULT_CALL_MODEL);
    expect(normalizeCallModel(null)).toBe(DEFAULT_CALL_MODEL);
    expect(normalizeCallModel('')).toBe(DEFAULT_CALL_MODEL);
    expect(normalizeCallModel('not-a-real-model')).toBe(DEFAULT_CALL_MODEL);
    expect(normalizeCallModel('toString')).toBe(DEFAULT_CALL_MODEL);
  });
});

describe('saved voice models', () => {
  it.each([
    ['inworld', 'inworld-tts'],
    ['mistral', 'mistral-tts'],
  ] as const)('speaks a saved %s voice through %s', (provider, model) => {
    expect(callModelFor(provider)).toBe(model);
    expect(callVoiceProvider(model)).toBe(provider);
  });

  it('speaks built-in voices through the default model', () => {
    expect(callModelFor()).toBe(DEFAULT_CALL_MODEL);
    expect(callVoiceProvider('grok-voice-think-fast-1.0')).toBeNull();
    expect(callVoiceProvider(DEFAULT_CALL_MODEL)).toBeNull();
  });
});

describe('mapApiCharacterToPreset', () => {
  it('keeps the model id a character was saved with', () => {
    const preset = mapApiCharacterToPreset({
      id: '00000000-0000-4000-a000-000000000201',
      name: 'Legacy character',
      session_config: {
        maxOutputTokens: null,
        model: 'grok-voice-think-fast-1.0',
        temperature: 0.8,
        voice: 'Eve',
      },
    });

    expect(preset.sessionConfig.model).toBe('grok-voice-think-fast-1.0');
  });
});
