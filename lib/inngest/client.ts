import { EventSchemas, Inngest } from 'inngest';

import {
  APP_NOTIFICATION_EVENT_NAMES,
  RESEND_WEBHOOK_EVENT_NAMES,
  type BillingSubscriptionCanceledEventData,
  type BillingSubscriptionStartedEventData,
  type BillingTopupSucceededEventData,
  type CreditAllowanceThresholdReachedEventData,
  type GenerationSucceededEventData,
  type ResendWebhookEventData,
  type UserRegistrationCompletedEventData,
} from '@/lib/notifications/types';

type Events = {
  [APP_NOTIFICATION_EVENT_NAMES.userRegistrationCompleted]: {
    data: UserRegistrationCompletedEventData;
  };
  [APP_NOTIFICATION_EVENT_NAMES.billingTopupSucceeded]: {
    data: BillingTopupSucceededEventData;
  };
  [APP_NOTIFICATION_EVENT_NAMES.billingSubscriptionStarted]: {
    data: BillingSubscriptionStartedEventData;
  };
  [APP_NOTIFICATION_EVENT_NAMES.billingSubscriptionCanceled]: {
    data: BillingSubscriptionCanceledEventData;
  };
  [APP_NOTIFICATION_EVENT_NAMES.generationSucceeded]: {
    data: GenerationSucceededEventData;
  };
  [APP_NOTIFICATION_EVENT_NAMES.creditAllowanceThresholdReached]: {
    data: CreditAllowanceThresholdReachedEventData;
  };
  [RESEND_WEBHOOK_EVENT_NAMES.delivered]: {
    data: ResendWebhookEventData;
  };
  [RESEND_WEBHOOK_EVENT_NAMES.bounced]: {
    data: ResendWebhookEventData;
  };
  [RESEND_WEBHOOK_EVENT_NAMES.complained]: {
    data: ResendWebhookEventData;
  };
  [RESEND_WEBHOOK_EVENT_NAMES.opened]: {
    data: ResendWebhookEventData;
  };
  [RESEND_WEBHOOK_EVENT_NAMES.clicked]: {
    data: ResendWebhookEventData;
  };
};

export const inngest = new Inngest({
  id: 'sexyvoice',
  schemas: new EventSchemas().fromRecord<Events>(),
});
