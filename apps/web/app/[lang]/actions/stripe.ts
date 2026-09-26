'use server';

import { captureException, captureMessage } from '@sentry/nextjs';
import type { Stripe } from 'stripe';

import { isE2E } from '@/lib/e2e-mode';
import {
  CUSTOM_TOPUP_PACKAGE_ID,
  calculateCustomTopupCents,
  getSubscriptionPackages,
  getTopupPackages,
  type PackageType,
  validateCustomCreditAmount,
} from '@/lib/stripe/pricing';
import {
  hasAnySubscriptionHistory,
  isStripeCouponUsable,
  stripe,
} from '@/lib/stripe/stripe-admin';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { getUserById } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

const CHECKOUT_CONFIGURATION_ERROR = 'CHECKOUT_CONFIGURATION_ERROR';
const CHECKOUT_INVALID_PACKAGE_ID = 'CHECKOUT_INVALID_PACKAGE_ID';

type CheckoutPackageId = Exclude<PackageType, 'free'>;

/**
 * What can end up as `packageId` on a top-up transaction: one of the fixed
 * packages, or `custom` for a user-chosen credit amount.
 */
type TopupPackageId = CheckoutPackageId | typeof CUSTOM_TOPUP_PACKAGE_ID;

const CHECKOUT_PACKAGE_IDS = Object.keys(getTopupPackages('en')).filter(
  (packageId): packageId is CheckoutPackageId => packageId !== 'free',
);

const isCheckoutPackageId = (value: unknown): value is CheckoutPackageId =>
  typeof value === 'string' &&
  CHECKOUT_PACKAGE_IDS.includes(value as CheckoutPackageId);

const shouldReportCheckoutConfigurationError = () =>
  process.env.VERCEL_ENV === 'production';

const shouldReportInvalidCheckoutPackageId = () =>
  process.env.VERCEL_ENV === 'production';

const isCheckoutSetupError = (
  error: unknown,
): error is Error & { cause: unknown } =>
  Error.isError(error) &&
  [CHECKOUT_CONFIGURATION_ERROR, CHECKOUT_INVALID_PACKAGE_ID].includes(
    String(error.cause),
  );

function reportCheckoutSetupError(
  error: Error & { cause: unknown },
  packageId: CheckoutPackageId,
) {
  if (
    error.cause === CHECKOUT_INVALID_PACKAGE_ID &&
    shouldReportInvalidCheckoutPackageId()
  ) {
    captureMessage('Invalid checkout package id submitted.', {
      extra: {
        available_packages: CHECKOUT_PACKAGE_IDS,
        packageId,
        vercelEnv: process.env.VERCEL_ENV ?? null,
      },
      level: 'info',
      tags: {
        event_type: 'invalid_package_id',
        section: 'stripe_actions',
      },
    });
  }

  if (
    error.cause === CHECKOUT_CONFIGURATION_ERROR &&
    shouldReportCheckoutConfigurationError()
  ) {
    captureException(error, {
      extra: {
        available_packages: Object.keys(getTopupPackages('en')),
        packageId,
        vercelEnv: process.env.VERCEL_ENV ?? null,
      },
      tags: {
        event_type: 'missing_price_id',
        section: 'stripe_actions',
      },
    });
  }
}

interface CheckoutMetadataBase {
  packageId: CheckoutPackageId;
  userId: string;
}

export interface TopupCheckoutMetadata
  extends Omit<CheckoutMetadataBase, 'packageId'> {
  credits: string;
  dollarAmount: string;
  packageId: TopupPackageId;
  promo?: string;
  type: 'topup';
}

export interface SubscriptionCheckoutMetadata extends CheckoutMetadataBase {
  subscriptionDiscountCouponId?: string;
  type: 'subscription';
}

export type CheckoutMetadata =
  | SubscriptionCheckoutMetadata
  | TopupCheckoutMetadata;

interface CheckoutIdentity {
  email?: string;
  id: string;
}

async function getCheckoutStripeId(
  user: CheckoutIdentity,
  packageId: TopupPackageId,
): Promise<string> {
  const userData = await getUserById(user.id);
  // biome-ignore lint/complexity/useOptionalChain: needed
  if (!(userData && userData.stripe_id)) {
    const error = new Error('User not found or Stripe ID missing');
    captureException(error, {
      extra: {
        has_stripe_id: !!userData?.stripe_id,
        has_user_data: !!userData,
        packageId,
      },
      tags: {
        event_type: 'user_validation_error',
        section: 'stripe_actions',
      },
      user: { email: user.email, id: user.id },
    });
    throw error;
  }

  return userData.stripe_id;
}

/**
 * Checkout for a user-chosen credit amount. Unlike the fixed packages there is
 * no Stripe price ID, so the line item is priced inline from the starter rate.
 * The amount is re-validated here because the number arriving from the client
 * is untrusted input.
 */
export async function createCustomCheckoutSession(
  credits: number,
): Promise<{ client_secret: string | null; url: string | null }> {
  const validatedCredits = validateCustomCreditAmount(credits);

  try {
    if (isE2E()) {
      return {
        client_secret: null,
        url: null,
      };
    }

    const lang = 'en';
    const supabase = await createClient();
    const claims = await getVerifiedClaims(supabase);

    if (!claims?.sub) {
      const error = new Error('Unauthorized checkout session request');
      captureException(error, {
        extra: {
          checkoutType: 'topup',
          credits: validatedCredits,
          packageId: CUSTOM_TOPUP_PACKAGE_ID,
        },
        tags: {
          event_type: 'auth_error',
          section: 'stripe_actions',
        },
      });
      throw error;
    }

    const stripeId = await getCheckoutStripeId(
      { email: claims.email, id: claims.sub },
      CUSTOM_TOPUP_PACKAGE_ID,
    );

    const amountInCents = calculateCustomTopupCents(validatedCredits);
    const metadata: TopupCheckoutMetadata = {
      credits: validatedCredits.toString(),
      dollarAmount: (amountInCents / 100).toString(),
      packageId: CUSTOM_TOPUP_PACKAGE_ID,
      type: 'topup',
      userId: claims.sub,
    };

    const checkoutSession: Stripe.Checkout.Session =
      await stripe.checkout.sessions.create({
        cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/${lang}/dashboard/credits?canceled=true`,
        customer: stripeId,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${validatedCredits.toLocaleString('en')} Voice Credits`,
              },
              unit_amount: amountInCents,
            },
            quantity: 1,
          },
        ],
        metadata: metadata as unknown as Stripe.MetadataParam,
        mode: 'payment',
        success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/${lang}/dashboard/credits?success=true&creditsAmount=${validatedCredits}`,
        ui_mode: 'hosted',
      });

    return {
      client_secret: checkoutSession.client_secret,
      url: checkoutSession.url,
    };
  } catch (error) {
    console.error('Error creating custom checkout session:', error);
    captureException(error, {
      extra: {
        checkout_type: 'topup',
        credits: validatedCredits,
        error_message: error instanceof Error ? error.message : String(error),
        packageId: CUSTOM_TOPUP_PACKAGE_ID,
      },
      tags: {
        event_type: 'checkout_session_creation_error',
        section: 'stripe_actions',
      },
    });
    throw error;
  }
}

export async function createCheckoutSession(
  data: FormData,
  packageId: CheckoutPackageId,
): Promise<{ client_secret: string | null; url: string | null }> {
  try {
    const ui_mode = data.get(
      'uiMode',
    ) as Stripe.Checkout.SessionCreateParams.UiMode;
    const checkoutType =
      (data.get('type') as CheckoutMetadata['type']) || 'topup';
    const lang = 'en';

    if (!isCheckoutPackageId(packageId)) {
      throw new Error('Invalid checkout package', {
        cause: CHECKOUT_INVALID_PACKAGE_ID,
      });
    }

    if (isE2E()) {
      return {
        client_secret: null,
        url: null,
      };
    }

    const package_ =
      checkoutType === 'subscription'
        ? getSubscriptionPackages('en')[packageId]
        : getTopupPackages('en')[packageId];

    // Verify the price ID exists to avoid runtime errors
    if (!package_?.priceId) {
      throw new Error('Checkout package missing price ID', {
        cause: CHECKOUT_CONFIGURATION_ERROR,
      });
    }

    const supabase = await createClient();
    const claims = await getVerifiedClaims(supabase);

    if (!claims?.sub) {
      const error = new Error('Unauthorized checkout session request');
      captureException(error, {
        extra: {
          checkoutType,
          packageId,
        },
        tags: {
          event_type: 'auth_error',
          section: 'stripe_actions',
        },
      });
      throw error;
    }

    const stripeId = await getCheckoutStripeId(
      { email: claims.email, id: claims.sub },
      packageId,
    );

    const subscriptionDiscountCouponId =
      process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID;
    const shouldApplySubscriptionDiscount =
      checkoutType === 'subscription' &&
      !!subscriptionDiscountCouponId &&
      !(await hasAnySubscriptionHistory(stripeId)) &&
      (await isStripeCouponUsable(subscriptionDiscountCouponId));

    const metadata: CheckoutMetadata =
      checkoutType === 'subscription'
        ? {
            packageId,
            type: 'subscription',
            userId: claims.sub,
            ...(shouldApplySubscriptionDiscount && {
              subscriptionDiscountCouponId,
            }),
          }
        : {
            credits: package_.credits.toString(),
            dollarAmount: package_.dollarAmount.toString(),
            packageId,
            type: 'topup',
            userId: claims.sub,
            ...(process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true' && {
              promo: process.env.NEXT_PUBLIC_PROMO_ID,
            }),
          };

    const checkoutSession: Stripe.Checkout.Session =
      await stripe.checkout.sessions.create({
        customer: stripeId,
        line_items: [
          {
            price: package_.priceId,
            quantity: 1,
          },
        ],
        mode: checkoutType === 'subscription' ? 'subscription' : 'payment',
        ...(shouldApplySubscriptionDiscount && {
          discounts: [
            {
              coupon: subscriptionDiscountCouponId,
            },
          ],
        }),
        ...(ui_mode === 'hosted' && {
          cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/${lang}/dashboard/credits?canceled=true`,
          success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/${lang}/dashboard/credits?success=true&creditsAmount=${package_.credits}`,
        }),
        metadata: metadata as unknown as Stripe.MetadataParam,
        ui_mode,
      });

    return {
      client_secret: checkoutSession.client_secret,
      url: checkoutSession.url,
    };
  } catch (error) {
    console.error('Error creating checkout session:', error);
    if (isCheckoutSetupError(error)) {
      reportCheckoutSetupError(error, packageId);
      throw error;
    }

    captureException(error, {
      extra: {
        checkout_type: data.get('type') || 'topup',
        error_message: error instanceof Error ? error.message : String(error),
        packageId,
        ui_mode: data.get('uiMode'),
      },
      tags: {
        event_type: 'checkout_session_creation_error',
        section: 'stripe_actions',
      },
    });
    throw error;
  }
}
