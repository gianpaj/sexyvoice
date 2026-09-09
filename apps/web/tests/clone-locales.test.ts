import { describe, expect, it } from 'vitest';

import {
  CHATTERBOX_CLONE_LOCALES,
  CLONE_LOCALES,
  RTL_CLONE_LOCALE_CODES,
  VOXTRAL_CLONE_LOCALES,
  VOXTRAL_SUPPORTED_LOCALE_CODES,
} from '@/lib/clone/constants';

describe('clone locales', () => {
  it('combines both models and the explicit English Chatterbox option', () => {
    const expectedCodes = new Set([
      ...Object.keys(VOXTRAL_CLONE_LOCALES),
      ...Object.keys(CHATTERBOX_CLONE_LOCALES),
      'en-multi',
    ]);
    expect(new Set(Object.keys(CLONE_LOCALES))).toEqual(expectedCodes);
    expect(expectedCodes.size).toBe(24);
    expect(CLONE_LOCALES['en-multi']).toBe('english');
    expect(VOXTRAL_SUPPORTED_LOCALE_CODES.has('en')).toBe(true);
    expect(VOXTRAL_SUPPORTED_LOCALE_CODES.has('en-multi')).toBe(false);
  });

  it('marks Arabic and Hebrew as the supported RTL locales', () => {
    expect([...RTL_CLONE_LOCALE_CODES].sort()).toEqual(['ar', 'he']);
    for (const code of RTL_CLONE_LOCALE_CODES) {
      expect(Object.hasOwn(CLONE_LOCALES, code)).toBe(true);
    }
  });
});
