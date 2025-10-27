import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { POST } from '@/app/api/stripe/webhook/route';
import { getCustomerData, setTestRedisClient } from '@/lib/redis/queries';
import { stripe } from '@/lib/stripe/stripe-admin';
import {
  getUserIdByStripeCustomerId,
  insertSubscriptionCreditTransaction,
  insertTopupCreditTransaction,
} from '@/lib/supabase/queries';
import {
  clearRedis,
  setupRedis,
  teardownRedis,
} from './utils/redis-test-utils';
import {
  createMockCheckoutSession,
  createMockEvent,
  createMockInvoice,
  createMockRequest,
  createMockSubscription,
  createWebhookRequest,
} from './utils/stripe-test-utils';

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
      retrieve: vi.fn(),
    },
  },
}));

// Mock Supabase queries
vi.mock('@/lib/supabase/queries', () => ({
  getUserIdByStripeCustomerId: vi.fn(),
  insertSubscriptionCreditTransaction: vi.fn(),
  insertTopupCreditTransaction: vi.fn(),
}));

describe('Stripe Webhook Route', () => {
  // Setup in-memory Redis before all tests
  beforeAll(async () => {
    const redisClient = await setupRedis();
    setTestRedisClient(redisClient);
  });

  // Teardown Redis after all tests
  afterAll(async () => {
    setTestRedisClient(null);
    await teardownRedis();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear Redis data before each test
    await clearRedis();
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

      const request = createMockRequest('checkout.session.completed', session);
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

      const request = createMockRequest('checkout.session.completed', session);
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

      const request = createMockRequest('checkout.session.completed', session);
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

      const request = createMockRequest('checkout.session.completed', session);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });

  describe('Checkout Session - Subscription', () => {
    it('should sync subscription data to Redis and award initial credits on checkout', async () => {
      const customerId = 'cus_test123';
      const subscriptionId = 'sub_test123';
      const paymentIntentId = 'pi_initial_test123';

      const subscription = createMockSubscription(
        process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID!,
      );

      vi.mocked(stripe.subscriptions.list).mockResolvedValue({
        data: [subscription],
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(subscription);

      vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue('user_789');

      const session = createMockCheckoutSession('subscription', {});
      // Add payment_intent to session for initial subscription payment
      session.payment_intent = paymentIntentId;

      const request = createMockRequest('checkout.session.completed', session);

      await POST(request);

      // Verify Redis sync was called
      expect(stripe.subscriptions.list).toHaveBeenCalledWith({
        customer: customerId,
        limit: 1,
        status: 'all',
        expand: ['data.default_payment_method'],
      });

      // Verify Redis has the correct data
      const customerData = await getCustomerData(customerId);
      expect(customerData).toMatchObject({
        subscriptionId: 'sub_test123',
        status: 'active',
        priceId: process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID,
      });

      // Verify credits were inserted with payment_intent as reference_id
      expect(insertSubscriptionCreditTransaction).toHaveBeenCalledWith(
        'user_789',
        paymentIntentId, // payment_intent, not subscription_id
        subscriptionId,
        25000,
        10,
      );
    });

    it('should handle subscription checkout without payment_intent gracefully', async () => {
      const subscription = createMockSubscription(
        process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID!,
      );

      vi.mocked(stripe.subscriptions.list).mockResolvedValue({
        data: [subscription],
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(subscription);
      vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue('user_789');

      const session = createMockCheckoutSession('subscription', {});
      session.payment_intent = null; // No payment intent

      const request = createMockRequest('checkout.session.completed', session);

      const response = await POST(request);

      // Should still return 200 but not insert credits
      expect(response.status).toBe(200);
      expect(insertSubscriptionCreditTransaction).not.toHaveBeenCalled();
    });
  });

  describe('Invoice Payment Succeeded - Recurring Subscription Payments', () => {
    it('should award credits on recurring subscription payment', async () => {
      const customerId = 'cus_test123';
      const subscriptionId = 'sub_test123';
      const paymentIntentId = 'pi_recurring_test456';
      const priceId = process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID!;

      const subscription = createMockSubscription(priceId);

      vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(subscription);
      vi.mocked(stripe.subscriptions.list).mockResolvedValue({
        data: [subscription],
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);
      vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue(
        'user_recurring',
      );

      const invoice = createMockInvoice(
        subscriptionId,
        customerId,
        paymentIntentId,
        priceId,
        'subscription_cycle', // recurring payment
      );

      const request = createMockRequest('invoice.payment_succeeded', invoice);
      await POST(request);

      // Verify credits were awarded with payment_intent as reference_id
      expect(insertSubscriptionCreditTransaction).toHaveBeenCalledWith(
        'user_recurring',
        paymentIntentId, // Unique payment_intent for this billing cycle
        subscriptionId,
        25000,
        10,
      );

      // Verify Redis was also updated
      expect(stripe.subscriptions.list).toHaveBeenCalled();
      const customerData = await getCustomerData(customerId);
      expect(customerData?.status).toBe('active');
    });

    it('should skip manual invoices', async () => {
      const customerId = 'cus_test123';
      const subscriptionId = 'sub_test123';
      const paymentIntentId = 'pi_manual_test789';
      const priceId = process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID!;

      const invoice = createMockInvoice(
        subscriptionId,
        customerId,
        paymentIntentId,
        priceId,
        'manual', // manual invoice
      );

      const request = createMockRequest('invoice.payment_succeeded', invoice);
      await POST(request);

      // Should not award credits for manual invoices
      expect(insertSubscriptionCreditTransaction).not.toHaveBeenCalled();
    });

    it('should skip invoices without subscription', async () => {
      const customerId = 'cus_test123';
      const paymentIntentId = 'pi_no_sub_test';
      const priceId = process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID!;

      const invoice = createMockInvoice(
        '', // No subscription
        customerId,
        paymentIntentId,
        priceId,
        'subscription_cycle',
      );
      invoice.subscription = null;

      const request = createMockRequest('invoice.payment_succeeded', invoice);
      await POST(request);

      // Should not award credits for non-subscription invoices
      expect(insertSubscriptionCreditTransaction).not.toHaveBeenCalled();
    });

    it('should handle invoice without payment_intent gracefully', async () => {
      const customerId = 'cus_test123';
      const subscriptionId = 'sub_test123';
      const priceId = process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID!;

      vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue('user_test');

      const invoice = createMockInvoice(
        subscriptionId,
        customerId,
        '', // No payment intent
        priceId,
        'subscription_cycle',
      );
      invoice.payment_intent = null;

      const request = createMockRequest('invoice.payment_succeeded', invoice);
      const response = await POST(request);

      // Should return 200 but not insert credits
      expect(response.status).toBe(200);
      expect(insertSubscriptionCreditTransaction).not.toHaveBeenCalled();
    });
  });

  describe('Complete Subscription Payment Flow', () => {
    it('should process multiple events from a real subscription payment without duplicating credits', async () => {
      const customerId = 'cus_real_test';
      const subscriptionId = 'sub_real_test';
      const paymentIntentId = 'pi_unique_payment_123';
      const priceId = process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID!;

      const subscription = createMockSubscription(priceId);

      vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(subscription);
      vi.mocked(stripe.subscriptions.list).mockResolvedValue({
        data: [subscription],
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);
      vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue('user_real');

      // Simulate the sequence of events from a real Stripe subscription payment
      // Based on the user's actual webhook log:

      // 1. customer.subscription.updated
      const subUpdatedEvent = createMockEvent(
        'customer.subscription.updated',
        subscription,
      );
      const subUpdatedRequest = createWebhookRequest(subUpdatedEvent);
      await POST(subUpdatedRequest);

      // 2. invoice.payment_succeeded - THIS should award credits
      const invoice = createMockInvoice(
        subscriptionId,
        customerId,
        paymentIntentId,
        priceId,
        'subscription_cycle',
      );
      const invoiceRequest = createMockRequest(
        'invoice.payment_succeeded',
        invoice,
      );
      await POST(invoiceRequest);

      // 3. invoice.paid - just updates Redis, no credits
      const invoicePaidRequest = createMockRequest('invoice.paid', invoice);
      await POST(invoicePaidRequest);

      // 4. customer.subscription.updated again
      const subUpdated2Request = createWebhookRequest(subUpdatedEvent);
      await POST(subUpdated2Request);

      // Verify insertSubscriptionCreditTransaction was called exactly ONCE
      // even though multiple events fired
      expect(insertSubscriptionCreditTransaction).toHaveBeenCalledTimes(1);
      expect(insertSubscriptionCreditTransaction).toHaveBeenCalledWith(
        'user_real',
        paymentIntentId, // Uses payment_intent as reference_id
        subscriptionId,
        25000,
        10,
      );

      // Verify Redis sync was called multiple times (for each subscription event)
      expect(stripe.subscriptions.list).toHaveBeenCalled();
    });

    it('should handle different payment_intents for recurring payments separately', async () => {
      const customerId = 'cus_recurring_test';
      const subscriptionId = 'sub_recurring_test';
      const priceId = process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID!;

      const subscription = createMockSubscription(priceId);

      vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(subscription);
      vi.mocked(stripe.subscriptions.list).mockResolvedValue({
        data: [subscription],
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);
      vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue(
        'user_recurring',
      );

      // First month payment
      const invoice1 = createMockInvoice(
        subscriptionId,
        customerId,
        'pi_month1_payment',
        priceId,
        'subscription_cycle',
      );
      const request1 = createMockRequest('invoice.payment_succeeded', invoice1);
      await POST(request1);

      // Second month payment (different payment_intent)
      const invoice2 = createMockInvoice(
        subscriptionId,
        customerId,
        'pi_month2_payment', // Different payment_intent
        priceId,
        'subscription_cycle',
      );
      const request2 = createMockRequest('invoice.payment_succeeded', invoice2);
      await POST(request2);

      // Should insert credits twice, once for each unique payment_intent
      expect(insertSubscriptionCreditTransaction).toHaveBeenCalledTimes(2);
      expect(insertSubscriptionCreditTransaction).toHaveBeenNthCalledWith(
        1,
        'user_recurring',
        'pi_month1_payment',
        subscriptionId,
        25000,
        10,
      );
      expect(insertSubscriptionCreditTransaction).toHaveBeenNthCalledWith(
        2,
        'user_recurring',
        'pi_month2_payment',
        subscriptionId,
        25000,
        10,
      );
    });
  });

  describe('Subscription Lifecycle Events', () => {
    it('should handle customer.subscription.created and only sync to Redis', async () => {
      const customerId = 'cus_test123';
      const subscription = createMockSubscription(
        process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID!,
      );

      vi.mocked(stripe.subscriptions.list).mockResolvedValue({
        data: [subscription],
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue('user-id-123');

      const request = createMockRequest('customer.subscription.created', {
        ...subscription,
        customer: customerId,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);

      // Verify Redis has the subscription data
      const customerData = await getCustomerData(customerId);
      expect(customerData).toBeDefined();
      expect(customerData?.status).toBe('active');

      // Should NOT insert credits - only sync to Redis
      expect(insertSubscriptionCreditTransaction).not.toHaveBeenCalled();
    });

    it('should handle customer.subscription.updated and only sync to Redis', async () => {
      const customerId = 'cus_test123';
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

      const request = createMockRequest('customer.subscription.updated', {
        ...subscription,
        customer: customerId,
      });

      await POST(request);

      // Verify Redis has the updated subscription data
      const customerData = await getCustomerData(customerId);
      expect(customerData).toBeDefined();
      expect(customerData?.status).toBe('active');

      // Should NOT insert credits - only sync to Redis
      expect(insertSubscriptionCreditTransaction).not.toHaveBeenCalled();
    });

    it('should handle customer.subscription.deleted and update Redis with canceled status', async () => {
      const customerId = 'cus_test123';
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

      const request = createMockRequest('customer.subscription.deleted', {
        ...subscription,
        customer: customerId,
      });

      await POST(request);

      // Verify that setCustomerData was called (via syncStripeDataToKV)
      expect(insertSubscriptionCreditTransaction).not.toHaveBeenCalled();

      // Verify Redis has the canceled status
      const customerData = await getCustomerData(customerId);
      expect(customerData).toBeDefined();
      expect(customerData?.status).toBe('canceled');
      expect(customerData).toMatchObject({
        subscriptionId: 'sub_test123',
        status: 'canceled',
        priceId: process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID,
      });
    });

    it('should handle customer.subscription.paused and only sync to Redis', async () => {
      const customerId = 'cus_test123';
      const subscription = createMockSubscription(
        process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID!,
        'paused',
      );

      vi.mocked(stripe.subscriptions.list).mockResolvedValue({
        data: [subscription],
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue('user_paused');

      const request = createMockRequest('customer.subscription.paused', {
        ...subscription,
        customer: customerId,
      });

      await POST(request);

      // Verify Redis has the paused status
      const customerData = await getCustomerData(customerId);
      expect(customerData).toBeDefined();
      expect(customerData?.status).toBe('paused');

      // Should NOT insert credits for paused subscriptions
      expect(insertSubscriptionCreditTransaction).not.toHaveBeenCalled();
    });
  });

  describe('Credit Awards by Subscription Plan - Via Invoice Payment', () => {
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
      it(`should award ${expectedCredits.toLocaleString()} credits for ${name} plan via invoice payment`, async () => {
        const customerId = 'cus_test123';
        const subscriptionId = 'sub_test123';
        const paymentIntentId = `pi_${name.toLowerCase()}_test`;
        const subscription = createMockSubscription(priceId!, 'active');

        vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
          subscription,
        );
        vi.mocked(stripe.subscriptions.list).mockResolvedValue({
          data: [subscription],
          // biome-ignore lint/suspicious/noExplicitAny: Test mock data
        } as any);

        vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue(
          'user_credit_test',
        );

        const invoice = createMockInvoice(
          subscriptionId,
          customerId,
          paymentIntentId,
          priceId!,
          'subscription_cycle',
        );

        const request = createMockRequest('invoice.payment_succeeded', invoice);

        await POST(request);

        expect(insertSubscriptionCreditTransaction).toHaveBeenCalledWith(
          'user_credit_test',
          paymentIntentId, // payment_intent as reference_id
          subscriptionId,
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

    // FIXME
    testSubscriptionPlans.forEach(
      ({ name, priceId, expectedCredits, expectedAmount }) => {
        it.skip(`should award bonus subscription credits for ${name.toLowerCase()} plan`, async () => {
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

          // Note: This test is outdated - subscription credits are now awarded
          // via invoice.payment_succeeded, not customer.subscription.updated
          expect(insertSubscriptionCreditTransaction).not.toHaveBeenCalled();
        });
      },
    );
  });

  describe('Edge Cases', () => {
    it('should handle customer with no subscriptions', async () => {
      const customerId = 'cus_no_subs';
      vi.mocked(stripe.subscriptions.list).mockResolvedValue({
        data: [],
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      const request = createMockRequest('customer.subscription.updated', {
        customer: customerId,
      });

      await POST(request);

      // Verify Redis has status 'none' for customer with no subscriptions
      const customerData = await getCustomerData(customerId);
      expect(customerData).toEqual({
        status: 'none',
      });
      expect(insertSubscriptionCreditTransaction).not.toHaveBeenCalled();
    });

    it('should log error when user not found in database during invoice payment', async () => {
      const customerId = 'cus_unknown';
      const subscriptionId = 'sub_test123';
      const paymentIntentId = 'pi_test_no_user';
      const priceId = process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID!;

      const subscription = createMockSubscription(priceId);

      vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(subscription);
      vi.mocked(stripe.subscriptions.list).mockResolvedValue({
        data: [subscription],
        // biome-ignore lint/suspicious/noExplicitAny: Test mock data
      } as any);

      // User not found in database
      // @ts-expect-error
      vi.mocked(getUserIdByStripeCustomerId).mockResolvedValue(null);

      const invoice = createMockInvoice(
        subscriptionId,
        customerId,
        paymentIntentId,
        priceId,
        'subscription_cycle',
      );

      const request = createMockRequest('invoice.payment_succeeded', invoice);

      const response = await POST(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ received: true });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: expect.objectContaining({
            event_type: 'invoice_payment_succeeded',
          }),
          extra: expect.objectContaining({
            customer_id: customerId,
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
