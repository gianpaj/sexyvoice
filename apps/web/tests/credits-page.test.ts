import { captureException } from '@sentry/nextjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CreditsPage from '@/app/[lang]/(dashboard)/dashboard/credits/page';
import { getUserById } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: navigationMocks.redirect,
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('next-intl', () => ({
  useTranslations: vi.fn(() => (key: string) => key),
}));

vi.mock('next-intl/server', () => ({
  getMessages: vi.fn(async () => ({})),
  getTranslations: vi.fn(async () => vi.fn((key: string) => key)),
}));

vi.mock('@/components/pricing-table', () => ({
  default: vi.fn(() => null),
}));

vi.mock('@/lib/e2e-mocks', () => ({
  E2E_CREDIT_TRANSACTIONS: [],
  isE2E: vi.fn(() => false),
}));

vi.mock('@/lib/redis/queries', () => ({
  getCustomerData: vi.fn(),
}));

vi.mock('@/lib/stripe/pricing', () => ({
  SUBSCRIPTION_BONUS_MULTIPLIER: 1.2,
}));

vi.mock('@/lib/stripe/stripe-admin', () => ({
  createOrRetrieveCustomer: vi.fn(),
  hasAnySubscriptionHistory: vi.fn(),
  isStripeCouponUsable: vi.fn(),
  refreshCustomerSubscriptionData: vi.fn(),
}));

vi.mock('@/lib/supabase/queries', () => ({
  getUserById: vi.fn(),
}));

interface CreditsPageUser {
  email?: string;
  id: string;
}

function createSupabaseMock({
  error = null,
  user,
}: {
  error?: Error | null;
  user: CreditsPageUser | null;
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error,
      }),
    },
    from: vi.fn(),
  } as unknown as Awaited<ReturnType<typeof createClient>>;
}

describe('CreditsPage auth/profile guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects unauthenticated users instead of throwing a server error', async () => {
    vi.mocked(createClient).mockResolvedValue(
      createSupabaseMock({ user: null }),
    );

    await expect(
      CreditsPage({ params: Promise.resolve({ lang: 'en' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/en/login');

    expect(navigationMocks.redirect).toHaveBeenCalledWith('/en/login');
    expect(getUserById).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('captures missing profile rows and redirects without crashing the page', async () => {
    const user = { id: 'user-1', email: 'user@example.com' };
    vi.mocked(createClient).mockResolvedValue(createSupabaseMock({ user }));
    vi.mocked(getUserById).mockResolvedValue(null);

    await expect(
      CreditsPage({ params: Promise.resolve({ lang: 'en' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/en/dashboard/generate');

    expect(getUserById).toHaveBeenCalledWith('user-1');
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      level: 'warning',
      user,
      extra: {
        route: '/en/dashboard/credits',
      },
    });
    expect(navigationMocks.redirect).toHaveBeenCalledWith(
      '/en/dashboard/generate',
    );
  });
});
