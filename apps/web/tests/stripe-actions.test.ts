import { captureException, captureMessage } from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCardBonusSetupSession,
  createCheckoutSession,
} from '@/app/[lang]/actions/stripe';
import {
  hasAnySubscriptionHistory,
  isStripeCouponUsable,
  stripe,
} from '@/lib/stripe/stripe-admin';
import { getUserById, isEligibleForCardBonus } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

vi.mock('@sentry/nextjs', () => ({
  default: {},
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/stripe/stripe-admin', () => ({
  hasAnySubscriptionHistory: vi.fn(),
  isStripeCouponUsable: vi.fn(),
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
  },
}));

vi.mock('@/lib/supabase/queries', () => ({
  getUserById: vi.fn(),
  isEligibleForCardBonus: vi.fn(),
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

    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';
    process.env.STRIPE_TOPUP_STARTER_PRICE_ID = 'price_topup_starter';
    process.env.STRIPE_SUBSCRIPTION_STARTER_PRICE_ID =
      'price_subscription_starter';

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              email: 'user@example.com',
              id: 'user_123',
            },
          },
        }),
      },
    } as never);
    vi.mocked(getUserById).mockResolvedValue({
      stripe_id: 'cus_123',
    } as never);
    vi.mocked(hasAnySubscriptionHistory).mockResolvedValue(false);
    vi.mocked(isStripeCouponUsable).mockResolvedValue(true);
    vi.mocked(isEligibleForCardBonus).mockResolvedValue(true);
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
        level: 'info',
        tags: {
          section: 'stripe_actions',
          event_type: 'invalid_package_id',
        },
        extra: expect.objectContaining({
          packageId: 'free',
          available_packages: ['starter', 'standard', 'pro'],
          vercelEnv: 'production',
        }),
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
        tags: {
          section: 'stripe_actions',
          event_type: 'missing_price_id',
        },
        extra: expect.objectContaining({
          packageId: 'starter',
          vercelEnv: 'production',
        }),
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
    );
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.not.objectContaining({
          subscriptionDiscountCouponId: expect.anything(),
        }),
      }),
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
    );
  });
});

describe('createCardBonusSetupSession()', () => {
  const originalE2ETestMode = process.env.E2E_TEST_MODE;
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              email: 'user@example.com',
              id: 'user_123',
            },
          },
          error: null,
        }),
      },
    } as never);
    vi.mocked(getUserById).mockResolvedValue({
      stripe_id: 'cus_123',
    } as never);
    vi.mocked(isEligibleForCardBonus).mockResolvedValue(true);
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

    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    }
  });

  it('creates a setup-mode session for an eligible user', async () => {
    const result = await createCardBonusSetupSession({ lang: 'en' });

    expect(result).toEqual({
      alreadyClaimed: false,
      client_secret: 'client_secret_123',
      url: 'https://checkout.stripe.com/session',
    });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'setup',
        customer: 'cus_123',
        payment_method_types: ['card'],
        metadata: { userId: 'user_123', type: 'card_bonus' },
        setup_intent_data: {
          metadata: { userId: 'user_123', type: 'card_bonus' },
        },
        success_url:
          'https://example.com/en/dashboard/credits?card_bonus=success',
        cancel_url:
          'https://example.com/en/dashboard/credits?card_bonus=canceled',
        ui_mode: 'hosted',
      }),
    );
  });

  it('returns alreadyClaimed without creating a session for an ineligible user', async () => {
    vi.mocked(isEligibleForCardBonus).mockResolvedValue(false);

    const result = await createCardBonusSetupSession({ lang: 'en' });

    expect(result).toEqual({
      alreadyClaimed: true,
      client_secret: null,
      url: null,
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('returns a safe null result in E2E mode without touching Stripe', async () => {
    process.env.E2E_TEST_MODE = 'true';

    const result = await createCardBonusSetupSession({ lang: 'en' });

    expect(result).toEqual({
      alreadyClaimed: false,
      client_secret: null,
      url: null,
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(isEligibleForCardBonus).not.toHaveBeenCalled();
  });

  it('throws and reports Sentry on auth error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    } as never);

    await expect(createCardBonusSetupSession({ lang: 'en' })).rejects.toThrow(
      'Unauthorized card bonus setup session request',
    );
    expect(captureException).toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
