import { describe, expect, it } from 'vitest';

import {
  canUseSpeechSetting,
  randomSeed,
  validateGenerationInput,
} from '@/lib/tts/generation-input';
import { TTS_MODELS } from '@/lib/tts/models';

const { gpro38, orpheus, xai } = TTS_MODELS;
const ALL_SETTINGS = { language: 'fr', seed: 42, speed: 1.2, temperature: 0.8 };

describe('validateGenerationInput', () => {
  it.each([
    { isPaidUser: false, model: gpro38, styleLimit: 1000, textLimit: 500 },
    { isPaidUser: true, model: gpro38, styleLimit: 2500, textLimit: 1000 },
    { isPaidUser: false, model: xai, styleLimit: null, textLimit: 500 },
    { isPaidUser: true, model: xai, styleLimit: null, textLimit: 1000 },
    { isPaidUser: true, model: orpheus, styleLimit: null, textLimit: 500 },
  ])(
    'limits $model.label to $textLimit text and $styleLimit style characters when paid=$isPaidUser',
    ({ isPaidUser, model, styleLimit, textLimit }) => {
      const atLimit = validateGenerationInput(model, {
        isPaidUser,
        style: 's'.repeat(styleLimit ?? 5000),
        text: 't'.repeat(textLimit),
      });
      expect(atLimit).toMatchObject({
        styleLimit,
        styleTooLong: false,
        textLimit,
        textTooLong: false,
      });

      const over = validateGenerationInput(model, {
        isPaidUser,
        style: 's'.repeat((styleLimit ?? 5000) + 1),
        text: 't'.repeat(textLimit + 1),
      });
      expect(over.textTooLong).toBe(true);
      expect(over.styleTooLong).toBe(styleLimit !== null);
    },
  );

  it('keeps the style only for models that take one', () => {
    const input = { isPaidUser: true, style: 'calm' };

    expect(validateGenerationInput(gpro38, input).style).toBe('calm');
    expect(validateGenerationInput(gpro38, { isPaidUser: true }).style).toBe(
      '',
    );
    expect(validateGenerationInput(xai, input).style).toBeUndefined();
    expect(validateGenerationInput(orpheus, input).style).toBeUndefined();
  });

  it.each([
    { expected: { seed: 42, temperature: 0.8 }, model: gpro38 },
    { expected: { language: 'fr', speed: 1.2 }, model: xai },
    { expected: {}, model: orpheus },
  ])(
    'accepts only the settings $model.label honours',
    ({ expected, model }) => {
      const { settings } = validateGenerationInput(model, {
        isPaidUser: true,
        settings: ALL_SETTINGS,
      });

      expect(JSON.parse(JSON.stringify(settings))).toEqual(expected);
    },
  );

  it('drops paid settings for free users', () => {
    expect(
      validateGenerationInput(gpro38, {
        isPaidUser: false,
        settings: ALL_SETTINGS,
      }).settings,
    ).toEqual({});
    expect(
      validateGenerationInput(xai, {
        isPaidUser: false,
        settings: ALL_SETTINGS,
      }).settings,
    ).toMatchObject({ language: 'fr', speed: 1.2 });
  });

  it.each([
    { expected: 2, temperature: 3 },
    { expected: 0, temperature: -1 },
    { expected: undefined, temperature: Number.NaN },
    { expected: undefined, temperature: '1' },
  ])(
    'clamps temperature $temperature to $expected',
    ({ expected, temperature }) => {
      expect(
        validateGenerationInput(gpro38, {
          isPaidUser: true,
          settings: { temperature },
        }).settings.temperature,
      ).toBe(expected);
    },
  );

  it.each([
    { expected: 1.5, speed: 3 },
    { expected: 0.7, speed: 0 },
    { expected: 1, speed: 1 },
    { expected: undefined, speed: null },
  ])('clamps speed $speed to $expected', ({ expected, speed }) => {
    expect(
      validateGenerationInput(xai, { isPaidUser: false, settings: { speed } })
        .settings.speed,
    ).toBe(expected);
  });

  it.each([
    { expected: 0, seed: 0 },
    { expected: undefined, seed: -1 },
    { expected: undefined, seed: 1.5 },
    { expected: undefined, seed: Number.MAX_SAFE_INTEGER + 1 },
    { expected: undefined, seed: '7' },
  ])('accepts seed $seed as $expected', ({ expected, seed }) => {
    expect(
      validateGenerationInput(gpro38, { isPaidUser: true, settings: { seed } })
        .settings.seed,
    ).toBe(expected);
  });

  it('ignores an empty language', () => {
    expect(
      validateGenerationInput(xai, {
        isPaidUser: true,
        settings: { language: '' },
      }).settings.language,
    ).toBeUndefined();
  });
});

describe('canUseSpeechSetting', () => {
  it('gates seed and temperature behind a paid plan', () => {
    expect(canUseSpeechSetting(gpro38, 'seed', false)).toBe(false);
    expect(canUseSpeechSetting(gpro38, 'seed', true)).toBe(true);
    expect(canUseSpeechSetting(xai, 'speed', false)).toBe(true);
    expect(canUseSpeechSetting(xai, 'seed', true)).toBe(false);
  });
});

describe('randomSeed', () => {
  it('returns a seven-digit integer', () => {
    for (let index = 0; index < 50; index++) {
      const seed = randomSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(1_000_000);
      expect(seed).toBeLessThan(10_000_000);
    }
  });
});
