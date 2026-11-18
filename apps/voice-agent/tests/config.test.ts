import { describe, expect, it } from 'vitest';

import { parseJob } from '../src/config.ts';

describe('JS spike admission', () => {
  const metadata = JSON.stringify({
    runtime: 'agents-js-spike',
    userId: 'test-user',
    expiresAt: 2000,
  });
  it('requires an explicit environment and allowed user', () => {
    expect(() =>
      parseJob(metadata, { VOICE_SPIKE_USER_IDS: 'test-user' }, 1000),
    ).toThrow();
    expect(() =>
      parseJob(
        metadata,
        { VOICE_SPIKE_USER_IDS: 'other', VOICE_SPIKE_ENABLED: 'true' },
        1000,
      ),
    ).toThrow();
  });
  it('rejects expired, foreign, or malformed dispatches', () => {
    const env = {
      VOICE_SPIKE_USER_IDS: 'test-user',
      VOICE_SPIKE_ENABLED: 'true',
    };
    expect(() => parseJob(metadata, env, 2000)).toThrow();
    expect(() => parseJob('{}', env, 1000)).toThrow();
    expect(() =>
      parseJob(metadata.replace('agents-js-spike', 'python'), env, 1000),
    ).toThrow();
    expect(() =>
      parseJob(metadata, { ...env, VERCEL_ENV: 'production' }, 1000),
    ).toThrow();
  });
  it('validates an optional resolved Inworld voice', () => {
    const env = {
      VOICE_SPIKE_USER_IDS: 'test-user',
      VOICE_SPIKE_ENABLED: 'true',
    };
    const dispatch = (inworldVoiceId: unknown) =>
      JSON.stringify({ ...JSON.parse(metadata), inworldVoiceId });
    expect(parseJob(dispatch('workspace__clone'), env, 1000)).toMatchObject({
      inworldVoiceId: 'workspace__clone',
    });
    for (const invalid of ['', ' ', null, 123]) {
      expect(() => parseJob(dispatch(invalid), env, 1000)).toThrow();
    }
  });

  it('accepts only the server-issued bounded test dispatch', () => {
    expect(
      parseJob(
        metadata,
        { VOICE_SPIKE_USER_IDS: 'test-user', VOICE_SPIKE_ENABLED: 'true' },
        1000,
      ).userId,
    ).toBe('test-user');
  });
});
