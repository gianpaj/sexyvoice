import { captureException } from '@sentry/nextjs';
import { ExternalLink, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { getMessages, getTranslations } from 'next-intl/server';

import PricingTable from '@/components/pricing-table';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getCustomerData } from '@/lib/redis/queries';
import { SUBSCRIPTION_BONUS_MULTIPLIER } from '@/lib/stripe/pricing';
import {
  createOrRetrieveCustomer,
  refreshCustomerSubscriptionData,
} from '@/lib/stripe/stripe-admin';
import { getUserById } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { CreditHistory } from './credit-history';
import { TopupStatus } from './topup-status';

export default async function CreditsPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;
  const dict = (await getMessages({ locale: lang })) as IntlMessages;
  const tSidebar = await getTranslations({
    locale: lang,
    namespace: 'sidebar',
  });
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  const userData = user && (await getUserById(user.id));
  if (!(user && userData)) {
    throw new Error('User not found');
  }

  const stripeId = await createOrRetrieveCustomer(
    user.id,
    user.email!,
    userData.stripe_id,
  );

  if (!stripeId) {
    const error = new Error('Failed to create or retrieve Stripe customer.');
    console.error(error.message);
    captureException(error, {
      level: 'error',
      user: { id: user.id, email: user.email },
    });
    throw error;
  }

  userData.stripe_id = stripeId;

  let customerData = await getCustomerData(stripeId);
  let shouldShowSubscriptionPlans =
    !customerData || customerData.status !== 'active';

  if (shouldShowSubscriptionPlans) {
    try {
      customerData = await refreshCustomerSubscriptionData(stripeId);
      shouldShowSubscriptionPlans = customerData.status !== 'active';
    } catch (error) {
      console.error('Failed to refresh Stripe subscription data', error);
      shouldShowSubscriptionPlans = false;
    }
  }

  const { data: existingTransactions } = await supabase
    .from('credit_transactions')
    .select('id, created_at, description, type, amount')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <TopupStatus dict={dict.credits} />
      <div className="flex flex-col justify-between gap-4 lg:flex-row">
        <div className="w-full lg:w-3/4">
          <h3 className="mb-4 font-semibold text-lg">
            {dict.credits.topup.title}
          </h3>
          <p className="text-muted-foreground">
            {dict.credits.topup.description}
          </p>
        </div>
        <Button asChild icon={ExternalLink} iconPlacement="right">
          <Link
            href="https://billing.stripe.com/p/login/28o01hfsn1gUccU8ww"
            target="_blank"
          >
            Stripe Customer Portal
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm">
        <Sparkles className="size-5 shrink-0 text-yellow-500" />
        <span>
          {tSidebar('subscriptionDiscount', {
            discount:
              process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_DISCOUNT_PERCENT ??
              '0',
            extraCredits: String(
              Math.round((SUBSCRIPTION_BONUS_MULTIPLIER - 1) * 100),
            ),
          })}
        </span>
      </div>

      <PricingTable
        className="xl:px-0"
        hideFreePlan
        lang={lang}
        shouldShowSubscriptionPlans={shouldShowSubscriptionPlans}
      />

      <div className="my-8">
        <h3 className="mb-4 font-semibold text-lg">
          {dict.credits.history.title}
        </h3>
        <CreditHistory
          dict={dict.credits}
          transactions={existingTransactions}
        />
      </div>
    </div>
  );
}
