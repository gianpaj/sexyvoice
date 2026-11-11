import { describe, expect, it } from 'vitest';

import { DEFAULT_MODEL_ID, ModelId } from '@/data/models';
import {
  type CallLanguage,
  getInitialInstruction,
  languageInitialInstructions,
} from '@/data/playground-state';

const languages = Object.keys(languageInitialInstructions) as CallLanguage[];

describe('getInitialInstruction', () => {
  it.each(languages)(
    'wraps the %s instruction in one breathy cue',
    (language) => {
      expect(languageInitialInstructions[language]).toMatch(
        /^SYSTEM: <breathy>[^<>]+<\/breathy>$/,
      );
    },
  );

  it.each(languages)(
    'keeps the breathy cue for Grok realtime in %s',
    (language) => {
      expect(getInitialInstruction(language, DEFAULT_MODEL_ID)).toBe(
        languageInitialInstructions[language],
      );
    },
  );

  it.each(
    [ModelId.INWORLD_TTS, ModelId.MISTRAL_TTS].flatMap((model) =>
      languages.map((language) => [model, language] as const),
    ),
  )('drops the angle-bracket cue for %s in %s', (model, language) => {
    const instruction = getInitialInstruction(language, model);
    expect(instruction).toBe(
      languageInitialInstructions[language].replace(/<\/?breathy>/g, ''),
    );
    expect(instruction).toMatch(/^SYSTEM: [^<>]+$/);
  });
});
