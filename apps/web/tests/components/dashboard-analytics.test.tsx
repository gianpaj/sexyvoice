// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { Crisp } from 'crisp-sdk-web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardAnalytics } from '@/components/dashboard-analytics';
import { invalidateCredits } from '@/lib/credits-query';
import { initPostHog } from '@/lib/posthog-browser';
import { getCredits, hasUserPaid } from '@/lib/supabase/queries.client';

vi.mock('@/lib/supabase/queries.client', () => ({
  getCredits: vi.fn(),
  hasUserPaid: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/supabase/client', () => ({
  default: () => supabase,
}));
const supabase = {
  auth: {
    getClaims: vi.fn(),
    getUser: vi.fn(),
  },
};
vi.mock('@/lib/posthog-browser', () => ({ initPostHog: vi.fn() }));
vi.mock('crisp-sdk-web', () => ({
  Crisp: {
    configure: vi.fn(),
    session: { setData: vi.fn() },
    user: { setEmail: vi.fn(), setNickname: vi.fn() },
  },
}));

function renderAnalytics() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <DashboardAnalytics lang="en" userId="user-1" />
    </QueryClientProvider>,
  );
  return client;
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getClaims.mockResolvedValue({ data: null, error: null });
});

describe('dashboard analytics', () => {
  it.each([
    undefined,
    null,
    {},
    { full_name: 'Test Name' },
    { username: 'tester' },
  ])(
    'identifies the claims subject with optional metadata %j',
    async (user_metadata) => {
      vi.stubEnv('NEXT_PUBLIC_CRISP_WEBSITE_ID', 'test-site');
      const identify = vi.fn();
      vi.mocked(initPostHog).mockResolvedValue({ identify } as never);
      supabase.auth.getClaims.mockResolvedValue({
        data: {
          claims: {
            email: 'claims@example.com',
            sub: 'claims-user',
            user_metadata,
          },
        },
        error: null,
      });
      vi.mocked(getCredits).mockResolvedValue({ amount: 100 });
      renderAnalytics();
      await waitFor(() =>
        expect(identify).toHaveBeenCalledWith(
          'claims-user',
          expect.objectContaining({
            creditsLeft: 100,
            email: 'claims@example.com',
          }),
        ),
      );
      expect(hasUserPaid).toHaveBeenCalledWith(supabase, 'claims-user');
      expect(Crisp.session.setData).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'claims-user' }),
      );
      if (!user_metadata || Object.keys(user_metadata).length === 0) {
        expect(Crisp.user.setNickname).not.toHaveBeenCalled();
      } else {
        expect(Crisp.user.setNickname).toHaveBeenCalledWith(
          'full_name' in user_metadata
            ? user_metadata.full_name
            : user_metadata.username,
        );
      }
      expect(supabase.auth.getUser).not.toHaveBeenCalled();
    },
  );

  it.each([
    { data: null, error: null },
    { data: { claims: {} }, error: null },
    { data: { claims: { sub: '' } }, error: null },
    { data: { claims: { sub: 'user-1' } }, error: new Error('Invalid JWT') },
  ])(
    'skips paid lookup and analytics for invalid claims %j',
    async (response) => {
      supabase.auth.getClaims.mockResolvedValue(response);
      vi.mocked(getCredits).mockResolvedValue({ amount: 100 });
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      renderAnalytics();
      await waitFor(() =>
        expect(consoleError).toHaveBeenCalledWith(
          'Failed to initialize dashboard layout:',
          expect.any(Error),
        ),
      );
      expect(hasUserPaid).not.toHaveBeenCalled();
      expect(initPostHog).not.toHaveBeenCalled();
      expect(Crisp.configure).not.toHaveBeenCalled();
      consoleError.mockRestore();
    },
  );

  it('sends the refreshed balance to Crisp after credits are spent', async () => {
    vi.stubEnv('NEXT_PUBLIC_CRISP_WEBSITE_ID', 'test-site');
    supabase.auth.getClaims.mockResolvedValue({
      data: { claims: { sub: 'user-1' } },
      error: null,
    });
    vi.mocked(initPostHog).mockResolvedValue(undefined as never);
    vi.mocked(getCredits)
      .mockResolvedValueOnce({ amount: 10_000 })
      .mockResolvedValueOnce({ amount: 725 });
    const client = renderAnalytics();
    await waitFor(() =>
      expect(Crisp.session.setData).toHaveBeenLastCalledWith(
        expect.objectContaining({ creditsLeft: 10_000 }),
      ),
    );
    await act(() => invalidateCredits(client));
    await waitFor(() =>
      expect(Crisp.session.setData).toHaveBeenLastCalledWith(
        expect.objectContaining({ creditsLeft: 725, user_id: 'user-1' }),
      ),
    );
  });
});
