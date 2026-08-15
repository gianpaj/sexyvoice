'use server';

import { captureException } from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { after } from 'next/server';

import PostHogClient from '@/lib/posthog';
import { createClient } from '@/lib/supabase/server';

const redis = Redis.fromEnv();

type DeleteAudioFilesOptions =
  | { scope: 'all' }
  | { id: string; scope: 'single' };

async function deleteAudioFiles(options: DeleteAudioFilesOptions) {
  if (
    options.scope === 'single' &&
    (typeof options.id !== 'string' || options.id.length === 0)
  ) {
    throw new Error('Audio file not found or unauthorized');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('User not found');
  }

  let deleteQuery = supabase
    .from('audio_files')
    .update({
      deleted_at: new Date().toISOString(),
      status: 'deleted',
    })
    .eq('user_id', user.id)
    .eq('status', 'active');

  if (options.scope === 'single') {
    deleteQuery = deleteQuery.eq('id', options.id);
  }

  const { data: deletedAudioFiles, error } =
    await deleteQuery.select('id, storage_key');

  if (error) {
    throw new Error('Failed to delete audio files', { cause: error });
  }

  if (options.scope === 'single' && deletedAudioFiles.length === 0) {
    throw new Error('Audio file not found or unauthorized');
  }

  const storageKeys = deletedAudioFiles.map(({ storage_key }) => storage_key);

  if (storageKeys.length > 0) {
    try {
      // Clear generated-audio cache entries so deleted audio can be regenerated.
      await redis.del(...storageKeys);
    } catch (cacheError) {
      // The database is authoritative. A cache outage must not report a
      // successful soft delete as failed.
      captureException(cacheError, {
        extra: {
          audioIds: deletedAudioFiles.map(({ id: audioId }) => audioId),
        },
        level: 'warning',
        user: { email: user.email, id: user.id },
      });
    }
  }

  after(async () => {
    const posthog = PostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: options.scope === 'single' ? 'delete-audio' : 'delete-all-audio',
      properties:
        options.scope === 'single'
          ? { id: options.id }
          : { count: deletedAudioFiles.length },
    });
    await posthog.shutdown();
  });

  // R2 objects are intentionally retained for potential recovery.
  return { deletedCount: deletedAudioFiles.length, success: true };
}

export const handleDeleteAction = async (id: string) => {
  try {
    return await deleteAudioFiles({ id, scope: 'single' });
  } catch (error) {
    captureException(error, { extra: { audioId: id } });
    console.error('Error deleting audio file:', error);
    throw error;
  }
};

export const handleDeleteAllAction = async () => {
  try {
    return await deleteAudioFiles({ scope: 'all' });
  } catch (error) {
    captureException(error, { extra: { scope: 'all' } });
    console.error('Error deleting all audio files:', error);
    throw error;
  }
};
