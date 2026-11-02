import { captureException } from '@sentry/nextjs';
import { CircleAlert, ExternalLink, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import PricingTable from '@/components/pricing-table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { E2E_CREDIT_TRANSACTIONS, isE2E } from '@/lib/e2e-mocks';
import type { Locale } from '@/lib/i18n/i18n-config';
import { type CustomerData, getCustomerData } from '@/lib/redis/queries';
import { STRIPE_BILLING_PORTAL_URL } from '@/lib/stripe/billing-portal';
import { SUBSCRIPTION_BONUS_MULTIPLIER } from '@/lib/stripe/pricing';
import {
  createOrRetrieveCustomer,
  hasAnySubscriptionHistory,
  isStripeCouponUsable,
  refreshCustomerSubscriptionData,
} from '@/lib/stripe/stripe-admin';
import { createClient } from '@/lib/supabase/server';
import { CreditHistory } from './credit-history';

function getScheduledSubscriptionEndDate(
  customerData: CustomerData | null,
  lang: Locale,
) {
  if (
    customerData?.status !== 'active' ||
    !customerData.cancelAtPeriodEnd ||
    !customerData.currentPeriodEnd
  ) {
    return null;
  }

  return new Intl.DateTimeFormat(lang, {
    dateStyle: 'medium',
  }).format(new Date(customerData.currentPeriodEnd * 1000));
}

async function canApplyFirstMonthSubscriptionDiscount(stripeId: string) {
  const subscriptionDiscountCouponId =
    process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID;

  if (!subscriptionDiscountCouponId) {
    return false;
  }

  const hasExistingSubscriptionHistory =
    await hasAnySubscriptionHistory(stripeId);

  if (hasExistingSubscriptionHistory) {
    return false;
  }

  return isStripeCouponUsable(subscriptionDiscountCouponId);
}

// The Stripe-dependent part of the credits page: subscription state, pricing,
// and credit history. Its Stripe calls take most of a second, so the page
// renders its header first and streams this in.
export async function CreditsBilling({
  existingStripeId,
  lang,
  user,
}: {
  existingStripeId: string | null;
  lang: Locale;
  user: { email: string; id: string };
}) {
  const [t, tSidebar, supabase] = await Promise.all([
    getTranslations({ locale: lang, namespace: 'credits' }),
    getTranslations({ locale: lang, namespace: 'sidebar' }),
    createClient(),
  ]);

  let shouldShowSubscriptionPlans = false;
  let isEligibleForSubscriptionDiscount = false;
  let scheduledSubscriptionEndDate: string | null = null;
  let existingTransactions:
    | Pick<
        Tables<'credit_transactions'>,
        'id' | 'created_at' | 'description' | 'type' | 'amount'
      >[]
    | null = null;

  if (isE2E()) {
    existingTransactions = E2E_CREDIT_TRANSACTIONS;
  } else {
    const stripeId = await createOrRetrieveCustomer(
      user.id,
      user.email,
      existingStripeId,
    );

    if (!stripeId) {
      const error = new Error('Failed to create or retrieve Stripe customer.');
      console.error(error.message);
      captureException(error, {
        level: 'error',
        user: { email: user.email, id: user.id },
      });
      throw error;
    }

    let customerData = await getCustomerData(stripeId);
    shouldShowSubscriptionPlans = customerData?.status !== 'active';

    if (shouldShowSubscriptionPlans) {
      try {
        customerData = await refreshCustomerSubscriptionData(stripeId);
        shouldShowSubscriptionPlans = customerData.status !== 'active';
      } catch (error) {
        console.error('Failed to refresh Stripe subscription data', error);
        shouldShowSubscriptionPlans = false;
      }
    }

    scheduledSubscriptionEndDate = getScheduledSubscriptionEndDate(
      customerData,
      lang,
    );

    if (shouldShowSubscriptionPlans) {
      isEligibleForSubscriptionDiscount =
        await canApplyFirstMonthSubscriptionDiscount(stripeId);
    }

    ({ data: existingTransactions } = await supabase
      .from('credit_transactions')
      .select('id, created_at, description, type, amount')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100));
  }

  const subscriptionDiscountPercent =
    process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_DISCOUNT_PERCENT;
  const shouldShowSubscriptionDiscountBanner =
    shouldShowSubscriptionPlans &&
    isEligibleForSubscriptionDiscount &&
    !!subscriptionDiscountPercent &&
    Number.parseFloat(subscriptionDiscountPercent) > 0;

  return (
    <>
      {shouldShowSubscriptionDiscountBanner ? (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm">
          <Sparkles className="size-5 shrink-0 text-yellow-500" />
          <span>
            {tSidebar('subscriptionDiscount', {
              discount: subscriptionDiscountPercent,
              extraCredits: String(
                Math.round((SUBSCRIPTION_BONUS_MULTIPLIER - 1) * 100),
              ),
            })}
          </span>
        </div>
      ) : null}

      {scheduledSubscriptionEndDate ? (
        <Alert className="border-amber-500/30 bg-amber-500/10 [&>svg]:text-amber-500">
          <CircleAlert />
          <AlertTitle className="line-clamp-none">
            {t('subscriptionScheduledToCancel.title')}
          </AlertTitle>
          <AlertDescription>
            <p>
              {t('subscriptionScheduledToCancel.description', {
                date: scheduledSubscriptionEndDate,
              })}
            </p>
            <Button
              asChild
              className="mt-2"
              icon={ExternalLink}
              iconPlacement="right"
              size="sm"
              variant="secondary"
            >
              <Link href={STRIPE_BILLING_PORTAL_URL} target="_blank">
                {t('subscriptionScheduledToCancel.manageButton')}
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <PricingTable
        applyFirstMonthSubscriptionDiscount={isEligibleForSubscriptionDiscount}
        checkoutEnabled
        className="pb-16"
        hideFreePlan
        lang={lang}
        shouldShowSubscriptionPlans={shouldShowSubscriptionPlans}
      />

      <div className="my-8">
        <h3 className="mb-4 font-semibold text-lg">{t('history.title')}</h3>
        <CreditHistory transactions={existingTransactions} />
      </div>
    </>
  );
}

export function CreditsBillingSkeleton() {
  return (
    <div className="space-y-8 pb-16" data-testid="credits-billing-skeleton">
      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
