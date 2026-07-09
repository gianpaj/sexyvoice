import { type NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { APIErrorResponse } from '@/lib/error-ts';
import { stripe } from '@/lib/stripe/stripe-admin';
import { getUserById } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stripeId = searchParams.get('stripeId');

    if (!stripeId) {
      return APIErrorResponse('Stripe ID is required', 400);
    }

    const supabase = await createClient();

    // Check if user is authenticated
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (!user || error) {
      return APIErrorResponse('Unauthorized', 401);
    }

    const userData = await getUserById(user.id);
    if (!userData?.stripe_id) {
      return APIErrorResponse('Stripe customer not found', 404);
    }

    if (userData.stripe_id !== stripeId) {
      return APIErrorResponse('Forbidden', 403);
    }

    // Get active subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeId,
      //   status: 'active',
      //   expand: ['data.latest_invoice']
    });

    // Get charges for this customer
    // const charges = await stripe.charges.list({
    //   customer: stripeId,
    //   limit: 10
    // })

    // console.dir(subscriptions.data, { depth: null })

    // Format the charges data
    // const chargeTransactions = charges.data.map(charge => ({
    //   id: charge.id,
    //   amount: charge.amount,
    //   type: 'payment',
    //   description: charge.description || 'Stripe payment',
    //   created: charge.created,
    //   status: charge.status
    // }))

    // Format subscription data
    const subscriptionTransactions = subscriptions.data.map((subscription) => {
      const invoice = subscription.latest_invoice as Stripe.Invoice;
      return {
        id: subscription.id,
        amount: subscription.items.data[0]?.price?.unit_amount || 0,
        type: 'subscription',
        description: `Subscription: ${subscription.items.data[0]?.price?.nickname || 'Plan'} (${subscription.status})`,
        created: subscription.created,
        status: subscription.status,
        current_period_end: subscription.current_period_end,
        current_period_start: subscription.current_period_start,
        invoice_id: typeof invoice === 'object' ? invoice.id : invoice,
      };
    });

    // Combine transactions and sort by created date
    const transactions = subscriptionTransactions.toSorted(
      (a, b) => b.created - a.created,
    );

    return NextResponse.json(transactions);
  } catch (error) {
    console.error('Error fetching Stripe transactions:', error);
    return APIErrorResponse('Failed to fetch transactions', 500);
  }
}
