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

const mockGetUser = vi.fn();

describe('/api/stripe/transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: {
            claims: {
              sub: 'user_123',
            },
          },
          error: null,
        }),
        getUser: mockGetUser,
      },
    } as never);
    vi.mocked(getUserById).mockResolvedValue({
      stripe_id: 'cus_owner',
    } as never);
    vi.mocked(stripe.subscriptions.list).mockResolvedValue({
      data: [
        {
          created: 1_700_000_000,
          current_period_end: 1_700_086_400,
          current_period_start: 1_700_000_000,
          id: 'sub_123',
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
          latest_invoice: { id: 'in_123' },
          status: 'active',
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
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(stripe.subscriptions.list).toHaveBeenCalledWith({
      customer: 'cus_owner',
    });
    expect(json).toEqual([
      expect.objectContaining({
        amount: 900,
        description: 'Subscription: Starter (active)',
        id: 'sub_123',
        invoice_id: 'in_123',
      }),
    ]);
  });
});

describe.each([
  [
    'GET',
    () =>
      GET(
        new Request(
          'http://localhost/api/stripe/transactions?stripeId=cus_owner',
        ) as never,
      ),
  ],
] as const)('%s claims authentication', (_method, invoke) => {
  it.each([
    ['missing data', { data: null, error: null }],
    ['missing claims', { data: { claims: null }, error: null }],
    ['missing subject', { data: { claims: {} }, error: null }],
    ['empty subject', { data: { claims: { sub: '' } }, error: null }],
    ['invalid token', { data: null, error: { message: 'Invalid JWT' } }],
    [
      'SDK error with claims',
      {
        data: { claims: { sub: 'test-user-id' } },
        error: { message: 'Verification failed' },
      },
    ],
  ])('rejects %s before data access', async (_name, result) => {
    vi.clearAllMocks();

    const from = vi.fn();
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { getClaims: vi.fn().mockResolvedValue(result), getUser: vi.fn() },
      from,
    } as never);

    const response = await invoke();

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'Unauthorized' });

    expect(from).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
    expect(stripe.subscriptions.list).not.toHaveBeenCalled();
  });
});
