import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/stripe/transactions/route';
import { stripe } from '@/lib/stripe/stripe-admin';
import { getUserById } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

vi.mock('@/lib/stripe/stripe-admin', () => ({
  stripe: {
    subscriptions: {
      list: vi.fn(),
    },
  },
}));

vi.mock('@/lib/supabase/queries', () => ({
  getUserById: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

describe('/api/stripe/transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: 'user_123',
              email: 'user@example.com',
            },
          },
          error: null,
        }),
      },
    } as never);
    vi.mocked(getUserById).mockResolvedValue({
      stripe_id: 'cus_owner',
    } as never);
    vi.mocked(stripe.subscriptions.list).mockResolvedValue({
      data: [
        {
          id: 'sub_123',
          created: 1_700_000_000,
          current_period_end: 1_700_086_400,
          current_period_start: 1_700_000_000,
          latest_invoice: { id: 'in_123' },
          status: 'active',
          items: {
            data: [
              {
                price: {
                  nickname: 'Starter',
                  unit_amount: 900,
                },
              },
            ],
          },
        },
      ],
    } as never);
  });

  it('rejects a customer ID that does not belong to the authenticated user', async () => {
    const response = await GET(
      new Request(
        'http://localhost/api/stripe/transactions?stripeId=cus_other',
      ) as never,
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe('Forbidden');
    expect(stripe.subscriptions.list).not.toHaveBeenCalled();
  });

  it('returns subscriptions for the authenticated user Stripe customer only', async () => {
    const response = await GET(
      new Request(
        'http://localhost/api/stripe/transactions?stripeId=cus_owner',
      ) as never,
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(stripe.subscriptions.list).toHaveBeenCalledWith({
      customer: 'cus_owner',
    });
    expect(json).toEqual([
      expect.objectContaining({
        id: 'sub_123',
        amount: 900,
        description: 'Subscription: Starter (active)',
        invoice_id: 'in_123',
      }),
    ]);
  });
});
