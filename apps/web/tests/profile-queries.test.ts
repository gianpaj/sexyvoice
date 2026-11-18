import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdminClient } from '@/lib/supabase/admin';
import { getUserIdByStripeCustomerId } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

describe('Stripe customer profile lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { data: { id: 'user-1' }, expected: 'user-1' },
    { data: null, expected: undefined },
  ])(
    'resolves $expected without a user session',
    async ({ data, expected }) => {
      const single = vi.fn().mockResolvedValue({ data });
      const eq = vi.fn(() => ({ single }));
      const select = vi.fn(() => ({ eq }));
      const from = vi.fn(() => ({ select }));
      vi.mocked(createAdminClient).mockReturnValue({ from } as never);

      expect(await getUserIdByStripeCustomerId('cus_123')).toBe(expected);

      expect(createAdminClient).toHaveBeenCalledOnce();
      expect(createClient).not.toHaveBeenCalled();
      expect(from).toHaveBeenCalledWith('profiles');
      expect(select).toHaveBeenCalledWith('id');
      expect(eq).toHaveBeenCalledWith('stripe_id', 'cus_123');
    },
  );
});
