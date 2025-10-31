'use server';

import * as Sentry from '@sentry/nextjs';
import type { Stripe } from 'stripe';

import { getTopupPackages, type PackageType } from '@/lib/stripe/pricing';
import { stripe } from '@/lib/stripe/stripe-admin';
import { getUserById } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

export interface CheckoutMetadata {
  userId: string;
  packageId: PackageType;
  credits: string;
  dollarAmount: string;
  type: 'topup';
  promo?: string;
}

export async function createCheckoutSession(
  data: FormData,
  packageId: PackageType,
): Promise<{ client_secret: string | null; url: string | null }> {
  try {
    const ui_mode = data.get(
      'uiMode',
    ) as Stripe.Checkout.SessionCreateParams.UiMode;

    const package_ = getTopupPackages('en')[packageId];

    // Verify the price ID exists to avoid runtime errors
    if (!package_ || !package_.priceId) {
      const error = new Error('Invalid package id');
      console.error(
        `Missing price ID for package id: ${packageId} - priceId: ${package_.priceId}`,
      );
      Sentry.captureException(error, {
        tags: {
          section: 'stripe_actions',
          event_type: 'missing_price_id',
        },
        extra: {
          packageId,
          priceId: package_.priceId,
          available_packages: Object.keys(getTopupPackages('en')),
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
          packageId,
        },
      });
      throw error;
    }
    const metadata: CheckoutMetadata = {
      userId: user.id,
      packageId,
      credits: package_.credits.toString(),
      dollarAmount: package_.dollarAmount.toString(),
      type: 'topup',
      ...(process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true' && {
        promo: process.env.NEXT_PUBLIC_PROMO_ID,
      }),
    };

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
          success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/${lang}/dashboard/credits?success=true&creditsAmount=${package_.credits}`,
          cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/${lang}/dashboard/credits?canceled=true`,
        }),
        ui_mode,
        metadata: metadata as unknown as Stripe.MetadataParam,
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
        packageId,
        ui_mode: data.get('uiMode'),
        error_message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    throw error;
  }
}
