// import { realtimeMiddleware } from '@inngest/realtime/middleware';
import { EventSchemas, Inngest } from 'inngest';

type CloneAudioCleanup = {
  data: {
    blobUrl: string;
    userId: string;
  };
};

type PaymentNotification = {
  data: {
    userId: string;
    userEmail: string;
    amount: number;
    planType: 'topup' | 'subscription';
    priceId: string;
    credits: number;
    paymentIntentId: string;
  };
};

type Events = {
  'clone-audio/cleanup.scheduled': CloneAudioCleanup;
  'payment/pro-plan-purchased': PaymentNotification;
};

export const inngest = new Inngest({
  id: 'sexyvoice',
  schemas: new EventSchemas().fromRecord<Events>(),
  // middleware: [realtimeMiddleware()],
});
