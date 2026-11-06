// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionProvider, useConnection } from '@/hooks/use-connection';

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
  invalidateQueries: vi.fn(() => Promise.resolve()),
  refetchQueries: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => mocks }));
vi.mock('@/lib/supabase/client', () => ({ default: () => ({ auth: mocks }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/hooks/use-playground-state', () => ({
  usePlaygroundState: () => ({
    dispatch: vi.fn(),
    helpers: {
      getSelectedPreset: () => null,
      getStateWithFullInstructions: () => ({ sessionConfig: { voice: 'Ara' } }),
    },
    pgState: {},
  }),
}));
vi.mock('@/lib/characters', () => ({}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => vi.clearAllMocks());

describe('connection disconnect claims', () => {
  it('refreshes only the verified subject credit cache without getUser', async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: 'claims-user' } },
      error: null,
    });
    const { result } = renderHook(useConnection, {
      wrapper: ConnectionProvider,
    });
    await act(() => result.current.disconnect());
    expect(result.current.shouldConnect).toBe(false);
    expect(mocks.refetchQueries).not.toHaveBeenCalled();
    expect(mocks.invalidateQueries).toHaveBeenCalledExactlyOnceWith({
      queryKey: ['credits', 'claims-user'],
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: null },
    { data: { claims: {} }, error: null },
    { data: { claims: { sub: '' } }, error: null },
    {
      data: { claims: { sub: 'claims-user' } },
      error: new Error('Invalid JWT'),
    },
  ])(
    'does not refresh user credit data for invalid claims %j',
    async (response) => {
      mocks.getClaims.mockResolvedValue(response);
      const { result } = renderHook(useConnection, {
        wrapper: ConnectionProvider,
      });
      await act(() => result.current.disconnect());
      expect(result.current.shouldConnect).toBe(false);
      expect(mocks.refetchQueries).not.toHaveBeenCalled();
      expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    },
  );
});

it('refreshes credits when a call is rejected for insufficient balance', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(null, { status: 402 })),
  );
  const { result } = renderHook(useConnection, { wrapper: ConnectionProvider });
  await act(async () => {
    await expect(result.current.connect()).rejects.toThrow(
      'Failed to fetch token',
    );
  });
  expect(mocks.invalidateQueries).toHaveBeenCalledExactlyOnceWith({
    queryKey: ['credits'],
  });
  expect(mocks.refetchQueries).not.toHaveBeenCalled();
  expect(result.current.shouldConnect).toBe(false);
});

it('sends a fresh browser timestamp and time zone on every connection', async () => {
  const fetch = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        Response.json({ accessToken: 'token', url: 'wss://example.test' }),
      ),
    );
  vi.stubGlobal('fetch', fetch);
  const { result } = renderHook(useConnection, { wrapper: ConnectionProvider });
  const before = Date.now();
  await act(() => result.current.connect());
  const first = JSON.parse(fetch.mock.calls[0][1].body);
  expect(first.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  expect(Date.parse(first.clientTime)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(first.clientTime)).toBeLessThanOrEqual(Date.now());
  const later = new Date(Date.now() + 60_000);
  vi.useFakeTimers();
  vi.setSystemTime(later);
  try {
    await act(() => result.current.connect());
    const second = JSON.parse(fetch.mock.calls[1][1].body);
    expect(second.clientTime).toBe(later.toISOString());
  } finally {
    vi.useRealTimers();
  }
});

it('connects when browser time zone detection fails', async () => {
  const fetch = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        Response.json({ accessToken: 'token', url: 'wss://example.test' }),
      ),
    );
  vi.stubGlobal('fetch', fetch);
  const clock = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
    throw new Error('Time zone unavailable');
  });
  try {
    const { result } = renderHook(useConnection, {
      wrapper: ConnectionProvider,
    });
    await act(() => result.current.connect());
    expect(result.current.shouldConnect).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0][1].body).timeZone).toBeUndefined();
  } finally {
    clock.mockRestore();
  }
});
