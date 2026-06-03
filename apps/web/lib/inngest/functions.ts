import { inngest } from '@/lib/inngest/client';
import {
  dispatchNotificationEmail,
  syncNotificationDeliveryFromResendEvent,
} from '@/lib/notifications/service';
import {
  APP_NOTIFICATION_EVENT_NAMES,
  buildCreditAllowanceThresholdDedupeKey,
  buildFirstGenerationDedupeKey,
  buildRegistrationCompletedDedupeKey,
  buildSubscriptionCanceledDedupeKey,
  buildSubscriptionStartedDedupeKey,
  buildTopupSucceededDedupeKey,
  EMAIL_TEMPLATE_KEYS,
  OPTIONAL_EMAIL_PREFERENCE_KEYS,
  RESEND_WEBHOOK_EVENT_NAMES,
  type ResendWebhookEventName,
} from '@/lib/notifications/types';

const sendRegistrationCompletedEmail = inngest.createFunction(
  { id: 'send-registration-completed-email' },
  { event: APP_NOTIFICATION_EVENT_NAMES.userRegistrationCompleted },
  async ({ event, step }) => {
    await step.run('deliver-registration-completed-email', async () => {
      await dispatchNotificationEmail({
        userId: event.data.userId,
        eventName: APP_NOTIFICATION_EVENT_NAMES.userRegistrationCompleted,
        sourceType: 'user',
        sourceId: event.data.userId,
        dedupeKey: buildRegistrationCompletedDedupeKey(event.data.userId),
        templateKey: EMAIL_TEMPLATE_KEYS.registrationSuccess,
        payload: event.data,
        optionalPreferenceKey: OPTIONAL_EMAIL_PREFERENCE_KEYS.welcomeEmail,
        locale: event.data.locale,
      });
    });
  },
);

const sendBillingTopupSucceededEmail = inngest.createFunction(
  { id: 'send-billing-topup-succeeded-email' },
  { event: APP_NOTIFICATION_EVENT_NAMES.billingTopupSucceeded },
  async ({ event, step }) => {
    await step.run('deliver-billing-topup-email', async () => {
      await dispatchNotificationEmail({
        userId: event.data.userId,
        eventName: APP_NOTIFICATION_EVENT_NAMES.billingTopupSucceeded,
        sourceType: 'payment_intent',
        sourceId: event.data.paymentIntentId,
        dedupeKey: buildTopupSucceededDedupeKey(event.data.paymentIntentId),
        templateKey: EMAIL_TEMPLATE_KEYS.topupSuccess,
        payload: event.data,
      });
    });
  },
);

const sendBillingSubscriptionStartedEmail = inngest.createFunction(
  { id: 'send-billing-subscription-started-email' },
  { event: APP_NOTIFICATION_EVENT_NAMES.billingSubscriptionStarted },
  async ({ event, step }) => {
    await step.run('deliver-billing-subscription-started-email', async () => {
      await dispatchNotificationEmail({
        userId: event.data.userId,
        eventName: APP_NOTIFICATION_EVENT_NAMES.billingSubscriptionStarted,
        sourceType: 'subscription',
        sourceId: event.data.subscriptionId,
        dedupeKey: buildSubscriptionStartedDedupeKey(event.data.subscriptionId),
        templateKey: EMAIL_TEMPLATE_KEYS.subscriptionStarted,
        payload: event.data,
      });
    });
  },
);

const sendBillingSubscriptionCanceledEmail = inngest.createFunction(
  { id: 'send-billing-subscription-canceled-email' },
  { event: APP_NOTIFICATION_EVENT_NAMES.billingSubscriptionCanceled },
  async ({ event, step }) => {
    await step.run('deliver-billing-subscription-canceled-email', async () => {
      await dispatchNotificationEmail({
        userId: event.data.userId,
        eventName: APP_NOTIFICATION_EVENT_NAMES.billingSubscriptionCanceled,
        sourceType: 'subscription',
        sourceId: event.data.subscriptionId,
        dedupeKey: buildSubscriptionCanceledDedupeKey(
          event.data.subscriptionId,
        ),
        templateKey: EMAIL_TEMPLATE_KEYS.subscriptionCanceled,
        payload: event.data,
      });
    });
  },
);

const sendFirstGenerationEmail = inngest.createFunction(
  { id: 'send-first-generation-email' },
  { event: APP_NOTIFICATION_EVENT_NAMES.generationSucceeded },
  async ({ event, step }) => {
    await step.run('deliver-first-generation-email', async () => {
      await dispatchNotificationEmail({
        userId: event.data.userId,
        eventName: APP_NOTIFICATION_EVENT_NAMES.generationSucceeded,
        sourceType: event.data.sourceType,
        sourceId: event.data.sourceId,
        dedupeKey: buildFirstGenerationDedupeKey(event.data.userId),
        templateKey: EMAIL_TEMPLATE_KEYS.firstGeneration,
        payload: event.data,
        optionalPreferenceKey:
          OPTIONAL_EMAIL_PREFERENCE_KEYS.firstGenerationEmail,
      });
    });
  },
);

const sendCreditAllowanceThresholdEmail = inngest.createFunction(
  { id: 'send-credit-allowance-threshold-email' },
  { event: APP_NOTIFICATION_EVENT_NAMES.creditAllowanceThresholdReached },
  async ({ event, step }) => {
    await step.run('deliver-credit-allowance-threshold-email', async () => {
      await dispatchNotificationEmail({
        userId: event.data.userId,
        eventName: APP_NOTIFICATION_EVENT_NAMES.creditAllowanceThresholdReached,
        sourceType: 'credit_transaction',
        sourceId: event.data.creditTransactionId,
        dedupeKey: buildCreditAllowanceThresholdDedupeKey(
          event.data.creditTransactionId,
          event.data.thresholdPercent,
        ),
        templateKey: EMAIL_TEMPLATE_KEYS.creditAllowanceThreshold,
        payload: event.data,
      });
    });
  },
);

function createResendStatusSyncFunction(params: {
  eventName: ResendWebhookEventName;
  id: string;
}) {
  return inngest.createFunction(
    { id: params.id },
    { event: params.eventName },
    async ({ event, step }) => {
      await step.run(`sync-${params.id}`, async () => {
        await syncNotificationDeliveryFromResendEvent({
          eventName: params.eventName,
          payload: event.data,
        });
      });
    },
  );
}

const syncResendDeliveredEmail = createResendStatusSyncFunction({
  id: 'sync-resend-delivered-email',
  eventName: RESEND_WEBHOOK_EVENT_NAMES.delivered,
});

const syncResendBouncedEmail = createResendStatusSyncFunction({
  id: 'sync-resend-bounced-email',
  eventName: RESEND_WEBHOOK_EVENT_NAMES.bounced,
});

const syncResendComplainedEmail = createResendStatusSyncFunction({
  id: 'sync-resend-complained-email',
  eventName: RESEND_WEBHOOK_EVENT_NAMES.complained,
});

const syncResendOpenedEmail = createResendStatusSyncFunction({
  id: 'sync-resend-opened-email',
  eventName: RESEND_WEBHOOK_EVENT_NAMES.opened,
});

const syncResendClickedEmail = createResendStatusSyncFunction({
  id: 'sync-resend-clicked-email',
  eventName: RESEND_WEBHOOK_EVENT_NAMES.clicked,
});

export const functions = [
  sendRegistrationCompletedEmail,
  sendBillingTopupSucceededEmail,
  sendBillingSubscriptionStartedEmail,
  sendBillingSubscriptionCanceledEmail,
  sendFirstGenerationEmail,
  sendCreditAllowanceThresholdEmail,
  syncResendDeliveredEmail,
  syncResendBouncedEmail,
  syncResendComplainedEmail,
  syncResendOpenedEmail,
  syncResendClickedEmail,
];
