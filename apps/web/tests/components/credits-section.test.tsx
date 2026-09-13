// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CreditsSection from '@/components/credits-section';
import { getCredits } from '@/lib/supabase/queries.client';
import messages from '@/messages/en.json';

vi.mock('@/lib/supabase/queries.client', () => ({
  getCredits: vi.fn(),
  hasUserPaid: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/supabase/client', () => ({
  default: () => supabase,
}));
const supabase = {
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
};
vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => ({ isMobile: false }),
}));
vi.mock('@/lib/posthog-browser', () => ({ initPostHog: vi.fn() }));
vi.mock('crisp-sdk-web', () => ({ Crisp: {} }));

function renderCredits() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe('credit balance display', () => {
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
  });
});
