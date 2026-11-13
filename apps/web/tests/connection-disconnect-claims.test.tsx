// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CallSessionProvider,
  useCallSession,
} from '@/components/call/call-session';

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
  invalidateQueries: vi.fn(() => Promise.resolve()),
  refetchQueries: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => mocks }));
vi.mock('@/lib/supabase/client', () => ({ default: () => ({ auth: mocks }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }));

async function hangUpConnectedCall() {
  const { result } = renderHook(useCallSession, {
    wrapper: CallSessionProvider,
  });
  await act(async () => {
    await result.current.connect({ characterId: 'character-id' });
  });
  act(() => result.current.roomConnected());
  await act(async () => {
    result.current.disconnect();
    await Promise.resolve();
  });
  return result;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ accessToken: 'token', url: 'wss://test.livekit.cloud' }),
    ),
  );
});

describe('connection disconnect claims', () => {
  it('refreshes only the verified subject credit cache without getUser', async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: 'claims-user' } },
      error: null,
    });
    const result = await hangUpConnectedCall();
    expect(result.current.session.phase.name).toBe('idle');
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
      const result = await hangUpConnectedCall();
      expect(result.current.session.phase.name).toBe('idle');
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
  const { result } = renderHook(useCallSession, {
    wrapper: CallSessionProvider,
  });
  await act(async () => {
    await expect(
      result.current.connect({ characterId: 'character-id' }),
    ).resolves.toBe('failed');
  });
  expect(mocks.invalidateQueries).toHaveBeenCalledExactlyOnceWith({
    queryKey: ['credits'],
  });
  expect(mocks.refetchQueries).not.toHaveBeenCalled();
  expect(result.current.session.phase.name).toBe('idle');
});

function tokenRequestBody(call: number) {
  const [, init] = vi.mocked(fetch).mock.calls[call];
  return JSON.parse(String(init?.body));
}

it('sends a fresh browser timestamp and time zone on every connection', async () => {
  mocks.getClaims.mockResolvedValue({ data: null, error: null });
  const before = Date.now();
  const result = await hangUpConnectedCall();
  const first = tokenRequestBody(0);
  expect(first.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  expect(Date.parse(first.clientTime)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(first.clientTime)).toBeLessThanOrEqual(Date.now());

  const later = new Date(Date.now() + 60_000);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(later);
  try {
    await act(async () => {
      await result.current.connect({ characterId: 'character-id' });
    });
    expect(tokenRequestBody(1).clientTime).toBe(later.toISOString());
  } finally {
    vi.useRealTimers();
  }
});

it('connects when browser time zone detection fails', async () => {
  const clock = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
    throw new Error('Time zone unavailable');
  });
  try {
    const { result } = renderHook(useCallSession, {
      wrapper: CallSessionProvider,
    });
    await act(async () => {
      await expect(
        result.current.connect({ characterId: 'character-id' }),
      ).resolves.toBe('started');
    });
    expect(tokenRequestBody(0).timeZone).toBeUndefined();
  } finally {
    clock.mockRestore();
  }
});
