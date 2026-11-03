import { expect, it } from 'vitest';

import { normalizeModelName } from '@/app/api/daily-stats/utils';

it.each([
  ['voxtral-mini-tts-3-0', 'Voxtral Clone'],
  ['resemble-ai/chatterbox-multilingual', 'Chatterbox'],
  ['inworld-tts-2', 'Inworld Clone'],
])('labels the %s clone model as %s', (model, label) => {
  expect(normalizeModelName(model)).toBe(label);
});
