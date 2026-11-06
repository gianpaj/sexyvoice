// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionProvider, useConnection } from '@/hooks/use-connection';

// What the browser shows when call-token refuses a call.

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(() => Promise.resolve()),
  toastError: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => mocks }));
vi.mock('@/lib/supabase/client', () => ({
  default: () => ({ auth: { getClaims: vi.fn() } }),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));
vi.mock('@/hooks/use-playground-state', () => ({
  usePlaygroundState: () => ({
    pgState: {
      language: 'de',
      sceneInstructions: 'Meet me on the late train.',
      selectedPresetId: '123e4567-e89b-12d3-a456-426614174000',
      selectedSceneId: 'bartender-after-closing',
    },
  }),
}));

function respond(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ error: 'Refused' }, { status })),
  );
}

async function startCall() {
  const { result } = renderHook(useConnection, { wrapper: ConnectionProvider });
  await act(async () => {
    await result.current.connect().catch(() => undefined);
  });
  return result;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('call-token requests', () => {
  it('sends only the per-call choices', async () => {
    respond(500);
    await startCall();
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/call-token');
    expect(JSON.parse(String(init?.body))).toEqual({
      characterId: '123e4567-e89b-12d3-a456-426614174000',
      language: 'de',
      sceneId: 'bartender-after-closing',
      sceneText: 'Meet me on the late train.',
    });
  });
});

describe('call-token errors in the browser', () => {
  it('names the minimum credits for a call', async () => {
    respond(402);
    await startCall();
    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(
      'notEnoughCredits {"count":1000}',
    );
  });

  it('shows the free call limit for a refused call', async () => {
    respond(403);
    await startCall();
    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(
      'freeUserCallLimitExceeded',
    );
  });

  it.each([400, 404, 500])('shows nothing for status %i', async (status) => {
    respond(status);
    const result = await startCall();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(result.current.shouldConnect).toBe(false);
  });
});
