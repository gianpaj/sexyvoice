'use server';

import { captureException, captureMessage } from '@sentry/nextjs';
import type { ParamValue } from 'next/dist/server/request/params';
import type { Stripe } from 'stripe';

import { isE2E } from '@/lib/e2e-mode';
import {
  getSubscriptionPackages,
  getTopupPackages,
  type PackageType,
} from '@/lib/stripe/pricing';
import {
  hasAnySubscriptionHistory,
  isStripeCouponUsable,
  stripe,
} from '@/lib/stripe/stripe-admin';
import { getUserById, hasClaimedCardBonus } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

const CHECKOUT_CONFIGURATION_ERROR = 'CHECKOUT_CONFIGURATION_ERROR';
const CHECKOUT_INVALID_PACKAGE_ID = 'CHECKOUT_INVALID_PACKAGE_ID';

type CheckoutPackageId = Exclude<PackageType, 'free'>;

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
      level: 'info',
      tags: {
        section: 'stripe_actions',
        event_type: 'invalid_package_id',
      },
      extra: {
        packageId,
        available_packages: CHECKOUT_PACKAGE_IDS,
        vercelEnv: process.env.VERCEL_ENV ?? null,
      },
    });
  }

  if (
    error.cause === CHECKOUT_CONFIGURATION_ERROR &&
    shouldReportCheckoutConfigurationError()
  ) {
    captureException(error, {
      tags: {
        section: 'stripe_actions',
        event_type: 'missing_price_id',
      },
      extra: {
        packageId,
        available_packages: Object.keys(getTopupPackages('en')),
        vercelEnv: process.env.VERCEL_ENV ?? null,
      },
    });
  }
}

interface CheckoutMetadataBase {
  packageId: CheckoutPackageId;
  userId: string;
}

export interface TopupCheckoutMetadata extends CheckoutMetadataBase {
  credits: string;
  dollarAmount: string;
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

export interface CardBonusCheckoutMetadata {
  type: 'card_bonus';
  userId: string;
}

type CheckoutUser = NonNullable<
  Awaited<
    ReturnType<Awaited<ReturnType<typeof createClient>>['auth']['getUser']>
  >['data']['user']
>;

async function getCheckoutStripeId(
  user: CheckoutUser,
  packageId: CheckoutPackageId | 'card_bonus',
): Promise<string> {
  const userData = await getUserById(user.id);
  // biome-ignore lint/complexity/useOptionalChain: needed
  if (!(userData && userData.stripe_id)) {
    const error = new Error('User not found or Stripe ID missing');
    captureException(error, {
      user: { id: user.id, email: user.email },
      tags: {
        section: 'stripe_actions',
        event_type: 'user_validation_error',
      },
      extra: {
        has_user_data: !!userData,
        has_stripe_id: !!userData?.stripe_id,
        packageId,
      },
    });
    throw error;
  }

  return userData.stripe_id;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: it's okay
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      const error = new Error('Unauthorized checkout session request');
      captureException(error, {
        tags: {
          section: 'stripe_actions',
          event_type: 'auth_error',
        },
        extra: {
          authError: authError?.message ?? null,
          packageId,
          checkoutType,
        },
      });
      throw error;
    }

    const stripeId = await getCheckoutStripeId(user, packageId);

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
        customer: stripeId,
        line_items: [
          {
            quantity: 1,
            price: package_.priceId,
          },
        ],
        ...(shouldApplySubscriptionDiscount && {
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
    if (isCheckoutSetupError(error)) {
      reportCheckoutSetupError(error, packageId);
      throw error;
    }

    captureException(error, {
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

export interface CardBonusSessionResult {
  alreadyClaimed: boolean;
  client_secret: string | null;
  url: string | null;
}

/**
 * Creates a Stripe Checkout Session in `setup` mode to collect a card on
 * file (no charge) in exchange for a one-time credit bonus. See
 * `insertCardBonusCreditTransaction` for the grant + dedupe logic that runs
 * once the webhook confirms the SetupIntent.
 */
export async function createCardBonusSetupSession({
  lang,
}: {
  lang: ParamValue;
}): Promise<CardBonusSessionResult> {
  try {
    if (isE2E()) {
      return { alreadyClaimed: false, client_secret: null, url: null };
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      const error = new Error('Unauthorized card bonus setup session request');
      captureException(error, {
        tags: {
          section: 'stripe_actions',
          event_type: 'auth_error',
        },
        extra: {
          authError: authError?.message ?? null,
        },
      });
      throw error;
    }

    if (await hasClaimedCardBonus(user.id)) {
      return { alreadyClaimed: true, client_secret: null, url: null };
    }

    const stripeId = await getCheckoutStripeId(user, 'card_bonus');

    // Set metadata in BOTH places: setup_intent_data.metadata lands only on
    // the SetupIntent and is NOT mirrored onto the session, but the webhook's
    // checkout.session.completed branch needs a session-level signal too.
    const metadata: CardBonusCheckoutMetadata = {
      userId: user.id,
      type: 'card_bonus',
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: stripeId,
      payment_method_types: ['card'],
      metadata: metadata as unknown as Stripe.MetadataParam,
      setup_intent_data: {
        metadata: metadata as unknown as Stripe.MetadataParam,
      },
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/${lang}/dashboard/credits?card_bonus=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/${lang}/dashboard/credits?card_bonus=canceled`,
      ui_mode: 'hosted',
    });

    return {
      alreadyClaimed: false,
      client_secret: session.client_secret,
      url: session.url,
    };
  } catch (error) {
    console.error('Error creating card bonus setup session:', error);
    captureException(error, {
      tags: {
        section: 'stripe_actions',
        event_type: 'card_bonus_setup_session_creation_error',
      },
      extra: {
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
