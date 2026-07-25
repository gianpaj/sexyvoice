import { afterEach, describe, expect, it } from 'vitest';

import {
  getCallE2eeKey,
  normalizeCallE2eeKey,
} from '@/lib/livekit/e2ee/server';

const originalKey = process.env.LIVEKIT_E2EE_KEY;

afterEach(() => {
  if (originalKey === undefined) {
    process.env.LIVEKIT_E2EE_KEY = undefined;
  } else {
    process.env.LIVEKIT_E2EE_KEY = originalKey;
  }
});

describe('normalizeCallE2eeKey', () => {
  it('returns null for missing values', () => {
    expect(normalizeCallE2eeKey(undefined)).toBeNull();
    expect(normalizeCallE2eeKey(null)).toBeNull();
  });

  it('treats blank values as disabled', () => {
    expect(normalizeCallE2eeKey('')).toBeNull();
    expect(normalizeCallE2eeKey('   ')).toBeNull();
    expect(normalizeCallE2eeKey('\n')).toBeNull();
  });

  it('trims surrounding whitespace added by secret managers', () => {
    expect(normalizeCallE2eeKey('  shared-passphrase\n')).toBe(
      'shared-passphrase',
    );
  });

  it('keeps the passphrase untouched otherwise', () => {
    expect(normalizeCallE2eeKey('aGVsbG8td29ybGQ=')).toBe('aGVsbG8td29ybGQ=');
  });
});

describe('getCallE2eeKey', () => {
  it('returns null when LIVEKIT_E2EE_KEY is unset', () => {
    process.env.LIVEKIT_E2EE_KEY = '';
    expect(getCallE2eeKey()).toBeNull();
  });

  it('returns the configured shared key', () => {
    process.env.LIVEKIT_E2EE_KEY = 'call-shared-passphrase';
    expect(getCallE2eeKey()).toBe('call-shared-passphrase');
  });
});
