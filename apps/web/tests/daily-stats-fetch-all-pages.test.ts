import { describe, expect, test, vi } from 'vitest';

import {
  fetchAllPages,
  isTransientQueryError,
  PAGE_MAX_ATTEMPTS,
  PAGE_SIZE,
} from '../app/api/daily-stats/utils';

const GATEWAY_TIMEOUT = { message: 'Gateway Timeout' };

// Drives `fetchAllPages` past its backoff without waiting on real timers.
async function runWithFakeTimers<T>(run: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  try {
    const promise = run();
    const settled = promise.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await vi.runAllTimersAsync();
    const result = await settled;
    if ('error' in result) throw result.error;
    return result.value;
  } finally {
    vi.useRealTimers();
  }
}

describe('isTransientQueryError', () => {
  test.each([
    ['gateway timeout from the Supabase edge', { message: 'Gateway Timeout' }],
    ['statement timeout SQLSTATE', { code: '57014', message: 'canceled' }],
    ['connection failure SQLSTATE', { code: '08006', message: 'nope' }],
    ['dropped socket', { message: 'socket hang up' }],
  ])('treats %s as transient', (_label, error) => {
    expect(isTransientQueryError(error)).toBe(true);
  });

  test.each([
    ['a constraint violation', { code: '23505', message: 'duplicate key' }],
    ['a malformed filter', { message: 'failed to parse filter' }],
    ['a non-object', 'Gateway Timeout'],
    ['null', null],
  ])('does not treat %s as transient', (_label, error) => {
    expect(isTransientQueryError(error)).toBe(false);
  });
});

describe('fetchAllPages', () => {
  test('retries a transient gateway failure and keeps paginating', async () => {
    const firstPage = Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i }));
    const offsets: number[] = [];
    let failures = 0;

    const rows = await runWithFakeTimers(() =>
      fetchAllPages<{ id: number }>((offset) => {
        offsets.push(offset);
        if (offset === 0 && failures === 0) {
          failures++;
          return Promise.resolve({ data: null, error: GATEWAY_TIMEOUT });
        }
        return Promise.resolve({
          data: offset === 0 ? firstPage : [{ id: PAGE_SIZE }],
          error: null,
        });
      }),
    );

    expect(rows).toHaveLength(PAGE_SIZE + 1);
    // Page 0 is replayed, then pagination advances normally.
    expect(offsets).toEqual([0, 0, PAGE_SIZE]);
  });

  test('gives up after the attempt budget and preserves the cause', async () => {
    let attempts = 0;

    await expect(
      runWithFakeTimers(() =>
        fetchAllPages(() => {
          attempts++;
          return Promise.resolve({ data: null, error: GATEWAY_TIMEOUT });
        }),
      ),
    ).rejects.toThrow('Gateway Timeout');

    expect(attempts).toBe(PAGE_MAX_ATTEMPTS);
  });

  test('does not retry a non-transient error', async () => {
    let attempts = 0;

    await expect(
      runWithFakeTimers(() =>
        fetchAllPages(() => {
          attempts++;
          return Promise.resolve({
            data: null,
            error: { code: '42703', message: 'column does not exist' },
          });
        }),
      ),
    ).rejects.toThrow('column does not exist');

    expect(attempts).toBe(1);
  });

  test('retries a rejected query builder promise', async () => {
    let attempts = 0;

    const rows = await runWithFakeTimers(() =>
      fetchAllPages<{ id: number }>(() => {
        attempts++;
        if (attempts === 1) {
          return Promise.reject(new Error('fetch failed'));
        }
        return Promise.resolve({ data: [{ id: 1 }], error: null });
      }),
    );

    expect(rows).toEqual([{ id: 1 }]);
    expect(attempts).toBe(2);
  });
});
