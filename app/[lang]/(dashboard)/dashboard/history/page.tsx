import { QueryClient } from '@tanstack/react-query';

import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getMyAudioFilesQuery } from '@/lib/supabase/queries.client';
import { createClient } from '@/lib/supabase/server';
import { DataTable } from './data-table';

export default async function HistoryPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;
  const queryClient = new QueryClient();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: audioFiles } = await getMyAudioFilesQuery(supabase, user.id);

  // set the initial data
  queryClient.setQueryData(['audio_files', user.id], audioFiles);

  const dict = await getDictionary(lang, 'history');

  return (
    <div className="container mx-auto pb-10">
      <h2 className="mb-4 font-bold text-2xl">{dict.header}</h2>
      <DataTable dict={dict} userId={user.id} />
    </div>
  );
}
