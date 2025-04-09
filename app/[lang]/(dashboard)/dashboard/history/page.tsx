import { createClient } from '@/lib/supabase/server';
import { type AudioFile, columns } from './columns';
import { DataTable } from './data-table';

export default async function HistoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: audioFiles } = (await supabase
    .from('audio_files')
    .select(`
      *,
      voices (
        name
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })) as { data: AudioFile[] };

  // console.log(audioFiles);

  return (
    <div className="container mx-auto pb-10">
      <h2 className="text-2xl font-bold mb-4">Generation History</h2>
      <DataTable columns={columns} data={audioFiles || []} />
    </div>
  );
}
