import { prefetchQuery } from '@supabase-cache-helpers/postgrest-react-query';
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import { getMessages } from 'next-intl/server';

import { ReactQueryClientProvider } from '@/components/ReactQueryClientProvider';
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
  const promoDictKey =
    process.env.NEXT_PUBLIC_PROMO_TRANSLATIONS || 'blackFridayBanner';
  const promoDict = Object.hasOwn(messages.promos, promoDictKey)
    ? messages.promos[promoDictKey as keyof typeof messages.promos]
    : undefined;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: creditTransactions } = await getCreditTransactions(
    supabase,
    user.id,
  );
  await prefetchQuery(queryClient, getCreditsQuery(supabase, user.id));

  return (
    <ReactQueryClientProvider>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <DashboardUI
          creditTransactions={creditTransactions ?? []}
          dict={messages}
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
