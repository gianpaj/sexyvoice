import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import { sendNotificationEmail } from '@/lib/notifications/email';
import {
  resolveOptionalEmailNotificationPreferences,
} from '@/lib/notifications/preferences';
import { renderNotificationEmail } from '@/lib/notifications/render-email';
import type {
  EmailTemplateKey,
  EmailTemplatePayload,
  NotificationDeliveryStatus,
  OptionalEmailPreferenceKey,
  ResendWebhookEventName,
} from '@/lib/notifications/types';
import { RESEND_WEBHOOK_EVENT_NAMES } from '@/lib/notifications/types';
import {
  createNotificationDeliveryAdmin,
  createNotificationEventAdmin,
  getUserNotificationContextAdmin,
  updateNotificationDeliveryAdmin,
  updateNotificationDeliveryByProviderMessageIdAdmin,
} from '@/lib/supabase/queries';

function resolveNotificationLocale(locale: string | null | undefined): Locale {
  return i18n.locales.includes(locale as Locale)
    ? (locale as Locale)
    : i18n.defaultLocale;
}

function mapResendWebhookEventToDeliveryStatus(
  eventName: ResendWebhookEventName,
): NotificationDeliveryStatus | null {
  switch (eventName) {
    case RESEND_WEBHOOK_EVENT_NAMES.delivered:
      return 'delivered';
    case RESEND_WEBHOOK_EVENT_NAMES.bounced:
      return 'bounced';
    case RESEND_WEBHOOK_EVENT_NAMES.complained:
      return 'complained';
    case RESEND_WEBHOOK_EVENT_NAMES.opened:
      return 'opened';
    case RESEND_WEBHOOK_EVENT_NAMES.clicked:
      return 'clicked';
  }
}

export async function dispatchNotificationEmail<
  TTemplateKey extends EmailTemplateKey,
>(params: {
  dedupeKey: string;
  eventName: string;
  locale?: string | null;
  optionalPreferenceKey?: OptionalEmailPreferenceKey;
  payload: EmailTemplatePayload<TTemplateKey>;
  sourceId?: string | null;
  sourceType: string;
  templateKey: TTemplateKey;
  userId: string;
}) {
  const notificationEventId = await createNotificationEventAdmin({
    userId: params.userId,
    eventName: params.eventName,
    sourceType: params.sourceType,
    sourceId: params.sourceId ?? null,
    dedupeKey: params.dedupeKey,
    payload: params.payload as unknown as Json,
  });

  if (!notificationEventId) {
    return { status: 'duplicate' as const };
  }

  const context = await getUserNotificationContextAdmin(params.userId);
  const locale = resolveNotificationLocale(params.locale ?? context.locale);
  const preferences = resolveOptionalEmailNotificationPreferences(
    context.preferences,
  );
  const isEnabled = params.optionalPreferenceKey
    ? preferences[params.optionalPreferenceKey]
    : true;

  const deliveryId = await createNotificationDeliveryAdmin({
    notificationEventId,
    userId: params.userId,
    channel: 'email',
    templateKey: params.templateKey,
    provider: 'resend',
    recipient: context.email,
    status: isEnabled ? 'pending' : 'skipped',
    metadata: {
      locale,
      dedupeKey: params.dedupeKey,
      optionalPreferenceKey: params.optionalPreferenceKey ?? null,
    },
  });

  if (!isEnabled) {
    return { status: 'skipped' as const };
  }

  if (!context.email) {
    await updateNotificationDeliveryAdmin({
      deliveryId,
      status: 'failed',
      errorMessage: 'missing_email',
    });
    return { status: 'failed' as const };
  }

  const { react, subject } = renderNotificationEmail({
    templateKey: params.templateKey,
    locale,
    payload: params.payload,
  });

  try {
    const result = await sendNotificationEmail({
      to: context.email,
      subject,
      react,
    });

    await updateNotificationDeliveryAdmin({
      deliveryId,
      status: result.sent ? 'sent' : 'failed',
      providerMessageId: result.sent ? result.messageId : null,
      errorMessage: result.sent ? null : result.reason,
      sentAt: result.sent ? new Date().toISOString() : null,
      lastProviderEventAt: result.sent ? new Date().toISOString() : null,
    });

    return { status: result.sent ? ('sent' as const) : ('failed' as const) };
  } catch (error) {
    await updateNotificationDeliveryAdmin({
      deliveryId,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { status: 'failed' as const };
  }
}

export async function syncNotificationDeliveryFromResendEvent(params: {
  eventName: ResendWebhookEventName;
  payload: {
    created_at?: string;
    email_id?: string;
    id?: string;
  };
}) {
  const providerMessageId = params.payload.email_id ?? params.payload.id ?? null;
  const status = mapResendWebhookEventToDeliveryStatus(params.eventName);

  if (!(providerMessageId && status)) {
    return;
  }

  await updateNotificationDeliveryByProviderMessageIdAdmin({
    provider: 'resend',
    providerMessageId,
    status,
    lastProviderEventAt:
      params.payload.created_at ?? new Date().toISOString(),
  });
}
