import { QueryClient } from '@tanstack/react-query';

import { getMyAudioFilesQuery } from '@/lib/supabase/queries.client';
import { createClient } from '@/lib/supabase/server';
import { DataTable } from './data-table';

export default async function HistoryPage() {
  const queryClient = new QueryClient();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: audioFiles } = await getMyAudioFilesQuery(supabase, user.id);

  // set the initial data
  queryClient.setQueryData(['audio_files', user.id], audioFiles);

  return (
    <div className="container mx-auto pb-10">
      <h2 className="mb-4 font-bold text-2xl">Generation History</h2>
      <DataTable userId={user.id} />
    </div>
  );
}
