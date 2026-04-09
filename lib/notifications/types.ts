import type { Locale } from '@/lib/i18n/i18n-config';

export const APP_NOTIFICATION_EVENT_NAMES = {
  userRegistrationCompleted: 'app/user.registration.completed',
  billingTopupSucceeded: 'app/billing.topup.succeeded',
  billingSubscriptionStarted: 'app/billing.subscription.started',
  billingSubscriptionCanceled: 'app/billing.subscription.canceled',
  generationSucceeded: 'app/generation.succeeded',
  creditAllowanceThresholdReached: 'app/credits.allowance-threshold.reached',
} as const;

export const RESEND_WEBHOOK_EVENT_NAMES = {
  delivered: 'resend/email.delivered',
  bounced: 'resend/email.bounced',
  complained: 'resend/email.complained',
  opened: 'resend/email.opened',
  clicked: 'resend/email.clicked',
} as const;

export const EMAIL_TEMPLATE_KEYS = {
  registrationSuccess: 'registration_success',
  topupSuccess: 'topup_success',
  subscriptionStarted: 'subscription_started',
  subscriptionCanceled: 'subscription_canceled',
  firstGeneration: 'first_generation',
  creditAllowanceThreshold: 'credit_allowance_threshold',
} as const;

export const OPTIONAL_EMAIL_PREFERENCE_KEYS = {
  welcomeEmail: 'welcome_email',
  firstGenerationEmail: 'first_generation_email',
} as const;

export type AppNotificationEventName =
  (typeof APP_NOTIFICATION_EVENT_NAMES)[keyof typeof APP_NOTIFICATION_EVENT_NAMES];
export type ResendWebhookEventName =
  (typeof RESEND_WEBHOOK_EVENT_NAMES)[keyof typeof RESEND_WEBHOOK_EVENT_NAMES];
export type EmailTemplateKey =
  (typeof EMAIL_TEMPLATE_KEYS)[keyof typeof EMAIL_TEMPLATE_KEYS];
export type OptionalEmailPreferenceKey =
  (typeof OPTIONAL_EMAIL_PREFERENCE_KEYS)[keyof typeof OPTIONAL_EMAIL_PREFERENCE_KEYS];

export type SupportedNotificationLocale = Locale;
export type NotificationChannel = 'email' | 'in_app';
export type NotificationDeliveryStatus =
  | 'pending'
  | 'skipped'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'failed';

export type BillingPlanKey = 'starter' | 'standard' | 'pro';
export type RegistrationAuthProvider = 'email' | 'google' | 'social';
export type GenerationSourceType = 'tts' | 'voice_cloning' | 'api_tts';
export type CreditAllowanceThresholdPercent = 80 | 95 | 100;

export interface UserRegistrationCompletedEventData {
  authProvider: RegistrationAuthProvider;
  locale: SupportedNotificationLocale | null;
  userId: string;
}

export interface BillingTopupSucceededEventData {
  credits: number;
  dollarAmount: number;
  packageId: string;
  paymentIntentId: string;
  userId: string;
}

export interface BillingSubscriptionStartedEventData {
  credits: number;
  dollarAmount: number;
  paymentIntentId: string;
  planKey: BillingPlanKey;
  subscriptionId: string;
  userId: string;
}

export interface BillingSubscriptionCanceledEventData {
  planKey: BillingPlanKey | null;
  subscriptionId: string;
  userId: string;
}

export interface GenerationSucceededEventData {
  model: string;
  sourceId: string | null;
  sourceType: GenerationSourceType;
  userId: string;
  voiceName: string | null;
}

export interface CreditAllowanceThresholdReachedEventData {
  allowanceAmount: number;
  creditsRemaining: number;
  creditTransactionId: string;
  thresholdPercent: CreditAllowanceThresholdPercent;
  userId: string;
}

export interface ResendWebhookEventData {
  created_at?: string;
  email_id?: string;
  id?: string;
  to?: string[];
}

export interface EmailTemplatePayloadMap {
  [EMAIL_TEMPLATE_KEYS.registrationSuccess]: UserRegistrationCompletedEventData;
  [EMAIL_TEMPLATE_KEYS.topupSuccess]: BillingTopupSucceededEventData;
  [EMAIL_TEMPLATE_KEYS.subscriptionStarted]: BillingSubscriptionStartedEventData;
  [EMAIL_TEMPLATE_KEYS.subscriptionCanceled]: BillingSubscriptionCanceledEventData;
  [EMAIL_TEMPLATE_KEYS.firstGeneration]: GenerationSucceededEventData;
  [EMAIL_TEMPLATE_KEYS.creditAllowanceThreshold]: CreditAllowanceThresholdReachedEventData;
}

export type EmailTemplatePayload<
  TTemplateKey extends EmailTemplateKey = EmailTemplateKey,
> = EmailTemplatePayloadMap[TTemplateKey];

export const DEFAULT_OPTIONAL_EMAIL_NOTIFICATION_PREFERENCES: Record<
  OptionalEmailPreferenceKey,
  boolean
> = {
  [OPTIONAL_EMAIL_PREFERENCE_KEYS.welcomeEmail]: true,
  [OPTIONAL_EMAIL_PREFERENCE_KEYS.firstGenerationEmail]: true,
};

export const buildRegistrationCompletedDedupeKey = (userId: string) =>
  `registration-completed:${userId}`;

export const buildTopupSucceededDedupeKey = (paymentIntentId: string) =>
  `topup-succeeded:${paymentIntentId}`;

export const buildSubscriptionStartedDedupeKey = (subscriptionId: string) =>
  `subscription-started:${subscriptionId}`;

export const buildSubscriptionCanceledDedupeKey = (subscriptionId: string) =>
  `subscription-canceled:${subscriptionId}`;

export const buildFirstGenerationDedupeKey = (userId: string) =>
  `first-generation:${userId}`;

export const buildCreditAllowanceThresholdDedupeKey = (
  creditTransactionId: string,
  thresholdPercent: CreditAllowanceThresholdPercent,
) => `credit-allowance-threshold:${creditTransactionId}:${thresholdPercent}`;
