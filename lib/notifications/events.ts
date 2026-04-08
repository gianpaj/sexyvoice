import { inngest } from '@/lib/inngest/client';
import {
  APP_NOTIFICATION_EVENT_NAMES,
  type BillingSubscriptionCanceledEventData,
  type BillingSubscriptionStartedEventData,
  type BillingTopupSucceededEventData,
  type CreditAllowanceThresholdReachedEventData,
  type GenerationSucceededEventData,
  type UserRegistrationCompletedEventData,
} from '@/lib/notifications/types';

export async function emitUserRegistrationCompletedEvent(
  data: UserRegistrationCompletedEventData,
) {
  await inngest.send({
    name: APP_NOTIFICATION_EVENT_NAMES.userRegistrationCompleted,
    data,
  });
}

export async function emitBillingTopupSucceededEvent(
  data: BillingTopupSucceededEventData,
) {
  await inngest.send({
    name: APP_NOTIFICATION_EVENT_NAMES.billingTopupSucceeded,
    data,
  });
}

export async function emitBillingSubscriptionStartedEvent(
  data: BillingSubscriptionStartedEventData,
) {
  await inngest.send({
    name: APP_NOTIFICATION_EVENT_NAMES.billingSubscriptionStarted,
    data,
  });
}

export async function emitBillingSubscriptionCanceledEvent(
  data: BillingSubscriptionCanceledEventData,
) {
  await inngest.send({
    name: APP_NOTIFICATION_EVENT_NAMES.billingSubscriptionCanceled,
    data,
  });
}

export async function emitGenerationSucceededEvent(
  data: GenerationSucceededEventData,
) {
  await inngest.send({
    name: APP_NOTIFICATION_EVENT_NAMES.generationSucceeded,
    data,
  });
}

export async function emitCreditAllowanceThresholdReachedEvent(
  data: CreditAllowanceThresholdReachedEventData,
) {
  await inngest.send({
    name: APP_NOTIFICATION_EVENT_NAMES.creditAllowanceThresholdReached,
    data,
  });
}
