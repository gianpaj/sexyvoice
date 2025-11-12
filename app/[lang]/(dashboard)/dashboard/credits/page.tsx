import { ArrowTopRightIcon } from '@radix-ui/react-icons';
import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import Script from 'next/script';
import type Stripe from 'stripe';

import { Button } from '@/components/ui/button';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getCustomerData } from '@/lib/redis/queries';
import {
  createCustomerSession,
  createOrRetrieveCustomer,
} from '@/lib/stripe/stripe-admin';
import { getUserById } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { CreditHistory } from './credit-history';
import { CreditTopup } from './credit-topup';
import { TopupStatus } from './topup-status';

export default async function CreditsPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const params = await props.params;

  const { lang } = params;

  const supabase = await createClient();
  const dict = await getDictionary(lang, 'credits');

  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  const userData = user && (await getUserById(user.id));
  if (!(user && userData)) {
    throw new Error('User not found');
  }

  if (!userData.stripe_id) {
    const stripe_id = await createOrRetrieveCustomer(user.id, user.email!);
    if (!stripe_id) {
      console.error('Failed to create or retrieve Stripe customer.');
      Sentry.captureMessage('Failed to create or retrieve Stripe customer.', {
        level: 'error',
        extra: { userId: user.id, email: user.email },
      });
    }
    userData.stripe_id = stripe_id;
  }

  const customerData = await getCustomerData(userData.stripe_id);

  const clientSecret = await createCustomerSession(
    userData.id,
    userData.stripe_id,
  );

  const { data: existingTransactions } = await supabase
    .from('credit_transactions')
    .select('id, created_at, description, type, amount')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-8">
      <TopupStatus dict={dict} />
      <div className="flex flex-col justify-between gap-4 lg:flex-row">
        <div className="w-full lg:w-3/4">
          <h3 className="mb-4 font-semibold text-lg">{dict.topup.title}</h3>
          <p className="text-muted-foreground">{dict.topup.description}</p>
        </div>
        <Button asChild icon={ArrowTopRightIcon} iconPlacement="right">
          <Link
            href={'https://billing.stripe.com/p/login/28o01hfsn1gUccU8ww'}
            target="_blank"
          >
            Stripe Customer Portal
          </Link>
        </Button>
      </div>

      {/* Add Credit Top-up Section */}
      <CreditTopup dict={dict} lang={lang} />

      <div className="my-8">
        <h3 className="mb-4 font-semibold text-lg">{dict.history.title}</h3>
        <CreditHistory dict={dict} transactions={existingTransactions} />
      </div>

      {(!customerData || customerData?.status !== 'active') && (
        <NextStripePricingTable clientSecret={clientSecret} />
      )}
    </div>
  );
}

// Subscription plans
const NextStripePricingTable = ({
  clientSecret,
}: {
  clientSecret: Stripe.Response<Stripe.CustomerSession> | null;
}) => {
  const pricingTableId = process.env.STRIPE_PRICING_ID;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

  if (!(pricingTableId && publishableKey && clientSecret)) return null;

  return (
    <>
      <Script
        async
        strategy="lazyOnload"
        src="https://js.stripe.com/v3/pricing-table.js"
      />
      {/* @ts-ignore */}
      <stripe-pricing-table
        pricing-table-id={pricingTableId}
        publishable-key={publishableKey}
        customer-session-client-secret={clientSecret.client_secret}
      />
    </>
  );
};
