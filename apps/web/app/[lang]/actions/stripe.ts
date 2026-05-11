'use server';

import { captureException } from '@sentry/nextjs';
import type { Stripe } from 'stripe';

import { getTopupPackages, type PackageType } from '@/lib/stripe/pricing';
import { stripe } from '@/lib/stripe/stripe-admin';
import { getUserById } from '@/lib/supabase/queries';
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

const isCheckoutSetupError = (
  error: unknown,
): error is Error & { cause: unknown } =>
  Error.isError(error) &&
  [CHECKOUT_CONFIGURATION_ERROR, CHECKOUT_INVALID_PACKAGE_ID].includes(
    String(error.cause),
  );

export interface CheckoutMetadata {
  credits: string;
  dollarAmount: string;
  packageId: CheckoutPackageId;
  promo?: string;
  type: 'topup';
  userId: string;
}

export async function createCheckoutSession(
  data: FormData,
  packageId: CheckoutPackageId,
): Promise<{ client_secret: string | null; url: string | null }> {
  try {
    const ui_mode = data.get(
      'uiMode',
    ) as Stripe.Checkout.SessionCreateParams.UiMode;

    if (!isCheckoutPackageId(packageId)) {
      throw new Error('Invalid checkout package', {
        cause: CHECKOUT_INVALID_PACKAGE_ID,
      });
    }

    const package_ = getTopupPackages('en')[packageId];

    // Verify the price ID exists to avoid runtime errors
    if (!package_?.priceId) {
      throw new Error('Checkout package missing price ID', {
        cause: CHECKOUT_CONFIGURATION_ERROR,
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const userData = user && (await getUserById(user.id));
    // biome-ignore lint/complexity/useOptionalChain: needed
    if (!(userData && userData.stripe_id)) {
      const error = new Error('User not found or Stripe ID missing');
      captureException(error, {
        user: { id: user?.id, email: user?.email },
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
    if (isCheckoutSetupError(error)) {
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

      throw error;
    }

    captureException(error, {
      tags: {
        section: 'stripe_actions',
        event_type: 'checkout_session_creation_error',
      },
      extra: {
        packageId,
        ui_mode: data.get('uiMode'),
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
