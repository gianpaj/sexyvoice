'use server';

import * as Sentry from '@sentry/nextjs';
import { Redis } from '@upstash/redis';

import PostHogClient from '@/lib/posthog';
import { createClient } from '@/lib/supabase/server';

// Initialize Redis
const redis = Redis.fromEnv();

export const handleDeleteAction = async (id: string) => {
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
      Sentry.captureException(fetchError, {
        user: {
          id: user.id,
          email: user.email,
        },
        extra: {
          audioId: id,
          errorData: fetchError,
        },
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

    // allow for regeneration of audio
    await redis.del(audioFile.storage_key);

    const posthog = PostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: 'delete-audio',
      properties: {
        id,
      },
    });
    await posthog.shutdown();

    if (deleteError) {
      Sentry.captureException(deleteError, {
        user: { id: user.id, email: user.email },
        extra: {
          audioId: id,
        },
      });
      throw new Error('Failed to delete audio file');
    }

    // Note: We keep the file in R2 storage for potential recovery
    // In the future, we could implement a cleanup job to remove old deleted files

    return { success: true };
  } catch (error) {
    Sentry.captureException(error, {
      extra: { audioId: id },
    });
    console.error('Error deleting audio file:', error);
    throw error;
  }
};
