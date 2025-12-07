import { logger } from '@sentry/nextjs';
import { del } from '@vercel/blob';

import { inngest } from './client';

const CLONE_AUDIO_CLEANUP_DELAY = '2h';

export const cleanupCloneAudio = inngest.createFunction(
  { id: 'cleanup-clone-audio' },
  { event: 'clone-audio/cleanup.scheduled' },
  async ({ event, step }) => {
    await step.sleep('wait-2-hour', CLONE_AUDIO_CLEANUP_DELAY);

    await step.run('delete-audio', async () => {
      await del(event.data.blobUrl);
      console.log(
        'User:',
        event.data.userId,
        'Cleaned up:',
        event.data.blobUrl,
      );
      logger.info('Cleaned up clone audio file', {
        extra: {
          userId: event.data.userId,
          blobUrl: event.data.blobUrl,
        },
      });
    });
  },
);
