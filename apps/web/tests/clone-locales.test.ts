import { describe, expect, it } from 'vitest';

import {
  CHATTERBOX_SUPPORTED_LOCALE_CODES,
  CLONE_SUPPORTED_LOCALE_CODES,
  RTL_CLONE_LOCALE_CODES,
  VOXTRAL_SUPPORTED_LOCALE_CODES,
} from '@/lib/clone/constants';

describe('clone locales', () => {
  it('combines both models and the explicit English Chatterbox option', () => {
    const expectedCodes = new Set([
      ...VOXTRAL_SUPPORTED_LOCALE_CODES,
      ...CHATTERBOX_SUPPORTED_LOCALE_CODES,
      'en-multi',
    ]);
    expect(CLONE_SUPPORTED_LOCALE_CODES).toEqual(expectedCodes);
    expect(expectedCodes.size).toBe(24);
    expect(CLONE_SUPPORTED_LOCALE_CODES.has('en-multi')).toBe(true);
    expect(VOXTRAL_SUPPORTED_LOCALE_CODES.has('en')).toBe(true);
    expect(VOXTRAL_SUPPORTED_LOCALE_CODES.has('en-multi')).toBe(false);
  });

  it('marks Arabic and Hebrew as the supported RTL locales', () => {
    expect([...RTL_CLONE_LOCALE_CODES].sort()).toEqual(['ar', 'he']);
    for (const code of RTL_CLONE_LOCALE_CODES) {
      expect(CLONE_SUPPORTED_LOCALE_CODES.has(code)).toBe(true);
    }
  });
});
