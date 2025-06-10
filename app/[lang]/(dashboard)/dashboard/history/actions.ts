'use server';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';

export const handleDeleteAction = async (id: string) => {
  'use server';

  try {
    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data?.user;

    if (!user) {
      throw new Error('User not found');
    }

    // First, get the audio file to ensure it exists and belongs to the user
    const { data: audioFile, error: fetchError } = await supabase
      .from('audio_files')
      .select('url, storage_key')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError) {
      Sentry.captureException({
        error: 'Failed to fetch audio file',
        audioId: id,
        userId: user.id,
        errorData: fetchError,
      });
      throw new Error('Audio file not found');
    }

    if (!audioFile) {
      throw new Error('Audio file not found or unauthorized');
    }

    // Soft delete: update status to 'deleted' and set deleted_at timestamp
    const { error: deleteError } = await supabase
      .from('audio_files')
      .update({
        status: 'deleted',
        deleted_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      Sentry.captureException({
        error: 'Failed to soft delete audio file from database',
        audioId: id,
        userId: user.id,
        errorData: deleteError,
      });
      throw new Error('Failed to delete audio file');
    }

    // Note: We keep the file in blob storage for potential recovery
    // In the future, we could implement a cleanup job to remove old deleted files

    return { success: true };
  } catch (error) {
    Sentry.captureException({
      error: 'Audio file deletion error',
      errorData: error,
    });
    console.error('Error deleting audio file:', error);
    throw error;
  }
};
