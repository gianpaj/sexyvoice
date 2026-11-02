import { describe, expect, it, vi } from 'vitest';

import { getVerifiedClaims } from '@/lib/supabase/auth';

const createSupabaseMock = (result: unknown) => {
  const getClaims = vi.fn().mockResolvedValue(result);
  const supabase = {
    auth: { getClaims },
  } as unknown as Parameters<typeof getVerifiedClaims>[0];

  return { getClaims, supabase };
};

describe('getVerifiedClaims', () => {
  it('returns claims after Supabase verifies the JWT', async () => {
    const claims = {
      email: 'user@example.com',
      sub: 'user-1',
    };
    const { getClaims, supabase } = createSupabaseMock({
      data: { claims },
      error: null,
    });

    await expect(getVerifiedClaims(supabase)).resolves.toEqual(claims);
    expect(getClaims).toHaveBeenCalledOnce();
  });

  it('fails closed when claim verification returns an error', async () => {
    const { supabase } = createSupabaseMock({
      data: null,
      error: new Error('Invalid JWT'),
    });

    await expect(getVerifiedClaims(supabase)).resolves.toBeNull();
  });

  it('fails closed when no claims are available', async () => {
    const { supabase } = createSupabaseMock({
      data: null,
      error: null,
    });

    await expect(getVerifiedClaims(supabase)).resolves.toBeNull();
  });
});
