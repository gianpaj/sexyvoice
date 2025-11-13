// import { realtimeMiddleware } from '@inngest/realtime/middleware';
import { EventSchemas, Inngest } from 'inngest';

interface CloneAudioCleanup {
  data: {
    blobUrl: string;
    userId: string;
  };
}
// biome-ignore lint/style/useConsistentTypeDefinitions: required by inngest
type Events = {
  'clone-audio/cleanup.scheduled': CloneAudioCleanup;
};

export const inngest = new Inngest({
  id: 'sexyvoice',
  schemas: new EventSchemas().fromRecord<Events>(),
  // middleware: [realtimeMiddleware()],
});
