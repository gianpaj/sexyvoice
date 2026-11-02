import { captureException } from '@sentry/nextjs';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { Button } from '@/components/ui/button';
import { createDashboardMetadata } from '@/lib/dashboard-metadata';
import type { Locale } from '@/lib/i18n/i18n-config';
import { STRIPE_BILLING_PORTAL_URL } from '@/lib/stripe/billing-portal';
import { getUserByIdWithError } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { CreditsBilling, CreditsBillingSkeleton } from './credits-billing';
import { PaymentStatus } from './payment-status';

export const generateMetadata = createDashboardMetadata('/dashboard/credits');

export default async function CreditsPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;
  const t = await getTranslations({ locale: lang, namespace: 'credits' });
  const supabase = await createClient();
  // biome-ignore lint/plugin/use-verified-claims: Stripe customer lookup and creation need the current Auth email.
  const { data, error: authError } = await supabase.auth.getUser();
  const user = data?.user;

  if (!(user && !authError)) {
    redirect(`/${lang}/login`);
  }

  const { data: userData, error: userDataError } = await getUserByIdWithError(
    user.id,
  );
  if (userDataError) {
    const error = new Error('Credits page profile lookup failed');
    captureException(error, {
      extra: {
        profileLookupError: {
          code: userDataError.code,
          details: userDataError.details,
          hint: userDataError.hint,
          message: userDataError.message,
        },
        route: `/${lang}/dashboard/credits`,
      },
      level: 'error',
      user: { email: user.email, id: user.id },
    });
    throw error;
  }

  if (!userData) {
    captureException(new Error('Credits page profile not found'), {
      extra: {
        route: `/${lang}/dashboard/credits`,
      },
      level: 'warning',
      user: { email: user.email, id: user.id },
    });
    redirect(`/${lang}/dashboard/generate`);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Suspense>
        <PaymentStatus />
      </Suspense>
      <div className="flex flex-col justify-between gap-4 lg:flex-row">
        <div className="w-full lg:w-3/4">
          <h3 className="mb-4 font-semibold text-lg">{t('topup.title')}</h3>
          <p className="text-muted-foreground">{t('topup.description')}</p>
        </div>
        <Button asChild icon={ExternalLink} iconPlacement="right">
          <Link href={STRIPE_BILLING_PORTAL_URL} target="_blank">
            Stripe Customer Portal
          </Link>
        </Button>
      </div>

      <Suspense fallback={<CreditsBillingSkeleton />}>
        <CreditsBilling
          existingStripeId={userData.stripe_id}
          lang={lang}
          user={{ email: user.email!, id: user.id }}
        />
      </Suspense>
    </div>
  );
}
