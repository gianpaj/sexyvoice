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
      apiVersion: '2025-11-17.clover',
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
    id: `evt_test_${Date.now()}`,
    object: 'event',
    api_version: '2025-11-17.clover',
    created: Math.floor(Date.now() / 1000),
    type,
    data: {
      object: data,
    },
    livemode: false,
    pending_webhooks: 0,
    request: {
      id: null,
      idempotency_key: null,
    },
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
    id: 'cs_test_123',
    object: 'checkout.session',
    mode,
    customer: 'cus_test123',
    payment_intent: mode === 'payment' ? 'pi_test123' : null,
    subscription: mode === 'subscription' ? 'sub_test123' : null,
    metadata: (metadata as unknown as Stripe.Metadata) || {},
    payment_status: 'paid',
    status: 'complete',
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
    id: 'sub_test123',
    object: 'subscription',
    customer: 'cus_test123',
    status,
    cancel_at_period_end: false,
    items: {
      object: 'list',
      data: [
        {
          id: 'si_test',
          object: 'subscription_item',
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 2_592_000, // +30 days
          price: {
            id: priceId,
            object: 'price',
            active: true,
            currency: 'usd',
            unit_amount: 1500,
            type: 'recurring',
            recurring: {
              interval: 'month',
              interval_count: 1,
            },
          },
        },
      ],
    },
    default_payment_method: {
      id: 'pm_test',
      object: 'payment_method',
      card: {
        brand: 'visa',
        last4: '4242',
      },
    },
  } as Stripe.Response<Stripe.Subscription>;
}

/**
 * Creates mock invoice object
 */

// biome-ignore lint/nursery/useMaxParams: it's grand
export function createMockInvoice(
  subscriptionId: string,
  customerId: string,
  paymentIntentId: string,
  priceId: string,
  billingReason: Stripe.Invoice.BillingReason = 'subscription_cycle',
): Partial<Stripe.Invoice> {
  const now = Math.floor(Date.now() / 1000);

  return {
    id: 'in_test123',
    object: 'invoice',
    billing_reason: billingReason,
    collection_method: 'charge_automatically',
    created: now,
    currency: 'usd',
    custom_fields: null,
    customer: customerId,
    parent: {
      subscription_details: {
        subscription: subscriptionId,
        metadata: null as unknown as Stripe.Metadata,
      },
      quote_details: null,
      type: 'subscription_details',
    },
    payments: {
      object: 'list',
      data: [
        {
          id: 'py_test123',
          object: 'invoice_payment',
          amount: 1000,
          amount_refunded: 0,
          charge: 'ch_test123',
          created: now,
          currency: 'usd',
          invoice: 'in_test123',
          livemode: false,
          payment: {
            id: paymentIntentId,
            object: 'charge',
            payment_intent: paymentIntentId,
          },
          status: 'succeeded',
          tax: null,
          type: 'charge',
          metadata: null,
        } as unknown as Stripe.InvoicePayment,
      ],
      has_more: false,
      url: '/v1/invoices/in_test123/payments',
    },
    period_end: now,
    period_start: now - 2_592_000,
    status: 'paid',
    status_transitions: {
      finalized_at: now,
      marked_uncollectible_at: null,
      paid_at: now,
      voided_at: null,
    },
    subtotal: 1000,
    subtotal_excluding_tax: 1000,
    test_clock: null,
    total: 1000,
    total_discount_amounts: null,
    total_excluding_tax: 1000,
    lines: {
      object: 'list',
      data: [
        {
          id: 'il_test',
          object: 'line_item',
          amount: 1000,
          amount_excluding_tax: 1000,
          billing_details: null,
          currency: 'usd',
          custom_fields: null,
          description: null,
          discount_amounts: null,
          discountable: true,
          discounts: [],
          invoice: 'in_test123',
          livemode: false,
          metadata: null as unknown as Stripe.Metadata,
          period: {
            end: Math.floor(Date.now() / 1000),
            start: Math.floor(Date.now() / 1000) - 2_592_000,
          },
          plan: null,
          price: null,
          proration: false,
          proration_details: null,
          quantity: 1,
          subscription: subscriptionId,
          subscription_item: 'si_test',
          tax_amounts: [],
          type: 'subscription',
          unit_amount_excluding_tax: null,
          parent: {
            type: 'subscription_item_details',
            subscription_item_details: {
              subscription_item: 'si_test',
            } as Stripe.InvoiceLineItem.Parent.SubscriptionItemDetails,
            invoice_item_details: null,
            quote_details: null,
          },
          pretax_credit_amounts: null,
          pricing: {
            type: 'price_details',
            price_details: {
              price: priceId,
              product: 'prod_test123',
            },
            unit_amount_decimal: '1000',
          },
          taxes: null,
        } as Stripe.InvoiceLineItem,
      ],
      has_more: false,
      url: '/v1/invoices/in_test123/lines',
    },
  };
}

export function createMockRequest<T extends Stripe.Event.Type>(
  type: T,
  // biome-ignore lint/suspicious/noExplicitAny: Test mock data
  session: any,
): Request {
  const event = createMockEvent<T>(type, session);

  return createWebhookRequest(event);
}
