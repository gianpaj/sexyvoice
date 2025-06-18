import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { setCustomerData } from '@/lib/redis/queries';
import { stripe } from '@/lib/stripe/stripe-admin';
import {
  getUserIdByStripeCustomerId,
  insertCreditTransaction,
  insertTopupTransaction,
} from '@/lib/supabase/queries';

export async function POST(req: Request) {
  const body = await req.text();
  // const body = await req.json();
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
    // await processEvent(body);
    // waitUntil(processEvent(event));
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
        signature: signature ? 'present' : 'missing',
        body_length: body?.length || 0,
      },
    });
  }
  // console.log('Event processed successfully');

  return NextResponse.json({ received: true });
}

async function processEvent(event: Stripe.Event) {
  console.log(`[STRIPE HOOK] Processing event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(
          event.data.object as Stripe.PaymentIntent,
        );
        break;
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
      case 'invoice.marked_uncollectible':
      case 'invoice.payment_succeeded': {
        // Handle subscription events as before
        const { customer: customerId } = event.data.object as {
          customer: string;
        };
        if (typeof customerId !== 'string') {
          throw new Error(
            `[STRIPE HOOK] Customer ID isn't string.\nEvent type: ${event.type}`,
          );
        }
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

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
) {
  try {
    if (session.mode === 'payment' && session.metadata?.type === 'topup') {
      // This is a one-time credit purchase
      const { userId, packageType, credits, dollarAmount } = session.metadata;

      if (!userId || !credits || !dollarAmount) {
        const error = new Error('Missing metadata for topup transaction');
        console.error(
          '[STRIPE HOOK] Missing metadata for topup transaction',
          session.metadata,
        );
        Sentry.captureException(error, {
          tags: {
            section: 'stripe_webhook',
            event_type: 'checkout_session_completed',
          },
          extra: {
            session_id: session.id,
            metadata: session.metadata,
          },
        });
        return;
      }

      const creditAmount = Number.parseInt(credits);
      const dollarAmountNum = Number.parseFloat(dollarAmount);

      console.log(
        `[STRIPE HOOK] Processing topup: ${creditAmount} credits for user ${userId}`,
      );

      await insertTopupTransaction(
        userId,
        session.payment_intent as string,
        creditAmount,
        dollarAmountNum,
        packageType || 'unknown',
      );

      console.log(
        `[STRIPE HOOK] Credits added: ${creditAmount} for user ${userId}`,
      );
    } else if (session.mode === 'subscription') {
      // Handle subscription checkout
      const customerId = session.customer as string;
      if (customerId) {
        await syncStripeDataToKV(customerId);
      }
    }
  } catch (error) {
    console.error(
      '[STRIPE HOOK] Error in handleCheckoutSessionCompleted:',
      error,
    );
    Sentry.captureException(error, {
      tags: {
        section: 'stripe_webhook',
        event_type: 'checkout_session_completed',
      },
      extra: {
        session_id: session.id,
        session_mode: session.mode,
        metadata: session.metadata,
      },
    });
    throw error;
  }
}

async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
) {
  try {
    // Additional handling if needed for payment confirmations
    console.log(`[STRIPE HOOK] Payment succeeded: ${paymentIntent.id}`);
  } catch (error) {
    console.error(
      '[STRIPE HOOK] Error in handlePaymentIntentSucceeded:',
      error,
    );
    Sentry.captureException(error, {
      tags: {
        section: 'stripe_webhook',
        event_type: 'payment_intent_succeeded',
      },
      extra: {
        payment_intent_id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
      },
    });
    throw error;
  }
}

// The contents of this function should probably be wrapped in a try/catch
// export async function syncStripeDataToKV(body, customerId) {
export async function syncStripeDataToKV(customerId: string) {
  try {
    // Fetch latest subscription data from Stripe
    // const subscriptions = body;
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      status: 'all',
      expand: ['data.default_payment_method'],
    });

    if (subscriptions.data.length === 0) {
      const subData = { status: 'none' };
      await setCustomerData(customerId, subData);
      return subData;
    }

    // If a user can have multiple subscriptions, that's your problem
    const subscription = subscriptions.data[0];

    // Store complete subscription state
    const subData = {
      subscriptionId: subscription.id,
      status: subscription.status,
      // priceId: subscription.plan.id,
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

    // Store the data in your KV
    await setCustomerData(customerId, subData);

    // console.log({ subscription });
    console.log({ subData });

    const userId = await getUserIdByStripeCustomerId(customerId);
    if (!userId) {
      const error = new Error(`User not found with stripe_id: "${customerId}"`);
      console.error(`User not found with stripe_id: "${customerId}"`);
      Sentry.captureException(error, {
        tags: {
          section: 'stripe_webhook',
          event_type: 'sync_stripe_data',
        },
        extra: {
          customer_id: customerId,
        },
      });
      return;
    }

    let amount = 0;
    let subAmount = 0;
    switch (subData.priceId) {
      // first is prod, 2nd is test
      case 'price_1R4m50J2uQQSTCBsvH8hpjN2':
      case 'price_1QncR5J2uQQSTCBsWa87AaEG':
        amount = 10000;
        subAmount = 5;
        break;
      case 'price_1R4m50J2uQQSTCBsKdEsgflW':
      case 'price_1QnczMJ2uQQSTCBsUzEnvPKj':
        amount = 25000;
        subAmount = 10;
        break;
      case 'price_1R4m50J2uQQSTCBs5j9ERzXC':
      case 'price_1QnkyTJ2uQQSTCBsgyw7xYb8':
        amount = 220_000;
        subAmount = 99;
        break;
      default:
        amount = 0;
        break;
    }

    if (subData.status === 'active') {
      await insertCreditTransaction(
        userId,
        subData.subscriptionId,
        amount,
        subAmount,
      );
    }

    // if cancelled and complete refund
    // if (subData.status === 'canceled') {
    //   await insertDebitTransaction(userId, subData.subscriptionId, amount);
    // }

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
