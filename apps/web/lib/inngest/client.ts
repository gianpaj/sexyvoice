// import { realtimeMiddleware } from '@inngest/realtime/middleware';
import { Inngest } from 'inngest';
// import z from 'zod';

// interface CloneAudioCleanup {
//   data: {
//     blobUrl: string;
//     userId: string;
//   };
// }
// biome-ignore lint/style/useConsistentTypeDefinitions: required by inngest
// type Events = {
//   // 'clone-audio/cleanup.scheduled': CloneAudioCleanup;
// };

export const inngest = new Inngest({
  id: 'my-app',
  // isDev: true
});
// const userCreated = eventType('user/created', {
//   schema: z.object({ userId: z.string(), email: z.string() }),
// });
// inngest.createFunction(
//   { id: 'clone-audio/cleanup.scheduled', triggers: [userCreated] },
//   async ({ event }) => {
//     // event.data typed as { userId: string; email: string }
//   },
// );
