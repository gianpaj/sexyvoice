// biome-ignore lint/performance/noNamespaceImport: keep Sentry imports consistent with its Next.js integration
import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import type { TopupCheckoutMetadata } from '@/app/[lang]/actions/stripe';
import { type CustomerData, setCustomerData } from '@/lib/redis/queries';
import { getSubscriptionPackages } from '@/lib/stripe/pricing';
import { stripe } from '@/lib/stripe/stripe-admin';
import {
  getUserIdByStripeCustomerId,
  insertSubscriptionCreditTransaction,
  insertTopupCreditTransaction,
} from '@/lib/supabase/queries';

export async function POST(req: Request) {
  // Stripe expects the body to be "untouched" so it can verify the signature.
  const body = await req.text();
  const signature = (await headers()).get('Stripe-Signature');

  if (!signature) return NextResponse.json({}, { status: 400 });

  async function doEventProcessing() {
    if (typeof signature !== 'string') {
      throw new Error("[STRIPE HOOK] Header isn't a string???");
    }

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );

    await processEvent(event);
  }

  try {
    await doEventProcessing();
  } catch (error) {
    console.error('[STRIPE HOOK] Error processing event', error);
    Sentry.captureException(error, {
      extra: {
        body_length: body?.length || 0,
      },
      tags: {
        event_type: 'processing_error',
        section: 'stripe_webhook',
      },
    });
  }

  return NextResponse.json({ received: true });
}

async function processEvent(event: Stripe.Event) {
  console.log(`[STRIPE HOOK] Processing event: ${event.type}`);

  try {
    switch (event.type) {
      // Top-up purchases
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      // Subscription payments award credits for initial invoices and renewals
      case 'invoice.payment_succeeded': {
        await handleInvoicePaymentSucceeded(
          event.data.object as Stripe.Invoice,
        );
        break;
      }

      // Subscription lifecycle events - only update Redis cache
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
      case 'customer.subscription.pending_update_applied':
      case 'customer.subscription.pending_update_expired':
      case 'customer.subscription.trial_will_end':
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.payment_action_required':
      case 'invoice.upcoming':
      case 'invoice.marked_uncollectible': {
        const { customer: customerId } = event.data.object as {
          customer: string;
        };
        if (typeof customerId !== 'string') {
          throw new Error(
            `[STRIPE HOOK] Customer ID isn't string.\nEvent type: ${event.type}`,
          );
        }
        // Only sync subscription status to Redis, no credit insertion
        await syncStripeDataToKV(customerId);
        break;
      }

      default:
        console.log(`[STRIPE HOOK] Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error(`[STRIPE HOOK] Error processing event ${event.type}:`, error);
    Sentry.captureException(error, {
      extra: {
        event_data: event.data,
        event_id: event.id,
      },
      tags: {
        event_type: event.type,
        section: 'stripe_webhook',
      },
    });
    throw error;
  }
}

export const allowedEvents = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.pending_update_applied',
  'customer.subscription.pending_update_expired',
  'customer.subscription.trial_will_end',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.upcoming',
  'invoice.marked_uncollectible',
  'invoice.payment_succeeded',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
] as const satisfies readonly Stripe.Event.Type[];

export type AllowedEventType = (typeof allowedEvents)[number];
export type AllowedStripeEvent = Extract<
  Stripe.Event,
  { type: AllowedEventType }
>;

export const isAllowedStripeEvent = (
  event: Stripe.Event,
): event is AllowedStripeEvent =>
  allowedEvents.includes(event.type as AllowedEventType);

const resolvePaymentIntentId = (
  paymentIntent: string | Stripe.PaymentIntent | null | undefined,
): string | null =>
  typeof paymentIntent === 'string'
    ? paymentIntent
    : (paymentIntent?.id ?? null);

// Handles completed Stripe checkout sessions for both one-time credit purchases and subscription checkouts
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
) {
  try {
    if (session.mode === 'payment' && session.metadata?.type === 'topup') {
      // This is a one-time credit purchase
      const { userId, packageId, credits, dollarAmount, promo } =
        session.metadata as unknown as TopupCheckoutMetadata;

      if (!(userId && credits && dollarAmount && session.payment_intent)) {
        const error = new Error('Missing metadata for topup transaction');
        const extra = {
          metadata: session.metadata,
          payment_intent: session.payment_intent,
          session_id: session.id,
        };
        console.error(
          '[STRIPE HOOK] Missing metadata for topup transaction',
          extra,
        );
        Sentry.captureException(error, {
          extra,
          tags: {
            event_type: 'checkout_session_completed',
            section: 'stripe_webhook',
          },
        });
        return;
      }

      const creditAmount = Number.parseInt(credits, 10);
      const dollarAmountNum = Number.parseFloat(dollarAmount);

      console.log(
        `[STRIPE HOOK] Processing topup: ${creditAmount} credits for user ${userId}`,
      );

      await insertTopupCreditTransaction(
        userId,
        session.payment_intent.toString(),
        creditAmount,
        dollarAmountNum,
        packageId,
        promo,
      );

      console.log(
        `[STRIPE HOOK] Credits added: ${creditAmount} to user: ${userId}`,
      );
    } else if (session.mode === 'subscription') {
      // Invoice payment events award subscription credits; checkout only syncs Redis.
      const customerId =
        typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id;

      if (!customerId) {
        const error = new Error('Missing customer ID in subscription checkout');
        console.error(
          '[STRIPE HOOK] Missing customer ID in subscription checkout',
          { session_id: session.id },
        );
        Sentry.captureException(error, {
          extra: {
            session_id: session.id,
          },
          tags: {
            event_type: 'checkout_session_completed',
            section: 'stripe_webhook',
          },
        });
        return;
      }

      await syncStripeDataToKV(customerId);
    }
  } catch (error) {
    const extra = {
      metadata: session.metadata,
      session_id: session.id,
      session_mode: session.mode,
    };
    console.error(
      '[STRIPE HOOK] Error in handleCheckoutSessionCompleted:',
      extra,
    );
    Sentry.captureException(error, {
      extra,
      tags: {
        event_type: 'checkout_session_completed',
        section: 'stripe_webhook',
      },
    });
    throw error;
  }
}

// Handles successful initial and recurring subscription invoice payments
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  try {
    // Only process subscription invoices, not one-time invoices
    if (!invoice.subscription || invoice.billing_reason === 'manual') {
      console.log(
        '[STRIPE HOOK] Skipping non-subscription invoice or manual invoice',
      );
      return;
    }

    const customerId = invoice.customer as string;
    const subscriptionId = invoice.subscription as string;
    const paymentIntentId = resolvePaymentIntentId(invoice.payment_intent);

    if (!paymentIntentId) {
      console.error(
        '[STRIPE HOOK] No payment intent in invoice.payment_succeeded',
        {
          invoice_id: invoice.id,
          subscription_id: subscriptionId,
        },
      );
      return;
    }

    // Get user ID
    const userId = await getUserIdByStripeCustomerId(customerId);
    if (!userId) {
      const error = new Error(`User not found with stripe_id: "${customerId}"`);
      console.error(`User not found with stripe_id: "${customerId}"`);
      Sentry.captureException(error, {
        extra: {
          customer_id: customerId,
          invoice_id: invoice.id,
        },
        tags: {
          event_type: 'invoice_payment_succeeded',
          section: 'stripe_webhook',
        },
      });
      return;
    }

    // Get subscription details
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const priceId = subscription.items.data[0].price.id;

    // The first invoice may carry the first-month discount coupon.
    const isInitialSubscriptionInvoice =
      invoice.billing_reason === 'subscription_create';
    const SUBSCRIPTION_PACKAGES = getSubscriptionPackages('en', {
      applyFirstMonthDiscount:
        isInitialSubscriptionInvoice && !!invoice.discount,
    });
    let credits = 0;
    let dollarAmount = 0;

    switch (priceId) {
      case process.env.STRIPE_SUBSCRIPTION_STARTER_PRICE_ID:
        credits = SUBSCRIPTION_PACKAGES.starter.credits;
        dollarAmount = isInitialSubscriptionInvoice
          ? SUBSCRIPTION_PACKAGES.starter.dollarAmount
          : SUBSCRIPTION_PACKAGES.starter.recurringDollarAmount;
        break;
      case process.env.STRIPE_SUBSCRIPTION_STANDARD_PRICE_ID:
        credits = SUBSCRIPTION_PACKAGES.standard.credits;
        dollarAmount = isInitialSubscriptionInvoice
          ? SUBSCRIPTION_PACKAGES.standard.dollarAmount
          : SUBSCRIPTION_PACKAGES.standard.recurringDollarAmount;
        break;
      case process.env.STRIPE_SUBSCRIPTION_PRO_PRICE_ID:
        credits = SUBSCRIPTION_PACKAGES.pro.credits;
        dollarAmount = isInitialSubscriptionInvoice
          ? SUBSCRIPTION_PACKAGES.pro.dollarAmount
          : SUBSCRIPTION_PACKAGES.pro.recurringDollarAmount;
        break;
      default:
        console.error('[STRIPE HOOK] Invalid subscription price ID', {
          priceId,
        });
        return;
    }

    // Insert credit transaction using payment_intent as reference_id
    await insertSubscriptionCreditTransaction(
      userId,
      paymentIntentId,
      subscriptionId,
      credits,
      dollarAmount,
    );

    console.log(
      `[STRIPE HOOK] Subscription credits added: ${credits} to user: ${userId}`,
    );

    // Also update Redis cache with latest subscription status
    await syncStripeDataToKV(customerId);
  } catch (error) {
    console.error(
      '[STRIPE HOOK] Error in handleInvoicePaymentSucceeded:',
      error,
    );
    Sentry.captureException(error, {
      extra: {
        customer_id: invoice.customer,
        invoice_id: invoice.id,
        subscription_id: invoice.subscription,
      },
      tags: {
        event_type: 'invoice_payment_succeeded',
        section: 'stripe_webhook',
      },
    });
    throw error;
  }
}

// Syncs Stripe subscription data to Redis KV store
// This function ONLY updates the cache and does NOT insert credit transactions
export async function syncStripeDataToKV(customerId: string) {
  try {
    // Fetch latest subscription data from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      expand: ['data.default_payment_method'],
      limit: 1,
      status: 'all',
    });

    if (subscriptions.data.length === 0) {
      const subData: CustomerData = { status: 'none' };
      await setCustomerData(customerId, subData);
      return subData;
    }

    // If a user can have multiple subscriptions, that's your problem
    const subscription = subscriptions.data[0];

    // Store complete subscription state
    const subData = {
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: subscription.current_period_end,
      currentPeriodStart: subscription.current_period_start,
      paymentMethod:
        subscription.default_payment_method &&
        typeof subscription.default_payment_method !== 'string'
          ? {
              brand: subscription.default_payment_method.card?.brand ?? null,
              last4: subscription.default_payment_method.card?.last4 ?? null,
            }
          : null,
      priceId: subscription.items.data[0].price.id,
      status: subscription.status,
      subscriptionId: subscription.id,
    };

    // Store the data in Redis KV
    await setCustomerData(customerId, subData);

    console.log('[STRIPE HOOK] Synced subscription data to Redis:', {
      customerId,
      status: subData.status,
      subscriptionId: subData.subscriptionId,
    });

    return subData;
  } catch (error) {
    console.error('[STRIPE HOOK] Error in syncStripeDataToKV:', error);
    Sentry.captureException(error, {
      extra: {
        customer_id: customerId,
      },
      tags: {
        event_type: 'sync_stripe_data',
        section: 'stripe_webhook',
      },
    });
    throw error;
  }
}
