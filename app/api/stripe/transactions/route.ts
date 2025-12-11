import { type NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { stripe } from '@/lib/stripe/stripe-admin';
import { createClient } from '@/lib/supabase/server';

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

    const supabase = await createClient();

    // Check if user is authenticated
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (!user || error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get active subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeId,
      //   status: 'active',
      //   expand: ['data.latest_invoice']
    });

    // Format subscription data
    const subscriptionTransactions = subscriptions.data.map((subscription) => {
      const invoice = subscription.latest_invoice as Stripe.Invoice;
      const firstSubscriptionItem = subscription.items.data[0];
      return {
        id: subscription.id,
        amount: firstSubscriptionItem?.price?.unit_amount || 0,
        type: 'subscription',
        description: `Subscription: ${firstSubscriptionItem?.price?.nickname || 'Plan'} (${subscription.status})`,
        created: subscription.created,
        status: subscription.status,
        current_period_end: firstSubscriptionItem?.current_period_end ?? null,
        current_period_start:
          firstSubscriptionItem?.current_period_start ?? null,
        invoice_id: typeof invoice === 'object' ? invoice.id : invoice,
      };
    });

    subscriptionTransactions.sort((a, b) => b.created - a.created);

    return NextResponse.json(subscriptionTransactions);
  } catch (error) {
    console.error('Error fetching Stripe transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 },
    );
  }
}
