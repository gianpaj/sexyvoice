import { prefetchQuery } from '@supabase-cache-helpers/postgrest-react-query';
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import { getMyAudioFiles } from '@/lib/supabase/queries.client';
import { createClient } from '@/lib/supabase/server';
import { columns } from './columns';
import { DataTable } from './data-table';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default async function HistoryPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const queryClient = new QueryClient();

  const { lang } = await props.params;
  const dict = await getDictionary(lang, 'historyPage');

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  await prefetchQuery(queryClient, getMyAudioFiles(supabase, user.id));

  return (
    <div className="container mx-auto pb-10">
      <h2 className="text-2xl font-bold mb-4">Generation History</h2>
      <Alert className="mb-4">
        <AlertDescription>{dict.retentionInfo}</AlertDescription>
      </Alert>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <DataTable columns={columns} userId={user.id} />
      </HydrationBoundary>
    </div>
  );
}
