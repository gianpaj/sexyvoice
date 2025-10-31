import { del } from '@vercel/blob';

import { inngest } from './client';

export const cleanupCloneAudio = inngest.createFunction(
  { id: 'cleanup-clone-audio' },
  { event: 'clone-audio/cleanup.scheduled' },
  async ({ event, step }) => {
    await step.sleep('wait-1-hour', '1h');

    await step.run('delete-audio', async () => {
      await del(event.data.blobUrl);
      console.log(
        'User:',
        event.data.userId,
        'Cleaned up:',
        event.data.blobUrl,
      );
    });
  },
);
