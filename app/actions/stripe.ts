'use server';

import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import type { Stripe } from 'stripe';

// import { CURRENCY } from '@/config';

import { stripe } from '@/lib/stripe/stripe-admin';
import { getUserById } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { formatAmountForStripe } from '@/utils/stripe-helpers';

const CURRENCY = 'USD';

const TOPUP_PACKAGES = {
  standard: {
    priceId: process.env.STRIPE_TOPUP_5_PRICE_ID,
    credits: 10000,
    amount: 500, // $5.00
  },
  base: {
    priceId: process.env.STRIPE_TOPUP_10_PRICE_ID,
    credits: 25000,
    amount: 1000, // $10.00
  },
  premium: {
    priceId: process.env.STRIPE_TOPUP_99_PRICE_ID,
    credits: 220000,
    amount: 9900, // $99.00
  },
} as const;

type PackageType = keyof typeof TOPUP_PACKAGES;

export async function createCheckoutSession(
  data: FormData,
  packageType: PackageType,
): Promise<{ client_secret: string | null; url: string | null }> {
  try {
    const ui_mode = data.get(
      'uiMode',
    ) as Stripe.Checkout.SessionCreateParams.UiMode;
    const reqHeaders = await headers();
    const origin: string = reqHeaders.get('origin') as string;

    const package_ = TOPUP_PACKAGES[packageType as PackageType];

    // Verify the price ID exists to avoid runtime errors
    if (!package_.priceId) {
      const error = new Error('Invalid package type');
      console.error(`Missing price ID for package type: ${packageType}`);
      Sentry.captureException(error, {
        tags: {
          section: 'stripe_actions',
          event_type: 'missing_price_id',
        },
        extra: {
          package_type: packageType,
          available_packages: Object.keys(TOPUP_PACKAGES),
        },
      });
      throw error;
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const userData = user && (await getUserById(user.id));
    if (!userData || !userData.stripe_id) {
      const error = new Error('User not found or Stripe ID missing');
      Sentry.captureException(error, {
        tags: {
          section: 'stripe_actions',
          event_type: 'user_validation_error',
        },
        extra: {
          user_id: user?.id,
          has_user_data: !!userData,
          has_stripe_id: !!userData?.stripe_id,
          package_type: packageType,
        },
      });
      throw error;
    }

    const lang = 'en';
    const checkoutSession: Stripe.Checkout.Session =
      await stripe.checkout.sessions.create({
        mode: 'payment', // One-time payment, not subscription
        customer: userData.stripe_id,
        line_items: [
          {
            quantity: 1,
            price: package_.priceId,
          },
        ],
        ...(ui_mode === 'hosted' && {
          success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/${lang}/dashboard/credits?success=true&amount=${package_.credits}`,
          cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/${lang}/dashboard/credits?canceled=true`,
        }),
        ...(ui_mode === 'embedded' && {
          return_url: `${origin}/donate-with-embedded-checkout/result?session_id={CHECKOUT_SESSION_ID}`,
        }),
        ui_mode,
        metadata: {
          userId: user.id,
          packageType,
          credits: package_.credits.toString(),
          dollarAmount: (package_.amount / 100).toString(),
          type: 'topup',
        },
      });

    return {
      client_secret: checkoutSession.client_secret,
      url: checkoutSession.url,
    };
  } catch (error) {
    console.error('Error creating checkout session:', error);
    Sentry.captureException(error, {
      tags: {
        section: 'stripe_actions',
        event_type: 'checkout_session_creation_error',
      },
      extra: {
        package_type: packageType,
        ui_mode: data.get('uiMode'),
        error_message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    throw error;
  }
}

export async function createPaymentIntent(
  data: FormData,
): Promise<{ client_secret: string }> {
  try {
    const customDonation = data.get('customDonation') as string;
    const amount = formatAmountForStripe(Number(customDonation), CURRENCY);

    const paymentIntent: Stripe.PaymentIntent =
      await stripe.paymentIntents.create({
        amount,
        automatic_payment_methods: { enabled: true },
        currency: CURRENCY,
      });

    return { client_secret: paymentIntent.client_secret as string };
  } catch (error) {
    console.error('Error creating payment intent:', error);
    Sentry.captureException(error, {
      tags: {
        section: 'stripe_actions',
        event_type: 'payment_intent_creation_error',
      },
      extra: {
        custom_donation: data.get('customDonation'),
        currency: CURRENCY,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    throw error;
  }
}
