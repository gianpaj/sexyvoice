import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';

import { ReactQueryClientProvider } from '@/components/ReactQueryClientProvider';
import { getDictionary } from '@/lib/i18n/get-dictionary';
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

  const dict = await getDictionary(lang);
  const blackFridayDict = (await getDictionary(lang, 'promos'))
    .blackFridayBanner;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch credits data directly on the server
  const { data: creditsData } = await getCreditsQuery(supabase, user.id);

  const { data: creditTransactions } = await getCreditTransactions(
    supabase,
    user.id,
  );

  // set the initial data
  queryClient.setQueryData(['credits', user.id], creditsData);

  return (
    <ReactQueryClientProvider>
      {/* HydrationBoundary is a Client Component, so hydration will happen there */}
      <HydrationBoundary state={dehydrate(queryClient)}>
        <DashboardUI
          blackFridayDict={blackFridayDict}
          creditTransactions={creditTransactions}
          dict={dict.creditsSection}
          lang={lang}
          userId={user.id}
        >
          {props.children}
        </DashboardUI>
      </HydrationBoundary>
    </ReactQueryClientProvider>
  );
}
