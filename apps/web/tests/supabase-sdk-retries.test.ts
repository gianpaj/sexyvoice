import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdminClient } from '@/lib/supabase/admin';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { ensureUserApplicationState } from '@/lib/supabase/ensure-user-application-state';

vi.unmock('@/lib/supabase/admin');

const fetchMock = vi.fn<typeof fetch>();

function readCredits() {
  return createAdminClient().from('credits').select('amount').single();
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://sdk-test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('installed Supabase retry policy', () => {
  it.each([503, 520])(
    'does not retry the middleware profile check after HTTP %s',
    async (status) => {
      fetchMock.mockImplementation(
        async () => new Response('Unavailable', { status }),
      );
      const pending = expect(
        ensureUserApplicationState({
          createdAt: '2025-08-29T11:38:46.727Z',
          email: 'test@example.com',
          id: 'test-user',
        }),
      ).rejects.toThrow('Failed to check user application state.');
      await vi.runAllTimersAsync();
      await pending;
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toContain(
        '/rest/v1/profiles?',
      );
    },
  );

  it.each([503, 520])(
    'recovers a server read after HTTP %s',
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(new Response('Temporary failure', { status }))
        .mockResolvedValueOnce(Response.json({ amount: 42 }));

      const pending = Promise.resolve(readCredits());
      await vi.runAllTimersAsync();

      expect((await pending).data).toEqual({ amount: 42 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(
        new Headers(fetchMock.mock.calls[1][1]?.headers).get('X-Retry-Count'),
      ).toBe('1');
    },
  );

  it('recovers a rejected network fetch', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(Response.json({ amount: 42 }));
    const pending = Promise.resolve(readCredits());
    await vi.runAllTimersAsync();
    expect((await pending).data).toEqual({ amount: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns a terminal error after three retries', async () => {
    fetchMock.mockImplementation(
      async () => new Response('Unavailable', { status: 503 }),
    );
    const pending = Promise.resolve(readCredits());
    await vi.runAllTimersAsync();
    expect((await pending).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not retry a 504 response', async () => {
    fetchMock.mockResolvedValue(
      new Response('Gateway Timeout', { status: 504 }),
    );
    expect((await readCredits()).status).toBe(504);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([503, 520])(
    'does not replay a credit mutation after HTTP %s',
    async (status) => {
      fetchMock.mockResolvedValue(new Response('Unavailable', { status }));
      const result = await createAdminClient().rpc('decrement_user_credits', {
        credit_amount_var: 1,
        user_id_var: 'test-user',
      });
      expect(result.status).toBe(status);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    },
  );

  it('does not retry reads in the browser client', async () => {
    fetchMock.mockResolvedValue(new Response('Unavailable', { status: 503 }));
    const result = await getSupabaseBrowserClient()
      .from('credits')
      .select('amount');
    expect(result.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops during backoff when the request is cancelled', async () => {
    const controller = new AbortController();
    let completedRequests = 0;
    fetchMock.mockImplementation(async (_url, options) => {
      options?.signal?.throwIfAborted();
      completedRequests++;
      return new Response('Unavailable', { status: 503 });
    });
    const client = createClient(
      'https://sdk-test.supabase.co',
      'sb_publishable_test',
      {
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );
    const pending = Promise.resolve(
      client.from('credits').select('amount').abortSignal(controller.signal),
    );
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.runAllTimersAsync();
    expect((await pending).error?.message).toContain('AbortError');
    expect(completedRequests).toBe(1);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
