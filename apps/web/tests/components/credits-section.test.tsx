// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Crisp } from 'crisp-sdk-web';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CreditsSection from '@/components/credits-section';
import { initPostHog } from '@/lib/posthog-browser';
import { getCredits, hasUserPaid } from '@/lib/supabase/queries.client';
import messages from '@/messages/en.json';

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
const refresh = vi.hoisted(() => vi.fn());
vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  useRouter: () => ({ refresh }),
}));
vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => ({ isMobile: false }),
}));
vi.mock('@/lib/posthog-browser', () => ({ initPostHog: vi.fn() }));
vi.mock('crisp-sdk-web', () => ({
  Crisp: {
    configure: vi.fn(),
    session: { setData: vi.fn() },
    user: { setEmail: vi.fn(), setNickname: vi.fn() },
  },
}));

function renderCredits() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <CreditsSection
          creditTransactions={[{ amount: 10_000 }]}
          lang="en"
          showMinutes
          userId="user-1"
        />
      </NextIntlClientProvider>
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

describe('credit balance display', () => {
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
      renderCredits();
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
      renderCredits();
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
  it('renders a confirmed zero balance and zero progress', async () => {
    vi.mocked(getCredits).mockResolvedValue({ amount: 0 });
    renderCredits();
    expect(await screen.findByText('0')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    expect(screen.getByText('~0 min')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    null,
    {},
    { amount: undefined },
    { amount: null },
    { amount: Number.NaN },
  ])('shows an error instead of a fake balance for %j', async (data) => {
    vi.mocked(getCredits).mockResolvedValue(
      data as Awaited<ReturnType<typeof getCredits>>,
    );
    renderCredits();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      messages.creditsSection.balanceError,
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('recovers from a failed lookup when retry succeeds', async () => {
    vi.mocked(getCredits)
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce({ amount: 10_000 });
    renderCredits();
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        '100',
      ),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(getCredits).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('does not present a cached balance as current after a failed refresh', async () => {
    vi.mocked(getCredits)
      .mockResolvedValueOnce({ amount: 10_000 })
      .mockRejectedValueOnce(new Error('Network failure'));
    const client = renderCredits();
    await screen.findByRole('progressbar');
    await act(() => client.invalidateQueries({ queryKey: ['credits'] }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
  it('displays a negative stored balance instead of a lookup error', async () => {
    vi.mocked(getCredits).mockResolvedValue({ amount: -10 });
    renderCredits();
    expect(await screen.findByText('-10')).toBeVisible();
    expect(screen.getByText('~0 min')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('recovers from a successful response with an invalid balance', async () => {
    vi.mocked(getCredits)
      .mockResolvedValueOnce({ amount: Number.NaN })
      .mockResolvedValueOnce({ amount: 0 });
    renderCredits();
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('0')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(getCredits).toHaveBeenCalledTimes(2);
  });
});
