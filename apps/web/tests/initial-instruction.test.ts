import { describe, expect, it } from 'vitest';

import { getInitialInstruction } from '@/lib/calls/greetings';
import { CALL_LANGUAGES } from '@/lib/calls/languages';
import { DEFAULT_CALL_MODEL } from '@/lib/calls/models';

describe('getInitialInstruction', () => {
  it.each(CALL_LANGUAGES)(
    'wraps the %s instruction in one breathy cue for Grok realtime',
    (language) => {
      expect(getInitialInstruction(language, DEFAULT_CALL_MODEL)).toMatch(
        /^SYSTEM: <breathy>[^<>]+<\/breathy>$/,
      );
    },
  );

  it('opens in character in the call language', () => {
    expect(getInitialInstruction('en', DEFAULT_CALL_MODEL)).toBe(
      'SYSTEM: <breathy>Start the call as your character. If a scene is set, open from inside it. Vary your opening: a greeting, an observation, a question that fits, or a line that drops straight into the scene. Avoid generic catchphrases. Keep it brief, one or two sentences, and speak English. If the user is not talking much, be proactive and get them to engage.</breathy>',
    );
  });

  it.each(
    (['inworld-tts', 'mistral-tts'] as const).flatMap((model) =>
      CALL_LANGUAGES.map((language) => [model, language] as const),
    ),
  )(
    'drops the angle-bracket cue for %s in %s, which reads square tags',
    (model, language) => {
      const instruction = getInitialInstruction(language, model);
      expect(instruction).toBe(
        getInitialInstruction(language, DEFAULT_CALL_MODEL).replace(
          /<\/?breathy>/g,
          '',
        ),
      );
      expect(instruction).toMatch(/^SYSTEM: [^<>]+$/);
    },
  );
});
