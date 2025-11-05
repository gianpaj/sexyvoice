import { serve } from 'inngest/next';

import { inngest } from '@/lib/inngest/client';
import { cleanupCloneAudio, notifyProPlanPurchase } from '@/lib/inngest/functions';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [cleanupCloneAudio, notifyProPlanPurchase],
});
