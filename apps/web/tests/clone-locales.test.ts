import { describe, expect, it } from 'vitest';

import {
  CHATTERBOX_SUPPORTED_LOCALE_CODES,
  CLONE_SUPPORTED_LOCALE_CODES,
  RTL_CLONE_LOCALE_CODES,
  resolveBaseCloneLocale,
  VOXTRAL_SUPPORTED_LOCALE_CODES,
} from '@/lib/clone/constants';

describe('clone locales', () => {
  it('resolves the explicit English Chatterbox option to English', () => {
    expect(resolveBaseCloneLocale('en-multi')).toBe('en');
  });

  it.each([...CHATTERBOX_SUPPORTED_LOCALE_CODES])(
    'preserves the base locale %s',
    (code) => {
      expect(resolveBaseCloneLocale(code)).toBe(code);
    },
  );
  it('combines both models and the explicit English Chatterbox option', () => {
    expect([...CLONE_SUPPORTED_LOCALE_CODES].sort()).toEqual([
      'ar',
      'da',
      'de',
      'el',
      'en',
      'en-multi',
      'es',
      'fi',
      'fr',
      'he',
      'hi',
      'it',
      'ja',
      'ko',
      'ms',
      'nl',
      'no',
      'pl',
      'pt',
      'ru',
      'sv',
      'sw',
      'tr',
      'zh',
    ]);
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
