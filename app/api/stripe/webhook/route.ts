import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import type { CheckoutMetadata } from '@/app/[lang]/actions/stripe';
import { type CustomerData, setCustomerData } from '@/lib/redis/queries';
import { getTopupPackages } from '@/lib/stripe/pricing';
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
      tags: {
        section: 'stripe_webhook',
        event_type: 'processing_error',
      },
      extra: {
        body_length: body?.length || 0,
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

      // Subscription recurring payments - this is where credits are awarded for renewals
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
      tags: {
        section: 'stripe_webhook',
        event_type: event.type,
      },
      extra: {
        event_id: event.id,
        event_data: event.data,
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

// Handles completed Stripe checkout sessions for both one-time credit purchases and subscription checkouts
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
) {
  try {
    if (session.mode === 'payment' && session.metadata?.type === 'topup') {
      // This is a one-time credit purchase
      const { userId, packageId, credits, dollarAmount, promo } =
        session.metadata as unknown as CheckoutMetadata;

      if (!userId || !credits || !dollarAmount || !session.payment_intent) {
        const error = new Error('Missing metadata for topup transaction');
        const extra = {
          session_id: session.id,
          metadata: session.metadata,
          payment_intent: session.payment_intent,
        };
        console.error(
          '[STRIPE HOOK] Missing metadata for topup transaction',
          extra,
        );
        Sentry.captureException(error, {
          tags: {
            section: 'stripe_webhook',
            event_type: 'checkout_session_completed',
          },
          extra,
        });
        return;
      }

      const creditAmount = Number.parseInt(credits);
      const dollarAmountNum = Number.parseFloat(dollarAmount);

      console.log(
        `[STRIPE HOOK] Processing topup: ${creditAmount} credits for user ${userId}`,
      );
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent.id;
      await insertTopupCreditTransaction(
        userId,
        paymentIntentId,
        creditAmount,
        dollarAmountNum,
        packageId,
        promo,
      );

      console.log(
        `[STRIPE HOOK] Credits added: ${creditAmount} to user: ${userId}`,
      );
    } else if (session.mode === 'subscription') {
      // Handle initial subscription checkout
      const customerId = session.customer as string | null;
      const subscriptionId = session.subscription as string | null;

      if (!customerId || !subscriptionId) {
        const error = new Error('Missing customer or subscription ID');
        console.error(
          '[STRIPE HOOK] Missing customer or subscription ID in subscription checkout',
          { customerId, subscriptionId },
        );
        Sentry.captureException(error, {
          tags: {
            section: 'stripe_webhook',
            event_type: 'checkout_session_completed',
          },
          extra: {
            session_id: session.id,
          },
        });
        return;
      }

      // Sync subscription data to Redis
      await syncStripeDataToKV(customerId);

      // Award initial subscription credits
      const userId = await getUserIdByStripeCustomerId(customerId);
      if (!userId) {
        const error = new Error(
          `User not found with stripe_id: "${customerId}"`,
        );
        console.error(`User not found with stripe_id: "${customerId}"`);
        Sentry.captureException(error, {
          tags: {
            section: 'stripe_webhook',
            event_type: 'checkout_session_completed',
          },
          extra: {
            customer_id: customerId,
          },
        });
        return;
      }

      // Get subscription details to determine credit amount
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0].price.id;

      const TOPUP_PACKAGES = getTopupPackages('en');
      let credits = 0;
      let dollarAmount = 0;

      switch (priceId) {
        case process.env.STRIPE_SUBSCRIPTION_5_PRICE_ID:
          credits = TOPUP_PACKAGES.starter.credits;
          dollarAmount = TOPUP_PACKAGES.starter.dollarAmount;
          break;
        case process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID:
          credits = TOPUP_PACKAGES.standard.credits;
          dollarAmount = TOPUP_PACKAGES.standard.dollarAmount;
          break;
        case process.env.STRIPE_SUBSCRIPTION_99_PRICE_ID:
          credits = TOPUP_PACKAGES.pro.credits;
          dollarAmount = TOPUP_PACKAGES.pro.dollarAmount;
          break;
        default:
          console.error('[STRIPE HOOK] Invalid subscription price ID', {
            priceId,
          });
          return;
      }

      // Get payment intent from the session (for initial subscription payment)
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;
      if (!paymentIntentId) {
        console.error(
          '[STRIPE HOOK] No payment intent in subscription checkout session',
        );
        return;
      }

      await insertSubscriptionCreditTransaction(
        userId,
        paymentIntentId,
        subscriptionId,
        credits,
        dollarAmount,
      );

      console.log(
        `[STRIPE HOOK] Initial subscription credits added: ${credits} to user: ${userId}`,
      );
    }
  } catch (error) {
    const extra = {
      session_id: session.id,
      session_mode: session.mode,
      metadata: session.metadata,
    };
    console.error(
      '[STRIPE HOOK] Error in handleCheckoutSessionCompleted:',
      extra,
    );
    Sentry.captureException(error, {
      tags: {
        section: 'stripe_webhook',
        event_type: 'checkout_session_completed',
      },
      extra,
    });
    throw error;
  }
}

// Handles successful invoice payments (recurring subscription payments)
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
    const paymentIntentId = invoice.payment_intent as string | null;

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
        tags: {
          section: 'stripe_webhook',
          event_type: 'invoice_payment_succeeded',
        },
        extra: {
          customer_id: customerId,
          invoice_id: invoice.id,
        },
      });
      return;
    }

    // Get subscription details
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const priceId = subscription.items.data[0].price.id;

    const TOPUP_PACKAGES = getTopupPackages('en');
    let credits = 0;
    let dollarAmount = 0;

    switch (priceId) {
      case process.env.STRIPE_SUBSCRIPTION_5_PRICE_ID:
        credits = TOPUP_PACKAGES.starter.credits;
        dollarAmount = TOPUP_PACKAGES.starter.dollarAmount;
        break;
      case process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID:
        credits = TOPUP_PACKAGES.standard.credits;
        dollarAmount = TOPUP_PACKAGES.standard.dollarAmount;
        break;
      case process.env.STRIPE_SUBSCRIPTION_99_PRICE_ID:
        credits = TOPUP_PACKAGES.pro.credits;
        dollarAmount = TOPUP_PACKAGES.pro.dollarAmount;
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
      `[STRIPE HOOK] Recurring subscription credits added: ${credits} to user: ${userId}`,
    );

    // Also update Redis cache with latest subscription status
    await syncStripeDataToKV(customerId);
  } catch (error) {
    console.error(
      '[STRIPE HOOK] Error in handleInvoicePaymentSucceeded:',
      error,
    );
    Sentry.captureException(error, {
      tags: {
        section: 'stripe_webhook',
        event_type: 'invoice_payment_succeeded',
      },
      extra: {
        invoice_id: invoice.id,
        subscription_id: invoice.subscription,
        customer_id: invoice.customer,
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
      limit: 1,
      status: 'all',
      expand: ['data.default_payment_method'],
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
      subscriptionId: subscription.id,
      status: subscription.status,
      priceId: subscription.items.data[0].price.id,
      currentPeriodEnd: subscription.current_period_end,
      currentPeriodStart: subscription.current_period_start,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      paymentMethod:
        subscription.default_payment_method &&
        typeof subscription.default_payment_method !== 'string'
          ? {
              brand: subscription.default_payment_method.card?.brand ?? null,
              last4: subscription.default_payment_method.card?.last4 ?? null,
            }
          : null,
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
      tags: {
        section: 'stripe_webhook',
        event_type: 'sync_stripe_data',
      },
      extra: {
        customer_id: customerId,
      },
    });
    throw error;
  }
}
