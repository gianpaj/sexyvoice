import { describe, expect, it } from 'vitest';

import { callMemoryPreference, isCallMemoryEnabled } from '@/lib/calls/memory';

describe('call memory preference', () => {
  it.each([true, false])('reads back a saved %s', (enabled) => {
    expect(isCallMemoryEnabled(callMemoryPreference(enabled))).toBe(enabled);
  });

  it('is on until the user turns it off', () => {
    expect(isCallMemoryEnabled(undefined)).toBe(true);
    expect(isCallMemoryEnabled({})).toBe(true);
  });
});
