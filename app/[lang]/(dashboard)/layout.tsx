import { prefetchQuery } from '@supabase-cache-helpers/postgrest-react-query';
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import { getMessages } from 'next-intl/server';

import { ReactQueryClientProvider } from '@/components/ReactQueryClientProvider';
import { resolveActiveBanner } from '@/lib/banners/resolve-banner';
import type { Locale } from '@/lib/i18n/i18n-config';
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
  const queryClient = new QueryClient();
  const supabase = await createClient();
  const messages = (await getMessages({ locale: lang })) as IntlMessages;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const activeBanner = resolveActiveBanner({
    audience: 'loggedIn',
    lang,
    messages,
    placement: 'dashboard',
  });

  const { data: creditTransactions } = await getCreditTransactions(
    supabase,
    user.id,
  );
  await prefetchQuery(queryClient, getCreditsQuery(supabase, user.id));

  return (
    <ReactQueryClientProvider>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <DashboardUI
          activeBanner={activeBanner}
          creditTransactions={creditTransactions ?? []}
          dict={messages}
          lang={lang}
          userId={user.id}
        >
          {props.children}
        </DashboardUI>
      </HydrationBoundary>
    </ReactQueryClientProvider>
  );
}
