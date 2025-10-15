import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/stripe/webhook/route';
import { setCustomerData } from '@/lib/redis/queries';
import { stripe } from '@/lib/stripe/stripe-admin';
import {
  getUserIdByStripeCustomerId,
  insertSubscriptionCreditTransaction,
  insertTopupCreditTransaction,
} from '@/lib/supabase/queries';
import {
  createMockCheckoutSession,
  createMockEvent,
  createMockRequest,
  createMockSubscription,
} from './utils/stripe-test-utils';

// We'll need to create a real Stripe instance for generating test signatures
// but we'll mock the actual webhook route's Stripe instance
const stripeForTesting = await import('stripe').then((m) => {
  const StripeConstructor = m.default;
  return new StripeConstructor(
    process.env.STRIPE_SECRET_KEY || 'sk_test_dummy',
    {
      apiVersion: '2025-02-24.acacia',
    },
  );
});

const WEBHOOK_SECRET = 'whsec_test_secret_for_testing';

// Mock environment variables
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

// Mock Stripe admin
vi.mock('@/lib/stripe/stripe-admin', () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
    subscriptions: {
      list: vi.fn(),
    },
  },
}));

// Mock Supabase queries
vi.mock('@/lib/supabase/queries', () => ({
  getUserIdByStripeCustomerId: vi.fn(),
  insertSubscriptionCreditTransaction: vi.fn(),
  insertTopupCreditTransaction: vi.fn(),
}));

// Mock Redis queries
vi.mock('@/lib/redis/queries', () => ({
  setCustomerData: vi.fn(),
}));

describe('Stripe Webhook Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Signature Verification', () => {
    it('should return 400 when stripe-signature header is missing', async () => {
      // Mock headers to return null for Stripe-Signature
      vi.mocked(headers).mockResolvedValue({
        get: () => null,
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      const request = {
        text: async () => JSON.stringify({}),
      } as unknown as Request;

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should handle constructEvent throwing an error (invalid signature)', async () => {
      const event = createMockEvent(
        'checkout.session.completed',
        createMockCheckoutSession('payment'),
      );

      // Mock headers to return a signature
      vi.mocked(headers).mockResolvedValue({
        get: (name: string) => {
          if (name === 'Stripe-Signature') return 'invalid_signature';
          return null;
        },
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      // Mock constructEvent to throw error
      vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const request = {
        text: async () => JSON.stringify(event),
      } as unknown as Request;

      const response = await POST(request);

      // Should still return 200 (webhook acknowledged) but error logged
      expect(response.status).toBe(200);
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('should process webhook with valid signature', async () => {
      const session = createMockCheckoutSession('payment', {
        type: 'topup',
        userId: 'user_123',
        credits: '5000',
        dollarAmount: '5.00',
        packageType: 'starter',
      });

      const event = createMockEvent('checkout.session.completed', session);
      const payload = JSON.stringify(event);
      const signature = stripeForTesting.webhooks.generateTestHeaderString({
        payload,
        secret: WEBHOOK_SECRET,
      });

      // Mock headers
      vi.mocked(headers).mockResolvedValue({
        get: (name: string) => {
          if (name === 'Stripe-Signature') return signature;
          return null;
        },
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      // Mock constructEvent to return our event
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

      const request = {
        text: async () => payload,
      } as unknown as Request;

      const response = await POST(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ received: true });
      expect(insertTopupCreditTransaction).toHaveBeenCalledWith(
        'user_123',
        'pi_test123',
        5000,
        5,
        'starter',
        null,
      );
    });
  });

  describe('Checkout Session - Topup', () => {
    // NOTE to self
    // for Top-ups we create a Stripe checkout session (`createCheckoutSession()`)
    // where we send the num of credits as metadata
    // later, the webhook uses that number to insert into the Database
    it('should process topup checkout and add credits', async () => {
      const session = createMockCheckoutSession('payment', {
        type: 'topup',
        userId: 'user_123',
        credits: '5000',
        dollarAmount: '5.00',
        packageType: 'starter',
      });

      const event = createMockEvent('checkout.session.completed', session);
      const payload = JSON.stringify(event);
      const signature = stripeForTesting.webhooks.generateTestHeaderString({
        payload,
        secret: WEBHOOK_SECRET,
      });

      vi.mocked(headers).mockResolvedValue({
        get: (name: string) => {
          if (name === 'Stripe-Signature') return signature;
          return null;
        },
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

      const request = {
        text: async () => payload,
      } as unknown as Request;

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(insertTopupCreditTransaction).toHaveBeenCalledWith(
        'user_123',
        'pi_test123',
        5000,
        5.0,
        'starter',
        null,
      );
    });

    it('should handle promo in topup metadata', async () => {
      // process.env.NEXT_PUBLIC_PROMO_ID
      const PROMO_ID = 'halloween_2025';

      const session = createMockCheckoutSession('payment', {
        type: 'topup',
        userId: 'user_456',
        credits: '15000',
        dollarAmount: '12.00',
        packageType: 'standard',
        promo: PROMO_ID,
      });

      const event = createMockEvent('checkout.session.completed', session);
      const payload = JSON.stringify(event);
      const signature = stripeForTesting.webhooks.generateTestHeaderString({
        payload,
        secret: WEBHOOK_SECRET,
      });

      vi.mocked(headers).mockResolvedValue({
        get: (name: string) => {
          if (name === 'Stripe-Signature') return signature;
          return null;
        },
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

      const request = {
        text: async () => payload,
      } as unknown as Request;

      await POST(request);

      expect(insertTopupCreditTransaction).toHaveBeenCalledWith(
        'user_456',
        'pi_test123',
        15000,
        12.0,
        'standard',
        PROMO_ID,
      );
    });

    it('should log error and continue when topup metadata is missing', async () => {
      const session = createMockCheckoutSession('payment', {
        type: 'topup',
        // Missing userId, credits, dollarAmount
      });

      const event = createMockEvent('checkout.session.completed', session);
      const payload = JSON.stringify(event);
      const signature = stripeForTesting.webhooks.generateTestHeaderString({
        payload,
        secret: WEBHOOK_SECRET,
      });

      vi.mocked(headers).mockResolvedValue({
        get: (name: string) => {
          if (name === 'Stripe-Signature') return signature;
          return null;
        },
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

      const request = {
        text: async () => payload,
      } as unknown as Request;

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  describe('Checkout Session - Subscription', () => {
    it('should sync subscription data to Redis on checkout', async () => {
      // process.env.NEXT_PUBLIC_PROMO_ENABLED = 'false';

      // standard package
      const subscription = createMockSubscription(
        process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID!,
      );

      vi.mocked(stripe.subscriptions.list).mockResolvedValue({
        data: [subscription],
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue('user_789');

      const session = createMockCheckoutSession('subscription');
      const event = createMockEvent('checkout.session.completed', session);
      const payload = JSON.stringify(event);
      const signature = stripeForTesting.webhooks.generateTestHeaderString({
        payload,
        secret: WEBHOOK_SECRET,
      });

      vi.mocked(headers).mockResolvedValue({
        get: (name: string) => {
          if (name === 'Stripe-Signature') return signature;
          return null;
        },
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

      const request = {
        text: async () => payload,
      } as unknown as Request;

      await POST(request);

      expect(stripe.subscriptions.list).toHaveBeenCalledWith({
        customer: 'cus_test123',
        limit: 1,
        status: 'all',
        expand: ['data.default_payment_method'],
      });

      expect(setCustomerData).toHaveBeenCalledWith(
        'cus_test123',
        expect.objectContaining({
          subscriptionId: 'sub_test123',
          status: 'active',
          priceId: process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID,
        }),
      );

      expect(insertSubscriptionCreditTransaction).toHaveBeenCalledWith(
        'user_789',
        'sub_test123',
        25000,
        10,
      );
    });
  });

  describe('Subscription Lifecycle Events', () => {
    it('should handle customer.subscription.created', async () => {
      const subscription = createMockSubscription(
        process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID!,
      );

      vi.mocked(stripe.subscriptions.list).mockResolvedValue({
        data: [subscription],
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue('user-id-123');

      const event = createMockEvent('customer.subscription.created', {
        ...subscription,
        customer: 'cus_test123',
      });
      const payload = JSON.stringify(event);
      const signature = stripeForTesting.webhooks.generateTestHeaderString({
        payload,
        secret: WEBHOOK_SECRET,
      });

      vi.mocked(headers).mockResolvedValue({
        get: (name: string) => {
          if (name === 'Stripe-Signature') return signature;
          return null;
        },
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

      const request = {
        text: async () => payload,
      } as unknown as Request;

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(setCustomerData).toHaveBeenCalled();
      expect(insertSubscriptionCreditTransaction).toHaveBeenCalledWith(
        'user-id-123',
        'sub_test123',
        25000,
        10,
      );
    });

    it('should handle customer.subscription.updated', async () => {
      const subscription = createMockSubscription(
        process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID!,
        'active',
      );

      vi.mocked(stripe.subscriptions.list).mockResolvedValue({
        data: [subscription],
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue(
        'user_sub_updated',
      );

      const event = createMockEvent('customer.subscription.updated', {
        ...subscription,
        customer: 'cus_test123',
      });
      const payload = JSON.stringify(event);
      const signature = stripeForTesting.webhooks.generateTestHeaderString({
        payload,
        secret: WEBHOOK_SECRET,
      });

      vi.mocked(headers).mockResolvedValue({
        get: (name: string) => {
          if (name === 'Stripe-Signature') return signature;
          return null;
        },
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

      const request = {
        text: async () => payload,
      } as unknown as Request;

      await POST(request);

      expect(setCustomerData).toHaveBeenCalled();
      expect(insertSubscriptionCreditTransaction).toHaveBeenCalledWith(
        'user_sub_updated',
        'sub_test123',
        25000,
        10,
      );
    });

    it('should handle customer.subscription.deleted', async () => {
      const subscription = createMockSubscription(
        process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID!,
        'canceled',
      );

      vi.mocked(stripe.subscriptions.list).mockResolvedValue({
        data: [subscription],
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue(
        'user_sub_deleted',
      );

      const event = createMockEvent('customer.subscription.deleted', {
        ...subscription,
        customer: 'cus_test123',
      });
      const payload = JSON.stringify(event);
      const signature = stripeForTesting.webhooks.generateTestHeaderString({
        payload,
        secret: WEBHOOK_SECRET,
      });

      vi.mocked(headers).mockResolvedValue({
        get: (name: string) => {
          if (name === 'Stripe-Signature') return signature;
          return null;
        },
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

      const request = {
        text: async () => payload,
      } as unknown as Request;

      await POST(request);

      expect(setCustomerData).toHaveBeenCalled();
      expect(insertSubscriptionCreditTransaction).not.toHaveBeenCalled();
    });

    it('should handle customer.subscription.paused', async () => {
      const subscription = createMockSubscription(
        process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID!,
        'paused',
      );

      vi.mocked(stripe.subscriptions.list).mockResolvedValue({
        data: [subscription],
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue(
        'user_sub_paused',
      );

      const event = createMockEvent('customer.subscription.paused', {
        ...subscription,
        customer: 'cus_test123',
      });
      const payload = JSON.stringify(event);
      const signature = stripeForTesting.webhooks.generateTestHeaderString({
        payload,
        secret: WEBHOOK_SECRET,
      });

      vi.mocked(headers).mockResolvedValue({
        get: (name: string) => {
          if (name === 'Stripe-Signature') return signature;
          return null;
        },
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

      const request = {
        text: async () => payload,
      } as unknown as Request;

      await POST(request);

      expect(setCustomerData).toHaveBeenCalled();
      expect(insertSubscriptionCreditTransaction).not.toHaveBeenCalled();
    });
  });

  describe('Credit Awards by Subscription Plan', () => {
    const testPlans = [
      {
        name: 'Starter',
        priceId: process.env.STRIPE_SUBSCRIPTION_5_PRICE_ID,
        expectedCredits: 10_000,
        expectedAmount: 5,
      },
      {
        name: 'Standard',
        priceId: process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID,
        expectedCredits: 25_000,
        expectedAmount: 10,
      },
      {
        name: 'Pro',
        priceId: process.env.STRIPE_SUBSCRIPTION_99_PRICE_ID,
        expectedCredits: 300_000,
        expectedAmount: 99,
      },
    ];

    testPlans.forEach(({ name, priceId, expectedCredits, expectedAmount }) => {
      it(`should award ${expectedCredits.toLocaleString()} credits for ${name} plan`, async () => {
        const subscription = createMockSubscription(priceId!, 'active');

        vi.mocked(stripe.subscriptions.list).mockResolvedValue({
          data: [subscription],
          // biome-ignore lint/suspicious/noExplicitAny: Test mock data
        } as any);

        vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue(
          'user_credit_test',
        );

        const event = createMockEvent('customer.subscription.created', {
          ...subscription,
          customer: 'cus_test123',
        });
        const payload = JSON.stringify(event);
        const signature = stripeForTesting.webhooks.generateTestHeaderString({
          payload,
          secret: WEBHOOK_SECRET,
        });

        vi.mocked(headers).mockResolvedValue({
          get: (name: string) => {
            if (name === 'Stripe-Signature') return signature;
            return null;
          },
          // biome-ignore lint/suspicious/noExplicitAny: Test mock data
        } as any);

        vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event);

        const request = {
          text: async () => payload,
        } as unknown as Request;

        await POST(request);

        expect(insertSubscriptionCreditTransaction).toHaveBeenCalledWith(
          'user_credit_test',
          'sub_test123',
          expectedCredits,
          expectedAmount,
        );
      });
    });
  });

  describe('Promo Enabled - Topup Transactions', () => {
    const originalPromoEnabled = process.env.NEXT_PUBLIC_PROMO_ENABLED;
    const originalStarterBonus = process.env.NEXT_PUBLIC_PROMO_BONUS_STARTER;
    const originalStandardBonus = process.env.NEXT_PUBLIC_PROMO_BONUS_STANDARD;
    const originalProBonus = process.env.NEXT_PUBLIC_PROMO_BONUS_PRO;

    beforeEach(() => {
      // Enable promo for these tests
      process.env.NEXT_PUBLIC_PROMO_ENABLED = 'true';
      process.env.NEXT_PUBLIC_PROMO_BONUS_STARTER = '2000';
      process.env.NEXT_PUBLIC_PROMO_BONUS_STANDARD = '7500';
      process.env.NEXT_PUBLIC_PROMO_BONUS_PRO = '105000';
    });

    afterEach(() => {
      // Restore original values
      process.env.NEXT_PUBLIC_PROMO_ENABLED = originalPromoEnabled;
      process.env.NEXT_PUBLIC_PROMO_BONUS_STARTER = originalStarterBonus;
      process.env.NEXT_PUBLIC_PROMO_BONUS_STANDARD = originalStandardBonus;
      process.env.NEXT_PUBLIC_PROMO_BONUS_PRO = originalProBonus;
    });

    const userId = 'user_sub_promo_test';
    const testTopupPlans = [
      {
        name: 'Starter',
        packageType: 'starter',
        credits: 12000,
        dollarAmount: 5.0,
      },
      {
        name: 'Standard',
        packageType: 'standard',
        credits: 32500,
        dollarAmount: 10.0,
      },
      {
        name: 'Pro',
        packageType: 'pro',
        credits: 405000,
        dollarAmount: 99.0,
      },
    ];

    testTopupPlans.forEach(({ name, packageType, credits, dollarAmount }) => {
      it(`should process ${name.toLowerCase()} topup with promo bonus (${credits.toLocaleString()} credits)`, async () => {
        const session = createMockCheckoutSession('payment', {
          type: 'topup',
          userId: userId,
          credits: credits.toString(),
          dollarAmount: dollarAmount.toFixed(2),
          packageType: packageType,
        });

        const request = createMockRequest(
          'checkout.session.completed',
          session,
        );

        const response = await POST(request);

        expect(response.status).toBe(200);
        expect(insertTopupCreditTransaction).toHaveBeenCalledWith(
          userId,
          'pi_test123',
          credits,
          dollarAmount,
          packageType,
          null,
        );
      });
    });

    it('should handle topup with promo code in metadata', async () => {
      const session = createMockCheckoutSession('payment', {
        type: 'topup',
        userId: 'user_promo_with_code',
        credits: '32500',
        dollarAmount: '10.00',
        packageType: 'standard',
        promo: 'LAUNCH2024',
      });

      const request = createMockRequest('checkout.session.completed', session);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(insertTopupCreditTransaction).toHaveBeenCalledWith(
        'user_promo_with_code',
        'pi_test123',
        32500,
        10.0,
        'standard',
        'LAUNCH2024', // Promo code should be included
      );
    });
  });

  describe('Promo Enabled - Subscription Transactions', () => {
    const originalPromoEnabled = process.env.NEXT_PUBLIC_PROMO_ENABLED;
    const originalStarterBonus = process.env.NEXT_PUBLIC_PROMO_BONUS_STARTER;
    const originalStandardBonus = process.env.NEXT_PUBLIC_PROMO_BONUS_STANDARD;
    const originalProBonus = process.env.NEXT_PUBLIC_PROMO_BONUS_PRO;

    beforeEach(() => {
      // Enable promo for these tests
      process.env.NEXT_PUBLIC_PROMO_ENABLED = 'true';
      process.env.NEXT_PUBLIC_PROMO_BONUS_STARTER = '2000';
      process.env.NEXT_PUBLIC_PROMO_BONUS_STANDARD = '7500';
      process.env.NEXT_PUBLIC_PROMO_BONUS_PRO = '105000';
    });

    afterEach(() => {
      // Restore original values
      process.env.NEXT_PUBLIC_PROMO_ENABLED = originalPromoEnabled;
      process.env.NEXT_PUBLIC_PROMO_BONUS_STARTER = originalStarterBonus;
      process.env.NEXT_PUBLIC_PROMO_BONUS_STANDARD = originalStandardBonus;
      process.env.NEXT_PUBLIC_PROMO_BONUS_PRO = originalProBonus;
    });

    const userId = 'user_sub_promo_test';

    const testSubscriptionPlans = [
      {
        name: 'Starter',
        priceId: process.env.STRIPE_SUBSCRIPTION_5_PRICE_ID,
        expectedCredits: 12000,
        expectedAmount: 5,
      },
      {
        name: 'Standard',
        priceId: process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID,
        expectedCredits: 32500,
        expectedAmount: 10,
      },
      {
        name: 'Pro',
        priceId: process.env.STRIPE_SUBSCRIPTION_99_PRICE_ID,
        expectedCredits: 405000,
        expectedAmount: 99,
      },
    ];

    testSubscriptionPlans.forEach(
      ({ name, priceId, expectedCredits, expectedAmount }) => {
        it(`should award bonus subscription credits for ${name.toLowerCase()} plan`, async () => {
          const subscription = createMockSubscription(priceId!, 'active');

          vi.mocked(stripe.subscriptions.list).mockResolvedValue({
            data: [subscription],
            // biome-ignore lint/suspicious/noExplicitAny: Test mock data
          } as any);

          vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue(userId);

          const request = createMockRequest('customer.subscription.created', {
            ...subscription,
            customer: 'cus_test123',
          });

          await POST(request);

          // Subscriptions should award credits with bonus
          expect(insertSubscriptionCreditTransaction).toHaveBeenCalledWith(
            userId,
            'sub_test123',
            expectedCredits,
            expectedAmount,
          );
        });
      },
    );
  });

  describe('Edge Cases', () => {
    it('should handle customer with no subscriptions', async () => {
      vi.mocked(stripe.subscriptions.list).mockResolvedValue({
        data: [],
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      const request = createMockRequest('customer.subscription.updated', {
        customer: 'cus_no_subs',
      });

      await POST(request);

      expect(setCustomerData).toHaveBeenCalledWith('cus_no_subs', {
        status: 'none',
      });
      expect(insertSubscriptionCreditTransaction).not.toHaveBeenCalled();
    });

    it('should log error when user not found in database', async () => {
      const subscription = createMockSubscription('price_xxx');

      vi.mocked(stripe.subscriptions.list).mockResolvedValue({
        data: [subscription],
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      // @ts-expect-error
      vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue(null);

      const request = createMockRequest('customer.subscription.updated', {
        customer: 'cus_unknown',
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ received: true });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          extra: expect.objectContaining({
            customer_id: 'cus_unknown',
          }),
        }),
      );
      expect(insertSubscriptionCreditTransaction).not.toHaveBeenCalled();
    });

    it('should handle unrecognized event types gracefully', async () => {
      // biome-ignore lint/suspicious/noExplicitAny: Testing unrecognized event type
      const request = createMockRequest('customer.created' as any, {
        id: 'cus_new',
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ received: true });
      expect(insertSubscriptionCreditTransaction).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should report database errors to Sentry', async () => {
      vi.mocked(insertTopupCreditTransaction).mockRejectedValue(
        new Error('Database connection failed'),
      );

      const session = createMockCheckoutSession('payment', {
        type: 'topup',
        userId: 'user_123',
        credits: '1000',
        dollarAmount: '10',
      });

      const request = createMockRequest('checkout.session.completed', session);
      await POST(request);

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Database'),
        }),
        expect.objectContaining({
          tags: expect.objectContaining({
            section: 'stripe_webhook',
          }),
        }),
      );
    });

    it('should handle Stripe API errors gracefully', async () => {
      vi.mocked(stripe.subscriptions.list).mockRejectedValue(
        new Error('Stripe API error'),
      );

      const request = createMockRequest('customer.subscription.updated', {
        customer: 'cus_error',
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });
});
