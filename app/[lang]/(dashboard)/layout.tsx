import { prefetchQuery } from '@supabase-cache-helpers/postgrest-react-query';
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
  const promoDictKey =
    process.env.NEXT_PUBLIC_PROMO_TRANSLATIONS || 'blackFridayBanner';
  // @ts-expect-error fix me
  const promoDict = (await getDictionary(lang, 'promos'))[promoDictKey];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: creditTransactions } = await getCreditTransactions(
    supabase,
    user.id,
  );

  // set the initial data
  await prefetchQuery(queryClient, getCreditsQuery(supabase, user.id));

  // await queryClient.prefetchQuery({
  //   queryKey: ['credits'],
  //   staleTime: 1000,
  //   queryFn: async () => {
  //     const { data } = await getCreditsQuery(supabase, user.id);
  //     return data;
  //   },
  // });

  return (
    <ReactQueryClientProvider>
      {/* HydrationBoundary is a Client Component, so hydration will happen there */}
      <HydrationBoundary state={dehydrate(queryClient)}>
        <DashboardUI
          creditTransactions={creditTransactions}
          dict={dict}
          lang={lang}
          promoDict={promoDict}
          userId={user.id}
        >
          {props.children}
        </DashboardUI>
      </HydrationBoundary>
    </ReactQueryClientProvider>
  );
}
