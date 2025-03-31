'use server';

import { createClient } from '@/lib/supabase/server';

export const handleDeleteAction = async (id: string) => {
  'use server';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  try {
    const { data, error } = await supabase
      .from('audio_files')
      // .select()
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    console.log(data);
    if (error) throw error;

    // Delete from vercel/blob

    //   router.refresh();
  } catch (error) {
    console.error('Error deleting audio file:', error);
  }
};
