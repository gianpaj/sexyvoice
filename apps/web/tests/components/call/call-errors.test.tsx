// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CallSessionProvider,
  useCallSession,
} from '@/components/call/call-session';
import messages from '@/messages/en.json';

// What the browser shows when call-token refuses a call.

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(() => Promise.resolve()),
  toastError: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => mocks }));
vi.mock('@/lib/supabase/client', () => ({
  default: () => ({ auth: { getClaims: vi.fn() } }),
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));

const request = {
  characterId: '123e4567-e89b-12d3-a456-426614174000',
  language: 'de',
  sceneId: 'bartender-after-closing',
  sceneText: 'Meet me on the late train.',
} as const;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <CallSessionProvider>{children}</CallSessionProvider>
    </NextIntlClientProvider>
  );
}

function respond(status: number, body: object = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json(body, { status })),
  );
}

async function startCall() {
  const { result } = renderHook(useCallSession, { wrapper });
  await act(async () => {
    await result.current.connect(request);
  });
  return result;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('call-token requests', () => {
  it('sends only the per-call choices and the caller clock', async () => {
    respond(500);
    await startCall();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/call-token');
    expect(JSON.parse(String(init?.body))).toEqual({
      ...request,
      clientTime: expect.any(String),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });
});

describe('call-token errors in the browser', () => {
  it.each([
    [
      402,
      'insufficient_credits',
      messages.call.notEnoughCredits.replace('{count}', '1000'),
    ],
    [403, 'free_call_limit', messages.call.freeUserCallLimitExceeded],
    [403, 'paid_character', messages.call.upgradeRequired],
    [403, 'paid_scene', messages.call.upgradeRequired],
    [404, 'character_not_found', messages.call.characterUnavailable],
    [404, 'voice_not_found', messages.call.characterUnavailable],
  ])('explains a %i %s refusal', async (status, code, message) => {
    respond(status, { code, error: 'Refused' });
    const result = await startCall();
    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(message);
    expect(result.current.session.phase.name).toBe('idle');
  });

  it.each([400, 401, 500])(
    'reports a failed connection for status %i',
    async (status) => {
      respond(status, { error: 'Refused' });
      await startCall();
      expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(
        messages.call.connectionFailed,
      );
    },
  );

  it('reports a failed connection when the request cannot be sent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await startCall();
    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(
      messages.call.connectionFailed,
    );
  });
});
