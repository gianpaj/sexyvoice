import { captureException, captureMessage } from '@sentry/nextjs';
import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCheckoutSession } from '@/app/[lang]/actions/stripe';
import {
  AccountBillingError,
  acquireAccountBillingOperation,
  releaseAccountBillingOperation,
} from '@/lib/stripe/account-billing';
import {
  hasAnySubscriptionHistory,
  isStripeCouponUsable,
  stripe,
} from '@/lib/stripe/stripe-admin';
import { getUserById } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  default: {},
}));

const stripeTransport = vi.hoisted(() => ({
  create: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/lib/stripe/stripe-admin', async () => {
  const { default: Stripe } = await import('stripe');
  const client = new Stripe('sk_test_checkout', {
    httpClient: Stripe.createFetchHttpClient(stripeTransport.fetch),
    maxNetworkRetries: 0,
  });
  stripeTransport.create.mockImplementation(
    client.checkout.sessions.create.bind(client.checkout.sessions),
  );
  vi.spyOn(client.checkout.sessions, 'create');
  return {
    hasAnySubscriptionHistory: vi.fn(),
    isStripeCouponUsable: vi.fn(),
    stripe: client,
  };
});

vi.mock('@/lib/stripe/account-billing', async (importOriginal) => {
  const { AccountBillingError } =
    await importOriginal<typeof import('@/lib/stripe/account-billing')>();
  return {
    AccountBillingError,
    acquireAccountBillingOperation: vi.fn(),
    releaseAccountBillingOperation: vi.fn(),
  };
});

vi.mock('@/lib/supabase/queries', () => ({
  getUserById: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

describe('createCheckoutSession()', () => {
  const originalE2ETestMode = process.env.E2E_TEST_MODE;
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const originalStarterPriceId = process.env.STRIPE_TOPUP_STARTER_PRICE_ID;
  const originalSubscriptionStarterPriceId =
    process.env.STRIPE_SUBSCRIPTION_STARTER_PRICE_ID;
  const originalSubscriptionCouponId =
    process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID;

  beforeEach(() => {
    vi.clearAllMocks();
    stripeTransport.fetch.mockReset();
    vi.mocked(acquireAccountBillingOperation).mockResolvedValue({
      checkoutExpiresAt: 1_800_000_000,
      token: 'checkout-token',
      userId: 'user_123',
    });

    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';
    process.env.STRIPE_TOPUP_STARTER_PRICE_ID = 'price_topup_starter';
    process.env.STRIPE_SUBSCRIPTION_STARTER_PRICE_ID =
      'price_subscription_starter';

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'user_123' } },
          error: null,
        }),
        getUser: vi.fn(),
      },
    } as never);
    vi.mocked(getUserById).mockResolvedValue({
      stripe_id: 'cus_123',
    } as never);
    vi.mocked(hasAnySubscriptionHistory).mockResolvedValue(false);
    vi.mocked(isStripeCouponUsable).mockResolvedValue(true);
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
      client_secret: 'client_secret_123',
      url: 'https://checkout.stripe.com/session',
    } as never);
  });

  afterEach(() => {
    if (originalE2ETestMode === undefined) {
      delete process.env.E2E_TEST_MODE;
    } else {
      process.env.E2E_TEST_MODE = originalE2ETestMode;
    }

    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalVercelEnv;
    }

    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    }

    if (originalStarterPriceId === undefined) {
      delete process.env.STRIPE_TOPUP_STARTER_PRICE_ID;
    } else {
      process.env.STRIPE_TOPUP_STARTER_PRICE_ID = originalStarterPriceId;
    }

    if (originalSubscriptionStarterPriceId === undefined) {
      delete process.env.STRIPE_SUBSCRIPTION_STARTER_PRICE_ID;
    } else {
      process.env.STRIPE_SUBSCRIPTION_STARTER_PRICE_ID =
        originalSubscriptionStarterPriceId;
    }

    if (originalSubscriptionCouponId === undefined) {
      delete process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID;
    } else {
      process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID =
        originalSubscriptionCouponId;
    }
  });

  it.each([
    { data: null, error: null },
    { data: { claims: {} }, error: null },
    { data: { claims: { sub: '' } }, error: null },
    { data: { claims: { sub: 'user_123' } }, error: new Error('Invalid JWT') },
  ])(
    'denies checkout before customer lookup for invalid claims %j',
    async (response) => {
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          getClaims: vi.fn().mockResolvedValue(response),
          getUser: vi.fn(),
        },
      } as never);
      for (const type of ['topup', 'subscription']) {
        const formData = new FormData();
        formData.set('type', type);
        await expect(
          createCheckoutSession(formData, 'starter'),
        ).rejects.toThrow('Unauthorized checkout session request');
      }
      expect(getUserById).not.toHaveBeenCalled();
      expect(hasAnySubscriptionHistory).not.toHaveBeenCalled();
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    },
  );

  it('uses the claims subject for checkout without requiring email', async () => {
    await createCheckoutSession(new FormData(), 'starter');
    expect(getUserById).toHaveBeenCalledWith('user_123');
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        metadata: expect.objectContaining({ userId: 'user_123' }),
      }),
      { idempotencyKey: 'checkout-token' },
    );
    expect((await createClient()).auth.getUser).not.toHaveBeenCalled();
    expect(acquireAccountBillingOperation).toHaveBeenCalledWith(
      'user_123',
      'checkout',
    );
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ expires_at: 1_800_000_000 }),
      { idempotencyKey: 'checkout-token' },
    );
    expect(releaseAccountBillingOperation).toHaveBeenCalled();
  });

  it('fails closed when billing coordination is unavailable', async () => {
    vi.mocked(acquireAccountBillingOperation).mockRejectedValueOnce(
      new Error('Account unavailable'),
    );

    await expect(
      createCheckoutSession(new FormData(), 'starter'),
    ).rejects.toThrow('Account unavailable');

    expect(getUserById).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(releaseAccountBillingOperation).not.toHaveBeenCalled();
  });

  it.each([
    ['accountBillingBlocked', 'checkout_billing_blocked'],
    ['accountBillingBusy', 'checkout_billing_busy'],
  ] as const)(
    'returns %s and reports %s separately from Stripe failures',
    async (code, eventType) => {
      vi.mocked(acquireAccountBillingOperation).mockRejectedValueOnce(
        new AccountBillingError(code),
      );

      await expect(
        createCheckoutSession(new FormData(), 'starter'),
      ).resolves.toEqual({
        client_secret: null,
        error: code,
        url: null,
      });

      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
      expect(captureException).not.toHaveBeenCalled();
      expect(captureMessage).toHaveBeenCalledWith(
        'Checkout blocked by account billing state.',
        {
          level: 'info',
          tags: { event_type: eventType, section: 'stripe_actions' },
          user: { id: 'user_123' },
        },
      );
    },
  );

  it('retains the reservation when Stripe creation has an unknown outcome', async () => {
    vi.mocked(stripe.checkout.sessions.create).mockRejectedValueOnce(
      new Error('Connection lost'),
    );

    await expect(
      createCheckoutSession(new FormData(), 'starter'),
    ).rejects.toThrow('Connection lost');

    expect(releaseAccountBillingOperation).not.toHaveBeenCalled();
  });

  const validationCodes = [
    'parameter_invalid_empty',
    'parameter_invalid_integer',
    'parameter_invalid_string_blank',
    'parameter_invalid_string_empty',
    'parameter_missing',
    'parameter_unknown',
    'parameters_exclusive',
  ];

  function rejectThroughStripe(
    status: number,
    code?: string,
    type = 'invalid_request_error',
    headers?: Record<string, string>,
  ) {
    stripeTransport.fetch.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            error: { code, message: 'Checkout rejected', type },
          }),
          {
            headers,
            status,
          },
        ),
    );
    vi.mocked(stripe.checkout.sessions.create).mockImplementationOnce(
      (...args) => stripeTransport.create(...args),
    );
  }

  it.each([
    ...validationCodes.map((code) => ({ code, status: 400 })),
    { code: undefined, status: 401 },
    { code: undefined, status: 403 },
  ])(
    'releases a single-attempt $status/$code rejection',
    async ({ status, code }) => {
      rejectThroughStripe(status, code);

      await expect(
        createCheckoutSession(new FormData(), 'starter'),
      ).rejects.toMatchObject({
        statusCode: status,
      });

      expect(stripeTransport.fetch).toHaveBeenCalledTimes(1);
      expect(releaseAccountBillingOperation).toHaveBeenCalledWith({
        checkoutExpiresAt: 1_800_000_000,
        token: 'checkout-token',
        userId: 'user_123',
      });
    },
  );

  it.each([
    { status: 400, type: 'invalid_request_error' },
    { status: 400, type: 'api_error' },
    { status: 400, type: 'idempotency_error' },
    { status: 402, type: 'card_error' },
    { status: 404, type: 'invalid_request_error' },
    { status: 409, type: 'invalid_request_error' },
    { status: 422, type: 'invalid_request_error' },
    { status: 424, type: 'api_error' },
    { status: 429, type: 'rate_limit_error' },
    ...[500, 502, 503, 504].map((status) => ({ status, type: 'api_error' })),
  ])(
    'retains an unclassified $status/$type rejection',
    async ({ status, type }) => {
      rejectThroughStripe(status, undefined, type);

      await expect(
        createCheckoutSession(new FormData(), 'starter'),
      ).rejects.toMatchObject({
        statusCode: status,
      });

      expect(releaseAccountBillingOperation).not.toHaveBeenCalled();
    },
  );

  it('retains a validation error when Stripe requests a retry', async () => {
    rejectThroughStripe(400, 'parameter_missing', 'invalid_request_error', {
      'stripe-should-retry': 'true',
    });

    await expect(
      createCheckoutSession(new FormData(), 'starter'),
    ).rejects.toThrow();

    expect(releaseAccountBillingOperation).not.toHaveBeenCalled();
  });

  it('retains a status-shaped error that is not a Stripe error', async () => {
    vi.mocked(stripe.checkout.sessions.create).mockRejectedValueOnce({
      code: 'parameter_missing',
      statusCode: 400,
      type: 'invalid_request_error',
    });

    await expect(
      createCheckoutSession(new FormData(), 'starter'),
    ).rejects.toBeDefined();

    expect(releaseAccountBillingOperation).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 429])(
    'retains a final %i rejection after an SDK retry of an unknown outcome',
    async (status) => {
      rejectThroughStripe(
        status,
        status === 400 ? 'parameter_missing' : undefined,
      );
      stripeTransport.fetch.mockRejectedValueOnce(new Error('Connection lost'));
      vi.mocked(stripe.checkout.sessions.create)
        .mockReset()
        .mockImplementationOnce(
          (
            params?:
              | Stripe.Checkout.SessionCreateParams
              | Stripe.RequestOptions,
            options?: Stripe.RequestOptions,
          ) =>
            stripeTransport.create(params, {
              ...options,
              maxNetworkRetries: 1,
            }),
        );

      await expect(
        createCheckoutSession(new FormData(), 'starter'),
      ).rejects.toMatchObject({
        statusCode: status,
      });

      expect(stripeTransport.fetch).toHaveBeenCalledTimes(2);
      for (const [, options] of stripeTransport.fetch.mock.calls) {
        expect(new Headers(options.headers).get('Idempotency-Key')).toBe(
          'checkout-token',
        );
      }
      expect(releaseAccountBillingOperation).not.toHaveBeenCalled();
    },
  );

  it('keeps retry counts separate for concurrent checkouts', async () => {
    vi.mocked(acquireAccountBillingOperation)
      .mockResolvedValueOnce({
        checkoutExpiresAt: 1_800_000_000,
        token: 'retrying',
        userId: 'user-a',
      })
      .mockResolvedValueOnce({
        checkoutExpiresAt: 1_800_000_000,
        token: 'rejected',
        userId: 'user-b',
      });
    const counts = new Map<string, number>();
    stripeTransport.fetch.mockImplementation(async (_url, options) => {
      const token = new Headers(options.headers).get('Idempotency-Key') ?? '';
      const count = (counts.get(token) ?? 0) + 1;
      counts.set(token, count);
      if (token === 'retrying' && count === 1)
        throw new Error('Connection lost');
      return new Response(
        JSON.stringify({
          error: {
            code: 'parameter_missing',
            message: 'Missing parameter',
            type: 'invalid_request_error',
          },
        }),
        { status: 400 },
      );
    });
    vi.mocked(stripe.checkout.sessions.create).mockImplementation(
      (
        params?: Stripe.Checkout.SessionCreateParams | Stripe.RequestOptions,
        options?: Stripe.RequestOptions,
      ) => stripeTransport.create(params, { ...options, maxNetworkRetries: 1 }),
    );

    const results = await Promise.allSettled([
      createCheckoutSession(new FormData(), 'starter'),
      createCheckoutSession(new FormData(), 'starter'),
    ]);

    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(counts.get('retrying')).toBe(2);
    expect(counts.get('rejected')).toBe(1);
    expect(releaseAccountBillingOperation).toHaveBeenCalledTimes(1);
    expect(releaseAccountBillingOperation).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'rejected', userId: 'user-b' }),
    );
  });

  it('releases the reservation when checkout fails before contacting Stripe', async () => {
    vi.mocked(getUserById).mockResolvedValueOnce(null);

    await expect(
      createCheckoutSession(new FormData(), 'starter'),
    ).rejects.toThrow('User not found');

    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(releaseAccountBillingOperation).toHaveBeenCalled();
  });

  it('rejects invalid package IDs without Sentry error noise', async () => {
    process.env.VERCEL_ENV = 'preview';
    const formData = new FormData();
    formData.set('uiMode', 'hosted');

    await expect(
      createCheckoutSession(formData, 'free' as never),
    ).rejects.toThrow('Invalid checkout package');

    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('reports invalid package IDs as info telemetry in Vercel production', async () => {
    process.env.VERCEL_ENV = 'production';
    const formData = new FormData();
    formData.set('uiMode', 'hosted');

    await expect(
      createCheckoutSession(formData, 'free' as never),
    ).rejects.toThrow('Invalid checkout package');

    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledWith(
      'Invalid checkout package id submitted.',
      expect.objectContaining({
        extra: expect.objectContaining({
          available_packages: ['starter', 'standard', 'pro'],
          packageId: 'free',
          vercelEnv: 'production',
        }),
        level: 'info',
        tags: {
          event_type: 'invalid_package_id',
          section: 'stripe_actions',
        },
      }),
    );
  });

  it('returns a safe null checkout result in E2E mode without price IDs', async () => {
    delete process.env.STRIPE_TOPUP_STARTER_PRICE_ID;
    delete process.env.VERCEL_ENV;
    process.env.E2E_TEST_MODE = 'true';
    const formData = new FormData();
    formData.set('uiMode', 'hosted');

    await expect(createCheckoutSession(formData, 'starter')).resolves.toEqual({
      client_secret: null,
      url: null,
    });

    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('does not report missing top-up price IDs outside Vercel production', async () => {
    delete process.env.STRIPE_TOPUP_STARTER_PRICE_ID;
    process.env.VERCEL_ENV = 'preview';
    const formData = new FormData();
    formData.set('uiMode', 'hosted');

    await expect(createCheckoutSession(formData, 'starter')).rejects.toThrow(
      'Checkout package missing price ID',
    );

    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('reports missing top-up price IDs in Vercel production', async () => {
    delete process.env.STRIPE_TOPUP_STARTER_PRICE_ID;
    process.env.VERCEL_ENV = 'production';
    const formData = new FormData();
    formData.set('uiMode', 'hosted');

    await expect(createCheckoutSession(formData, 'starter')).rejects.toThrow(
      'Checkout package missing price ID',
    );

    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Checkout package missing price ID',
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          packageId: 'starter',
          vercelEnv: 'production',
        }),
        tags: {
          event_type: 'missing_price_id',
          section: 'stripe_actions',
        },
      }),
    );
  });

  it('applies the first-month coupon for eligible subscription customers', async () => {
    process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID =
      'coupon_first_month';
    const formData = new FormData();
    formData.set('type', 'subscription');
    formData.set('uiMode', 'hosted');

    await expect(createCheckoutSession(formData, 'starter')).resolves.toEqual({
      client_secret: 'client_secret_123',
      url: 'https://checkout.stripe.com/session',
    });

    expect(hasAnySubscriptionHistory).toHaveBeenCalledWith('cus_123');
    expect(isStripeCouponUsable).toHaveBeenCalledWith('coupon_first_month');
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        discounts: [{ coupon: 'coupon_first_month' }],
        metadata: expect.objectContaining({
          packageId: 'starter',
          subscriptionDiscountCouponId: 'coupon_first_month',
          type: 'subscription',
          userId: 'user_123',
        }),
        mode: 'subscription',
      }),
      { idempotencyKey: 'checkout-token' },
    );
  });

  it('does not apply an unusable first-month coupon', async () => {
    process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID = 'coupon_expired';
    vi.mocked(isStripeCouponUsable).mockResolvedValue(false);
    const formData = new FormData();
    formData.set('type', 'subscription');
    formData.set('uiMode', 'hosted');

    await createCheckoutSession(formData, 'starter');

    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.not.objectContaining({
        discounts: expect.anything(),
      }),
      { idempotencyKey: 'checkout-token' },
    );
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.not.objectContaining({
          subscriptionDiscountCouponId: expect.anything(),
        }),
      }),
      { idempotencyKey: 'checkout-token' },
    );
  });

  it('does not validate or apply a coupon after any subscription history', async () => {
    process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID =
      'coupon_first_month';
    vi.mocked(hasAnySubscriptionHistory).mockResolvedValue(true);
    const formData = new FormData();
    formData.set('type', 'subscription');
    formData.set('uiMode', 'hosted');

    await createCheckoutSession(formData, 'starter');

    expect(isStripeCouponUsable).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.not.objectContaining({
        discounts: expect.anything(),
      }),
      { idempotencyKey: 'checkout-token' },
    );
  });
});
