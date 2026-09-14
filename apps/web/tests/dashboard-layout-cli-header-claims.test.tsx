// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DashboardLayout from '@/app/[lang]/(dashboard)/layout';
import CliLoginPage from '@/app/[lang]/cli/login/page';
import { Header } from '@/components/header';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getClaims: vi.fn(),
  getCreditsQuery: vi.fn(),
  getCreditTransactions: vi.fn(),
  getUser: vi.fn(() => {
    throw new Error('getUser is forbidden');
  }),
  hasUserPaid: vi.fn(),
  prefetchQuery: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: mocks, from: mocks.from }),
}));
vi.mock('@/lib/supabase/queries', () => ({ hasUserPaid: mocks.hasUserPaid }));
vi.mock('@/lib/supabase/queries.client', () => ({
  getCreditsQuery: mocks.getCreditsQuery,
  getCreditTransactions: mocks.getCreditTransactions,
}));
vi.mock('@supabase-cache-helpers/postgrest-react-query', () => ({
  prefetchQuery: mocks.prefetchQuery,
}));
vi.mock('@/lib/e2e-mocks', () => ({ isE2E: () => false }));
vi.mock('@/lib/banners/resolve-banner', () => ({
  resolveActiveBanner: () => null,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [] }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(url);
  },
}));
vi.mock('next-intl/server', () => ({
  getMessages: async () => ({
    header: { generate: 'Generate', login: 'Login', signup: 'Signup' },
  }),
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/components/footer', () => ({ default: () => null }));
vi.mock('@/components/header-static', () => ({ HeaderStatic: () => null }));
vi.mock('@/app/[lang]/cli/login/cli-login-client', () => ({
  CliLoginClient: () => null,
}));
vi.mock('@/app/[lang]/(dashboard)/dashboard.ui', () => ({
  default: () => null,
}));
vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const layout = () =>
  DashboardLayout({ children: null, params: Promise.resolve({ lang: 'en' }) });
const cli = () =>
  CliLoginPage({
    params: Promise.resolve({ lang: 'en' }),
    searchParams: Promise.resolve({
      callback_url: 'http://127.0.0.1:3456/callback',
      state: 'test-state',
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClaims.mockResolvedValue({
    data: { claims: { sub: 'claims-user' } },
    error: null,
  });
  mocks.hasUserPaid.mockResolvedValue(false);
  mocks.getCreditTransactions.mockResolvedValue({ data: [] });
});

describe('layout, CLI login, and header claims', () => {
  it('prefetches dashboard data for the verified subject without getUser', async () => {
    expect(await layout()).not.toBeNull();
    expect(mocks.getCreditTransactions).toHaveBeenCalledWith(
      expect.anything(),
      'claims-user',
    );
    expect(mocks.getCreditsQuery).toHaveBeenCalledWith(
      expect.anything(),
      'claims-user',
    );
    expect(mocks.hasUserPaid).toHaveBeenCalledWith('claims-user');
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('scopes CLI keys to the verified subject without getUser', async () => {
    const query = {
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [] }),
      select: vi.fn().mockReturnThis(),
    };
    mocks.from.mockReturnValue(query);
    await cli();
    expect(mocks.from).toHaveBeenCalledWith('api_keys');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'claims-user');
    expect(query.eq).toHaveBeenCalledWith('is_active', true);
    expect(mocks.hasUserPaid).toHaveBeenCalledWith('claims-user');
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('shows authenticated header links with a verified subject', async () => {
    const html = renderToStaticMarkup(await Header({ lang: 'en' }));
    expect(html).toContain('/dashboard/generate');
    expect(html).not.toContain('href="/login"');
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
    'denies user-scoped data and shows logged-out links for invalid claims %j',
    async (response) => {
      mocks.getClaims.mockResolvedValue(response);
      expect(await layout()).toBeNull();
      await expect(cli()).rejects.toThrow('/en/login?redirect_to=');
      const html = renderToStaticMarkup(await Header({ lang: 'en' }));
      expect(html).toContain('href="/login"');
      expect(html).not.toContain('/dashboard/generate');
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.hasUserPaid).not.toHaveBeenCalled();
      expect(mocks.getCreditTransactions).not.toHaveBeenCalled();
      expect(mocks.prefetchQuery).not.toHaveBeenCalled();
      expect(mocks.getUser).not.toHaveBeenCalled();
    },
  );
});
