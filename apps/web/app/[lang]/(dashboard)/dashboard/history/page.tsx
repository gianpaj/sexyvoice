import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import { getTranslations } from 'next-intl/server';

import { E2E_AUDIO_FILES, isE2E } from '@/lib/e2e-mocks';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getMyAudioFilesQuery } from '@/lib/supabase/queries.client';
import { createClient } from '@/lib/supabase/server';
import { DataTable } from './data-table';

export default async function HistoryPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;
  const queryClient = new QueryClient();
  const t = await getTranslations({ locale: lang, namespace: 'history' });

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // In E2E mode serve deterministic data: the table is hydrated from this RSC
  // query and the client never refetches, so live rows would otherwise leak
  // into the Argos screenshot. Pin apiKeysCount to 0 to hide the API columns.
  const [{ data: audioFiles }, { count: apiKeysCount }] = isE2E()
    ? [{ data: E2E_AUDIO_FILES }, { count: 0 }]
    : await Promise.all([
        getMyAudioFilesQuery(supabase, user.id),
        supabase
          .from('api_keys')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
      ]);

  queryClient.setQueryData(['audio_files', user.id], audioFiles);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="container mx-auto pb-10">
        <h2 className="mb-4 font-bold text-2xl">{t('header')}</h2>
        <DataTable showApiColumns={(apiKeysCount ?? 0) > 0} userId={user.id} />
      </div>
    </HydrationBoundary>
  );
}
