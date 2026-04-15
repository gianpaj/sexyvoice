'use server';

import * as Sentry from '@sentry/nextjs';
import type { Stripe } from 'stripe';

import {
  getSubscriptionPackages,
  getTopupPackages,
  type PackageType,
} from '@/lib/stripe/pricing';
import { hasEverHadRealSubscription, stripe } from '@/lib/stripe/stripe-admin';
import { getUserById } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

export interface CheckoutMetadata {
  credits?: string;
  dollarAmount?: string;
  packageId: PackageType;
  promo?: string;
  subscriptionDiscountCouponId?: string;
  type: 'subscription' | 'topup';
  userId: string;
}

export async function createCheckoutSession(
  data: FormData,
  packageId: PackageType,
): Promise<{ client_secret: string | null; url: string | null }> {
  try {
    const ui_mode = data.get(
      'uiMode',
    ) as Stripe.Checkout.SessionCreateParams.UiMode;
    const checkoutType =
      (data.get('type') as CheckoutMetadata['type']) || 'topup';
    const lang = 'en';

    const topupPackages = getTopupPackages(lang);
    const subscriptionPackages = getSubscriptionPackages(lang);
    const package_ =
      checkoutType === 'subscription'
        ? subscriptionPackages[
            packageId as Exclude<keyof typeof subscriptionPackages, 'free'>
          ]
        : topupPackages[packageId];

    // Verify the price ID exists to avoid runtime errors
    if (!package_?.priceId) {
      const error = new Error('Invalid package id');
      console.error(
        `Missing price ID for package id: ${packageId} - priceId: ${package_?.priceId}`,
      );
      Sentry.captureException(error, {
        tags: {
          section: 'stripe_actions',
          event_type: 'missing_price_id',
        },
        extra: {
          packageId,
          checkoutType,
          priceId: package_?.priceId,
          available_packages: Object.keys(
            checkoutType === 'subscription'
              ? subscriptionPackages
              : topupPackages,
          ),
        },
      });
      throw error;
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const userData = user && (await getUserById(user.id));
    // biome-ignore lint/complexity/useOptionalChain: needed
    if (!(userData && userData.stripe_id)) {
      const error = new Error('User not found or Stripe ID missing');
      Sentry.captureException(error, {
        user: { id: user?.id, email: user?.email },
        tags: {
          section: 'stripe_actions',
          event_type: 'user_validation_error',
        },
        extra: {
          has_user_data: !!userData,
          has_stripe_id: !!userData?.stripe_id,
          packageId,
          checkoutType,
        },
      });
      throw error;
    }

    const subscriptionDiscountCouponId =
      process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID;
    const hasExistingSubscriptionHistory =
      checkoutType === 'subscription'
        ? await hasEverHadRealSubscription(userData.stripe_id)
        : false;
    const shouldApplySubscriptionDiscount =
      checkoutType === 'subscription' &&
      !!subscriptionDiscountCouponId &&
      !hasExistingSubscriptionHistory;

    const metadata: CheckoutMetadata =
      checkoutType === 'subscription'
        ? {
            userId: user.id,
            packageId,
            type: 'subscription',
            ...(shouldApplySubscriptionDiscount && {
              subscriptionDiscountCouponId,
            }),
          }
        : {
            userId: user.id,
            packageId,
            credits: package_.credits.toString(),
            dollarAmount: package_.dollarAmount.toString(),
            type: 'topup',
            ...(process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true' && {
              promo: process.env.NEXT_PUBLIC_PROMO_ID,
            }),
          };

    const checkoutSession: Stripe.Checkout.Session =
      await stripe.checkout.sessions.create({
        mode: checkoutType === 'subscription' ? 'subscription' : 'payment',
        customer: userData.stripe_id,
        line_items: [
          {
            quantity: 1,
            price: package_.priceId,
          },
        ],
        ...(checkoutType === 'subscription' &&
          shouldApplySubscriptionDiscount && {
            discounts: [
              {
                coupon: subscriptionDiscountCouponId,
              },
            ],
          }),
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
        checkout_type: data.get('type') || 'topup',
        ui_mode: data.get('uiMode'),
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
