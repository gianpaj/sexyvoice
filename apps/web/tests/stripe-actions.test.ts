import * as Sentry from '@sentry/nextjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCheckoutSessionsCreate,
  mockGetUser,
  mockGetUserById,
  mockHasEverHadRealSubscription,
} = vi.hoisted(() => ({
  mockCheckoutSessionsCreate: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetUserById: vi.fn(),
  mockHasEverHadRealSubscription: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  default: {},
  captureException: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

vi.mock('@/lib/supabase/queries', () => ({
  getUserById: mockGetUserById,
}));

vi.mock('@/lib/stripe/stripe-admin', () => ({
  hasEverHadRealSubscription: mockHasEverHadRealSubscription,
  stripe: {
    checkout: {
      sessions: {
        create: mockCheckoutSessionsCreate,
      },
    },
  },
}));

import { createCheckoutSession } from '@/app/[lang]/actions/stripe';

describe('createCheckoutSession', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SITE_URL: 'https://sexyvoice.ai',
      STRIPE_SUBSCRIPTION_STARTER_PRICE_ID: 'price_sub_starter',
      STRIPE_SUBSCRIPTION_STANDARD_PRICE_ID: 'price_sub_standard',
      STRIPE_SUBSCRIPTION_PRO_PRICE_ID: 'price_sub_pro',
      STRIPE_TOPUP_STARTER_PRICE_ID: 'price_topup_starter',
      STRIPE_TOPUP_STANDARD_PRICE_ID: 'price_topup_standard',
      STRIPE_TOPUP_PRO_PRICE_ID: 'price_topup_pro',
      STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID: 'coupon_first_month',
      NEXT_PUBLIC_PROMO_ENABLED: 'false',
    };

    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user_123',
          email: 'test@example.com',
        },
      },
    });

    mockGetUserById.mockResolvedValue({
      id: 'user_123',
      stripe_id: 'cus_123',
    });

    mockHasEverHadRealSubscription.mockResolvedValue(false);

    mockCheckoutSessionsCreate.mockResolvedValue({
      client_secret: null,
      url: 'https://checkout.stripe.com/session/test',
    });
  });

  it('creates a subscription checkout session with a first-month coupon for eligible users', async () => {
    const formData = new FormData();
    formData.set('uiMode', 'hosted');
    formData.set('type', 'subscription');

    const result = await createCheckoutSession(formData, 'starter');

    expect(result).toEqual({
      client_secret: null,
      url: 'https://checkout.stripe.com/session/test',
    });

    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith({
      mode: 'subscription',
      customer: 'cus_123',
      line_items: [
        {
          quantity: 1,
          price: 'price_sub_starter',
        },
      ],
      discounts: [
        {
          coupon: 'coupon_first_month',
        },
      ],
      success_url:
        'https://sexyvoice.ai/en/dashboard/credits?success=true&creditsAmount=11500',
      cancel_url: 'https://sexyvoice.ai/en/dashboard/credits?canceled=true',
      ui_mode: 'hosted',
      metadata: {
        userId: 'user_123',
        packageId: 'starter',
        type: 'subscription',
        subscriptionDiscountCouponId: 'coupon_first_month',
      },
    });
  });

  it('creates a subscription checkout session without a coupon when no coupon env var is configured', async () => {
    delete process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID;

    const formData = new FormData();
    formData.set('uiMode', 'hosted');
    formData.set('type', 'subscription');

    await createCheckoutSession(formData, 'standard');

    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith({
      mode: 'subscription',
      customer: 'cus_123',
      line_items: [
        {
          quantity: 1,
          price: 'price_sub_standard',
        },
      ],
      success_url:
        'https://sexyvoice.ai/en/dashboard/credits?success=true&creditsAmount=28750',
      cancel_url: 'https://sexyvoice.ai/en/dashboard/credits?canceled=true',
      ui_mode: 'hosted',
      metadata: {
        userId: 'user_123',
        packageId: 'standard',
        type: 'subscription',
      },
    });
  });

  it('creates a subscription checkout session with a coupon when Stripe history only contains expired incomplete attempts', async () => {
    mockHasEverHadRealSubscription.mockResolvedValue(false);

    const formData = new FormData();
    formData.set('uiMode', 'hosted');
    formData.set('type', 'subscription');

    await createCheckoutSession(formData, 'standard');

    expect(mockHasEverHadRealSubscription).toHaveBeenCalledWith('cus_123');
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith({
      mode: 'subscription',
      customer: 'cus_123',
      line_items: [
        {
          quantity: 1,
          price: 'price_sub_standard',
        },
      ],
      discounts: [
        {
          coupon: 'coupon_first_month',
        },
      ],
      success_url:
        'https://sexyvoice.ai/en/dashboard/credits?success=true&creditsAmount=28750',
      cancel_url: 'https://sexyvoice.ai/en/dashboard/credits?canceled=true',
      ui_mode: 'hosted',
      metadata: {
        userId: 'user_123',
        packageId: 'standard',
        type: 'subscription',
        subscriptionDiscountCouponId: 'coupon_first_month',
      },
    });
  });

  it('creates a subscription checkout session without a coupon for returning subscribers', async () => {
    mockHasEverHadRealSubscription.mockResolvedValue(true);

    const formData = new FormData();
    formData.set('uiMode', 'hosted');
    formData.set('type', 'subscription');

    await createCheckoutSession(formData, 'standard');

    expect(mockHasEverHadRealSubscription).toHaveBeenCalledWith('cus_123');
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith({
      mode: 'subscription',
      customer: 'cus_123',
      line_items: [
        {
          quantity: 1,
          price: 'price_sub_standard',
        },
      ],
      success_url:
        'https://sexyvoice.ai/en/dashboard/credits?success=true&creditsAmount=28750',
      cancel_url: 'https://sexyvoice.ai/en/dashboard/credits?canceled=true',
      ui_mode: 'hosted',
      metadata: {
        userId: 'user_123',
        packageId: 'standard',
        type: 'subscription',
      },
    });
  });

  it('captures and rethrows when the user is missing a Stripe customer id', async () => {
    mockGetUserById.mockResolvedValue({
      id: 'user_123',
      stripe_id: null,
    });

    const formData = new FormData();
    formData.set('uiMode', 'hosted');
    formData.set('type', 'subscription');

    await expect(createCheckoutSession(formData, 'starter')).rejects.toThrow(
      'User not found or Stripe ID missing',
    );

    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
