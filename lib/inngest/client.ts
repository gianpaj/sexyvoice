// import { realtimeMiddleware } from '@inngest/realtime/middleware';
import { EventSchemas, Inngest } from 'inngest';

type CloneAudioCleanup = {
  data: {
    blobUrl: string;
    userId: string;
  };
};
type Events = {
  'clone-audio/cleanup.scheduled': CloneAudioCleanup;
};

export const inngest = new Inngest({
  id: 'sexyvoice',
  schemas: new EventSchemas().fromRecord<Events>(),
  // middleware: [realtimeMiddleware()],
});
