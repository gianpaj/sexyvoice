import { describe, expect, it } from 'vitest';

import { DEFAULT_MODEL_ID, ModelId } from '@/data/models';
import {
  getInitialInstruction,
  languageInitialInstructions,
} from '@/data/playground-state';

describe('getInitialInstruction', () => {
  it('keeps the breathy cue for Grok realtime', () => {
    expect(getInitialInstruction('en', DEFAULT_MODEL_ID)).toBe(
      languageInitialInstructions.en,
    );
  });

  it.each([ModelId.INWORLD_TTS, ModelId.MISTRAL_TTS])(
    'drops the angle-bracket cue for %s, which reads square tags',
    (model) => {
      const instruction = getInitialInstruction('de', model);
      expect(instruction).toBe(
        'SYSTEM: Beginne den Anruf als deine Figur. Wenn eine Szene festgelegt ist, steig direkt in sie ein. Variiere deinen Einstieg: eine Begrüßung, eine Beobachtung, eine passende Frage oder ein Satz, der direkt in die Szene führt. Vermeide abgedroschene Floskeln. Halte es kurz, ein oder zwei Sätze, und sprich Deutsch. Wenn der Nutzer nicht viel spricht, sei proaktiv und versuche ihn zum Engagement zu bewegen.',
      );
      expect(instruction).not.toMatch(/[<>]/);
    },
  );
});
