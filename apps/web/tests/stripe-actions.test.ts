import { captureException } from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCheckoutSession } from '@/app/[lang]/actions/stripe';
import { stripe } from '@/lib/stripe/stripe-admin';

vi.mock('@/lib/stripe/stripe-admin', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
  },
}));

describe('createCheckoutSession()', () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalStarterPriceId = process.env.STRIPE_TOPUP_5_PRICE_ID;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalVercelEnv;
    }

    if (originalStarterPriceId === undefined) {
      delete process.env.STRIPE_TOPUP_5_PRICE_ID;
    } else {
      process.env.STRIPE_TOPUP_5_PRICE_ID = originalStarterPriceId;
    }
  });

  it('rejects invalid package IDs without Sentry error noise', async () => {
    const formData = new FormData();
    formData.set('uiMode', 'hosted');

    await expect(
      createCheckoutSession(formData, 'free' as never),
    ).rejects.toThrow('Invalid checkout package');

    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not report missing top-up price IDs outside Vercel production', async () => {
    delete process.env.STRIPE_TOPUP_5_PRICE_ID;
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
    delete process.env.STRIPE_TOPUP_5_PRICE_ID;
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
});
