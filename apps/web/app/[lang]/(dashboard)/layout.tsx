import { prefetchQuery } from '@supabase-cache-helpers/postgrest-react-query';
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import { cookies } from 'next/headers';
import { getMessages } from 'next-intl/server';

import { ReactQueryClientProvider } from '@/components/ReactQueryClientProvider';
import { resolveActiveBanner } from '@/lib/banners/resolve-banner';
import { E2E_CREDIT_TRANSACTIONS, isE2E } from '@/lib/e2e-mocks';
import type { Locale } from '@/lib/i18n/i18n-config';
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

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

  const [{ data: creditTransactions }, isPaidUser] = isE2E()
    ? [{ data: E2E_CREDIT_TRANSACTIONS }, false]
    : await Promise.all([
        getCreditTransactions(supabase, user.id),
        hasUserPaid(user.id),
      ]);
  if (!isE2E()) {
    await prefetchQuery(queryClient, getCreditsQuery(supabase, user.id));
  }

  return (
    <ReactQueryClientProvider>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <DashboardUI
          activeBanner={activeBanner}
          creditTransactions={creditTransactions ?? []}
          isPaidUser={isPaidUser}
          lang={lang}
          userId={user.id}
        >
          {props.children}
        </DashboardUI>
      </HydrationBoundary>
    </ReactQueryClientProvider>
  );
}
