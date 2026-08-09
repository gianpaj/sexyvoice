import { beforeEach, describe, expect, it, vi } from 'vitest';

import ApiKeysPage from '@/app/[lang]/(dashboard)/dashboard/api-keys/page';
import GeneratePage from '@/app/[lang]/(dashboard)/dashboard/generate/page';
import { hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: navigationMocks.redirect,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => vi.fn((key: string) => key)),
}));

vi.mock('@/components/credits-section', () => ({
  default: vi.fn(() => null),
}));

vi.mock('@/app/[lang]/(dashboard)/dashboard/api-keys/api-keys', () => ({
  ApiKeys: vi.fn(() => null),
}));

vi.mock(
  '@/app/[lang]/(dashboard)/dashboard/generate/generateui.client',
  () => ({
    GenerateUI: vi.fn(() => null),
  }),
);

vi.mock('@/lib/supabase/queries', () => ({
  hasUserPaid: vi.fn(),
}));

const createSupabaseMock = (result: unknown) => {
  const from = vi.fn();
  const getClaims = vi.fn().mockResolvedValue(result);
  const supabase = {
    auth: { getClaims },
    from,
  } as unknown as Awaited<ReturnType<typeof createClient>>;

  return { from, getClaims, supabase };
};

describe('dashboard page claims authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes API key entitlement checks to the verified subject', async () => {
    const { getClaims, supabase } = createSupabaseMock({
      data: { claims: { sub: 'claims-user-id' } },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue(supabase);
    vi.mocked(hasUserPaid).mockResolvedValue(true);

    await ApiKeysPage({ params: Promise.resolve({ lang: 'en' }) });

    expect(getClaims).toHaveBeenCalledOnce();
    expect(hasUserPaid).toHaveBeenCalledWith('claims-user-id');
  });

  it('does not run entitlement queries when claims are unavailable', async () => {
    const { supabase } = createSupabaseMock({
      data: null,
      error: new Error('Invalid JWT'),
    });
    vi.mocked(createClient).mockResolvedValue(supabase);

    await ApiKeysPage({ params: Promise.resolve({ lang: 'en' }) });

    expect(hasUserPaid).not.toHaveBeenCalled();
  });

  it('redirects missing dashboard claims to the localized login page', async () => {
    const { from, supabase } = createSupabaseMock({
      data: null,
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue(supabase);

    await expect(
      GeneratePage({ params: Promise.resolve({ lang: 'de' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/de/login');

    expect(navigationMocks.redirect).toHaveBeenCalledWith('/de/login');
    expect(from).not.toHaveBeenCalled();
    expect(hasUserPaid).not.toHaveBeenCalled();
  });
});
