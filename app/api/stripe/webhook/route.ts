import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { setCustomerData } from '@/lib/redis/queries';
import {
  getUserIdByStripeCustomerId,
  insertCreditTransaction,
} from '@/lib/supabase/queries';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2025-02-24.acacia',
});

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
  }
  // console.log('Event processed successfully');

  return NextResponse.json({ received: true });
}

async function processEvent(event: Stripe.Event) {
  // Skip processing if the event isn't one I'm tracking (list of all events below)
  // if (!isAllowedStripeEvent(event)) {
  //   console.log('[STRIPE HOOK] Skipping event', event.type);
  //   return;
  // }

  // All the events I track have a customerId
  const { customer: customerId } = event?.data?.object as {
    customer: string; // Sadly TypeScript does not know this
  };
  // const customerId = event.data[0].customer;
  // console.log({ customerId });

  // This helps make it typesafe and also lets me know if my assumption is wrong
  if (typeof customerId !== 'string') {
    throw new Error(
      `[STRIPE HOOK][CANCER] ID isn't string.\nEvent type: ${event.type}`,
    );
  }

  return await syncStripeDataToKV(customerId);
  // return await syncStripeDataToKV(event, customerId);
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

// The contents of this function should probably be wrapped in a try/catch
// export async function syncStripeDataToKV(body, customerId) {
export async function syncStripeDataToKV(customerId: string) {
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
    console.error(`User not found with stripe_id: "${customerId}"`);
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
}
