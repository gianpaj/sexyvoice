import { prefetchQuery } from '@supabase-cache-helpers/postgrest-react-query';
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import { cookies } from 'next/headers';
import { getMessages } from 'next-intl/server';

import { ReactQueryClientProvider } from '@/components/react-query-client-provider';
import { resolveActiveBanner } from '@/lib/banners/resolve-banner';
import { getE2ECallUser } from '@/lib/e2e-call-user';
import { E2E_CREDIT_TRANSACTIONS } from '@/lib/e2e-mocks';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { hasUserPaid } from '@/lib/supabase/queries';
import {
  getCreditsQuery,
  getCreditTransactions,
} from '@/lib/supabase/queries.client';
import { createClient } from '@/lib/supabase/server';
import DashboardUI from './dashboard.ui';

export default async function DashboardLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;
  // Server-side QueryClient for data prefetching, safe to create per request
  const queryClient = new QueryClient();
  const supabase = await createClient();
  const messages = (await getMessages({ locale: lang })) as IntlMessages;

  const claims = await getVerifiedClaims(supabase);
  if (!claims?.sub) return null;

  const cookieStore = await cookies();
  const dismissedCookieKeys = cookieStore
    .getAll()
    .filter((cookie) => cookie.value)
    .map((cookie) => cookie.name);

  const activeBanner = resolveActiveBanner({
    audience: 'loggedIn',
    dismissedCookieKeys,
    lang,
    messages,
    placement: 'dashboard',
  });

  const e2e = await getE2ECallUser();
  const [{ data: creditTransactions }, isPaidUser] = e2e
    ? [{ data: E2E_CREDIT_TRANSACTIONS }, e2e.isPaidUser]
    : await Promise.all([
        getCreditTransactions(supabase, claims.sub),
        hasUserPaid(claims.sub),
      ]);
  if (!e2e) {
    await prefetchQuery(queryClient, getCreditsQuery(supabase, claims.sub));
  }

  return (
    <ReactQueryClientProvider>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <DashboardUI
          activeBanner={activeBanner}
          creditTransactions={creditTransactions ?? []}
          isPaidUser={isPaidUser}
          lang={lang}
          userId={claims.sub}
        >
          {props.children}
        </DashboardUI>
      </HydrationBoundary>
    </ReactQueryClientProvider>
  );
}
