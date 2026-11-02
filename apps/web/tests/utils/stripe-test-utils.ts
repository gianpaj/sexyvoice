import { headers } from 'next/headers';
import type Stripe from 'stripe';
import { vi } from 'vitest';

import type { CheckoutMetadata } from '@/app/[lang]/actions/stripe';
import { stripe } from '@/lib/stripe/stripe-admin';

const WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret_for_testing';

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

/**
 * Creates a valid Stripe webhook request with proper signature
 * Uses Stripe's official generateTestHeaderString method
 */
export function createWebhookRequest(event: Stripe.Event): Request {
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
  return request;
}

/**
 * Creates mock Stripe events for testing
 */
export function createMockEvent<T extends Stripe.Event.Type>(
  type: T,
  // biome-ignore lint/suspicious/noExplicitAny: Test mock data
  data: any,
): Stripe.Event {
  return {
    api_version: '2024-12-18.acacia',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: data,
    },
    id: `evt_test_${Date.now()}`,
    livemode: false,
    object: 'event',
    pending_webhooks: 0,
    request: {
      id: null,
      idempotency_key: null,
    },
    type,
  } as Stripe.Event;
}

/**
 * Creates mock checkout session
 */
export function createMockCheckoutSession(
  mode: 'payment' | 'subscription',
  metadata?: CheckoutMetadata,
): Stripe.Checkout.Session {
  // @ts-expect-error
  return {
    customer: 'cus_test123',
    id: 'cs_test_123',
    metadata: (metadata as unknown as Stripe.Metadata) || {},
    mode,
    object: 'checkout.session',
    payment_intent: mode === 'payment' ? 'pi_test123' : null,
    payment_status: 'paid',
    status: 'complete',
    subscription: mode === 'subscription' ? 'sub_test123' : null,
  };
}

/**
 * Creates mock subscription object
 */
export function createMockSubscription(
  priceId: string,
  status: Stripe.Subscription.Status = 'active',
): Stripe.Response<Stripe.Subscription> {
  return {
    cancel_at_period_end: false,
    current_period_end: Math.floor(Date.now() / 1000) + 2_592_000, // +30 days
    current_period_start: Math.floor(Date.now() / 1000),
    customer: 'cus_test123',
    default_payment_method: {
      card: {
        brand: 'visa',
        last4: '4242',
      },
      id: 'pm_test',
      object: 'payment_method',
    },
    id: 'sub_test123',
    items: {
      data: [
        {
          id: 'si_test',
          object: 'subscription_item',
          price: {
            active: true,
            currency: 'usd',
            id: priceId,
            object: 'price',
            recurring: {
              interval: 'month',
              interval_count: 1,
            },
            type: 'recurring',
            unit_amount: 1500,
          },
        },
      ],
      object: 'list',
    },
    object: 'subscription',
    status,
  } as Stripe.Response<Stripe.Subscription>;
}

/**
 * Creates mock invoice object
 */
export function createMockInvoice(
  subscriptionId: string,
  customerId: string,
  paymentIntentId: string,
  priceId: string,
  billingReason: Stripe.Invoice.BillingReason = 'subscription_cycle',
): Stripe.Invoice {
  return {
    amount_due: 1000,
    amount_paid: 1000,
    billing_reason: billingReason,
    customer: customerId,
    id: 'in_test123',
    lines: {
      data: [
        {
          id: 'il_test',
          object: 'line_item',
          price: {
            active: true,
            currency: 'usd',
            id: priceId,
            object: 'price',
            recurring: {
              interval: 'month',
              interval_count: 1,
            },
            type: 'recurring',
            unit_amount: 1000,
          },
        },
      ],
      object: 'list',
    },
    object: 'invoice',
    payment_intent: paymentIntentId,
    status: 'paid',
    subscription: subscriptionId,
  } as Stripe.Invoice;
}

export function createMockRequest<T extends Stripe.Event.Type>(
  type: T,
  // biome-ignore lint/suspicious/noExplicitAny: Test mock data
  session: any,
): Request {
  const event = createMockEvent<T>(type, session);

  return createWebhookRequest(event);
}
