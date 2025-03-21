import { NextRequest, NextResponse } from 'next/server';
import type { NextRequest as NextRequestType } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2025-01-27.acacia',
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stripeId = searchParams.get('stripeId');

    if (!stripeId) {
      return NextResponse.json(
        { error: 'Stripe ID is required' },
        { status: 400 },
      );
    }

    const supabase = createClient();

    // Check if user is authenticated
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    const transactions = [
      //   ...chargeTransactions,
      ...subscriptionTransactions,
    ].sort((a, b) => b.created - a.created);

    return NextResponse.json(transactions);
  } catch (error) {
    console.error('Error fetching Stripe transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 },
    );
  }
}
