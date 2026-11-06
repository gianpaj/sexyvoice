import { describe, expect, it } from 'vitest';

import { getInitialInstruction } from '@/lib/calls/greetings';
import { DEFAULT_CALL_MODEL } from '@/lib/calls/models';

describe('getInitialInstruction', () => {
  it('keeps the breathy cue for Grok realtime', () => {
    expect(getInitialInstruction('en', DEFAULT_CALL_MODEL)).toBe(
      'SYSTEM: <breathy>Say hi to the user in a seductive and flirtatious manner. If the user is not talking much, be proactive and get them to engage.</breathy>',
    );
  });

  it.each(['inworld-tts', 'mistral-tts'] as const)(
    'drops the angle-bracket cue for %s, which reads square tags',
    (model) => {
      const instruction = getInitialInstruction('de', model);
      expect(instruction).toBe(
        'SYSTEM: Begrüße den Nutzer auf verführerische und kokette Weise. Wenn der Nutzer nicht viel spricht, sei proaktiv und versuche ihn zum Engagement zu bewegen.',
      );
      expect(instruction).not.toMatch(/[<>]/);
    },
  );
});
