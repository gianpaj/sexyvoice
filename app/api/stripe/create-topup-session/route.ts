import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

import { stripe } from '@/lib/stripe/stripe-admin';
import { getUserById } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

const TOPUP_PACKAGES = {
  small: {
    priceId: process.env.STRIPE_TOPUP_5_PRICE_ID,
    credits: 10000,
    amount: 500, // $5.00
  },
  medium: {
    priceId: process.env.STRIPE_TOPUP_10_PRICE_ID,
    credits: 25000,
    amount: 1000, // $10.00
  },
  large: {
    priceId: process.env.STRIPE_TOPUP_99_PRICE_ID,
    credits: 220000,
    amount: 9900, // $99.00
  },
} as const;

type PackageType = keyof typeof TOPUP_PACKAGES;

export async function POST(req: Request) {
  try {
    const { packageType } = await req.json();

    if (!packageType || !TOPUP_PACKAGES[packageType as PackageType]) {
      const error = new Error('Invalid package type provided');
      Sentry.captureException(error, {
        tags: {
          section: 'stripe_topup',
          event_type: 'invalid_package',
        },
        extra: {
          package_type: packageType,
          valid_packages: Object.keys(TOPUP_PACKAGES),
        },
      });
      return NextResponse.json(
        { error: 'Invalid package type' },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const error = new Error('Unauthorized topup session request');
      Sentry.captureException(error, {
        tags: {
          section: 'stripe_topup',
          event_type: 'unauthorized',
        },
        extra: {
          package_type: packageType,
        },
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userData = await getUserById(user.id);
    if (!userData || !userData.stripe_id) {
      const error = new Error('User not found or missing Stripe ID');
      Sentry.captureException(error, {
        tags: {
          section: 'stripe_topup',
          event_type: 'user_not_found',
        },
        extra: {
          user_id: user.id,
          has_stripe_id: !!userData?.stripe_id,
          package_type: packageType,
        },
      });
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const package_ = TOPUP_PACKAGES[packageType as PackageType];

    // Verify the price ID exists to avoid runtime errors
    if (!package_.priceId) {
      const error = new Error('Missing price ID configuration');
      console.error(`Missing price ID for package type: ${packageType}`);
      Sentry.captureException(error, {
        tags: {
          section: 'stripe_topup',
          event_type: 'missing_price_id',
        },
        extra: {
          package_type: packageType,
          user_id: user.id,
        },
      });
      return NextResponse.json(
        { error: 'Package configuration error' },
        { status: 500 },
      );
    }
    const lang = 'en';

    const session = await stripe.checkout.sessions.create({
      customer: userData.stripe_id,
      payment_method_types: ['card'],
      line_items: [
        {
          price: package_.priceId,
          quantity: 1,
        },
      ],
      mode: 'payment', // One-time payment, not subscription
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/${lang}/dashboard/credits?success=true&amount=${package_.credits}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/${lang}/dashboard/credits?canceled=true`,
      metadata: {
        userId: user.id,
        packageType,
        credits: package_.credits.toString(),
        dollarAmount: (package_.amount / 100).toString(),
        type: 'topup',
      },
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating topup session:', error);
    Sentry.captureException(error, {
      tags: {
        section: 'stripe_topup',
        event_type: 'session_creation_error',
      },
      extra: {
        error_message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
