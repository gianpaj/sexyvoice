import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { ReactElement, ReactNode } from 'react';

import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import {
  EMAIL_TEMPLATE_KEYS,
  type BillingSubscriptionCanceledEventData,
  type BillingSubscriptionStartedEventData,
  type BillingTopupSucceededEventData,
  type CreditAllowanceThresholdReachedEventData,
  type EmailTemplateKey,
  type EmailTemplatePayload,
  type GenerationSucceededEventData,
  type UserRegistrationCompletedEventData,
} from '@/lib/notifications/types';

const FALLBACK_APP_URL = 'http://localhost:3000';

const NUMBER_FORMAT = new Intl.NumberFormat('en-US');

const PLAN_LABELS = {
  starter: 'Starter',
  standard: 'Standard',
  pro: 'Pro',
} as const;

function resolveEmailLocale(locale: Locale | null | undefined): Locale {
  return i18n.locales.includes(locale as Locale)
    ? (locale as Locale)
    : i18n.defaultLocale;
}

function getAppUrl(locale: Locale, path: string) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_APP_URL;
  return new URL(`/${locale}${path}`, origin).toString();
}

function formatCredits(value: number) {
  return NUMBER_FORMAT.format(Math.max(0, value));
}

function NotificationEmailLayout({
  body,
  ctaHref,
  ctaLabel,
  preview,
  subtitle,
  title,
}: {
  body: ReactNode;
  ctaHref?: string;
  ctaLabel?: string;
  preview: string;
  subtitle: string;
  title: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{ backgroundColor: '#f6f9fc', fontFamily: 'Inter, sans-serif' }}
      >
        <Container
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            margin: '24px auto',
            maxWidth: '560px',
            padding: '24px',
          }}
        >
          <Heading style={{ fontSize: '24px', marginBottom: '8px' }}>
            {title}
          </Heading>
          <Text style={{ color: '#4b5563', fontSize: '14px', marginTop: 0 }}>
            {subtitle}
          </Text>
          <Section
            style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            {body}
          </Section>
          {ctaHref && ctaLabel ? (
            <Section style={{ marginTop: '24px' }}>
              <Button
                href={ctaHref}
                style={{
                  backgroundColor: '#111827',
                  borderRadius: '8px',
                  color: '#ffffff',
                  display: 'inline-block',
                  fontSize: '14px',
                  fontWeight: 600,
                  padding: '12px 18px',
                  textDecoration: 'none',
                }}
              >
                {ctaLabel}
              </Button>
            </Section>
          ) : null}
          <Hr style={{ margin: '24px 0' }} />
          <Text style={{ color: '#6b7280', fontSize: '12px', marginBottom: 0 }}>
            You are receiving this transactional email because it is related to
            your SexyVoice account activity.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export function renderNotificationEmail<TTemplateKey extends EmailTemplateKey>(params: {
  locale: Locale | null | undefined;
  payload: EmailTemplatePayload<TTemplateKey>;
  templateKey: TTemplateKey;
}): { react: ReactElement; subject: string } {
  const locale = resolveEmailLocale(params.locale);

  switch (params.templateKey) {
    case EMAIL_TEMPLATE_KEYS.registrationSuccess: {
      const payload = params.payload as UserRegistrationCompletedEventData;
      const authMethod =
        payload.authProvider === 'email'
          ? 'email confirmation'
          : payload.authProvider === 'google'
            ? 'Google sign-in'
            : 'social sign-in';

      return {
        subject: 'Welcome to SexyVoice.ai',
        react: (
          <NotificationEmailLayout
            body={
              <>
                <Text style={{ fontSize: '14px', margin: '0 0 12px' }}>
                  Your account is ready, and your signup has been completed via{' '}
                  <strong>{authMethod}</strong>.
                </Text>
                <Text style={{ fontSize: '14px', margin: 0 }}>
                  Head to the dashboard to generate your first voice, explore
                  public voices, or create API keys when your account is ready.
                </Text>
              </>
            }
            ctaHref={getAppUrl(locale, '/dashboard/generate')}
            ctaLabel="Open dashboard"
            preview="Your SexyVoice account is ready."
            subtitle="Your account has been created successfully."
            title="Welcome to SexyVoice.ai"
          />
        ),
      };
    }

    case EMAIL_TEMPLATE_KEYS.topupSuccess: {
      const payload = params.payload as BillingTopupSucceededEventData;

      return {
        subject: `${formatCredits(payload.credits)} SexyVoice credits added`,
        react: (
          <NotificationEmailLayout
            body={
              <>
                <Text style={{ fontSize: '14px', margin: '0 0 12px' }}>
                  Your top-up was successful and{' '}
                  <strong>{formatCredits(payload.credits)} credits</strong> have
                  been added to your account.
                </Text>
                <Text style={{ fontSize: '14px', margin: 0 }}>
                  Charged amount: <strong>${payload.dollarAmount.toFixed(2)}</strong>
                </Text>
              </>
            }
            ctaHref={getAppUrl(locale, '/dashboard/credits')}
            ctaLabel="View credits"
            preview="Your SexyVoice top-up was successful."
            subtitle="Your account balance has been updated."
            title="Credits added successfully"
          />
        ),
      };
    }

    case EMAIL_TEMPLATE_KEYS.subscriptionStarted: {
      const payload = params.payload as BillingSubscriptionStartedEventData;
      const planLabel = PLAN_LABELS[payload.planKey];

      return {
        subject: `Your SexyVoice ${planLabel} subscription is active`,
        react: (
          <NotificationEmailLayout
            body={
              <>
                <Text style={{ fontSize: '14px', margin: '0 0 12px' }}>
                  Your <strong>{planLabel}</strong> subscription is active.
                </Text>
                <Text style={{ fontSize: '14px', margin: '0 0 12px' }}>
                  You have received{' '}
                  <strong>{formatCredits(payload.credits)} monthly credits</strong>
                  .
                </Text>
                <Text style={{ fontSize: '14px', margin: 0 }}>
                  Charged amount: <strong>${payload.dollarAmount.toFixed(2)}</strong>
                </Text>
              </>
            }
            ctaHref={getAppUrl(locale, '/dashboard/credits')}
            ctaLabel="Manage billing"
            preview="Your SexyVoice subscription is active."
            subtitle="Your subscription setup is complete."
            title={`${planLabel} subscription confirmed`}
          />
        ),
      };
    }

    case EMAIL_TEMPLATE_KEYS.subscriptionCanceled: {
      const payload = params.payload as BillingSubscriptionCanceledEventData;
      const planText = payload.planKey
        ? `${PLAN_LABELS[payload.planKey]} subscription`
        : 'subscription';

      return {
        subject: 'Your SexyVoice subscription has been canceled',
        react: (
          <NotificationEmailLayout
            body={
              <>
                <Text style={{ fontSize: '14px', margin: '0 0 12px' }}>
                  Your {planText} has been canceled successfully.
                </Text>
                <Text style={{ fontSize: '14px', margin: 0 }}>
                  If this was unintentional, you can return to billing at any
                  time to start a new plan.
                </Text>
              </>
            }
            ctaHref={getAppUrl(locale, '/dashboard/credits')}
            ctaLabel="Open billing"
            preview="Your SexyVoice subscription has been canceled."
            subtitle="No further subscription charges will be made from this cancellation."
            title="Subscription canceled"
          />
        ),
      };
    }

    case EMAIL_TEMPLATE_KEYS.firstGeneration: {
      const payload = params.payload as GenerationSucceededEventData;
      const sourceLabel =
        payload.sourceType === 'voice_cloning'
          ? 'voice clone'
          : payload.sourceType === 'api_tts'
            ? 'API generation'
            : 'voice generation';

      return {
        subject: 'Your first SexyVoice creation is complete',
        react: (
          <NotificationEmailLayout
            body={
              <>
                <Text style={{ fontSize: '14px', margin: '0 0 12px' }}>
                  Nice work. Your first successful SexyVoice {sourceLabel} is in
                  the books.
                </Text>
                <Text style={{ fontSize: '14px', margin: 0 }}>
                  Keep experimenting with voices, styles, and cloning workflows
                  to build out your library.
                </Text>
              </>
            }
            ctaHref={getAppUrl(locale, '/dashboard/history')}
            ctaLabel="View history"
            preview="Your first SexyVoice creation is ready."
            subtitle="Your account has completed its first successful generation."
            title="First creation complete"
          />
        ),
      };
    }

    case EMAIL_TEMPLATE_KEYS.creditAllowanceThreshold: {
      const payload =
        params.payload as CreditAllowanceThresholdReachedEventData;
      const subject =
        payload.thresholdPercent === 100
          ? 'Your SexyVoice API credits are fully used'
          : `Your SexyVoice API credits are ${payload.thresholdPercent}% used`;

      return {
        subject,
        react: (
          <NotificationEmailLayout
            body={
              <>
                <Text style={{ fontSize: '14px', margin: '0 0 12px' }}>
                  Your latest credit allowance is now{' '}
                  <strong>{payload.thresholdPercent}% consumed</strong>.
                </Text>
                <Text style={{ fontSize: '14px', margin: '0 0 12px' }}>
                  Remaining credits:{' '}
                  <strong>{formatCredits(payload.creditsRemaining)}</strong>
                </Text>
                <Text style={{ fontSize: '14px', margin: 0 }}>
                  Latest allowance size:{' '}
                  <strong>{formatCredits(payload.allowanceAmount)}</strong>
                </Text>
              </>
            }
            ctaHref={getAppUrl(locale, '/dashboard/credits')}
            ctaLabel="Top up credits"
            preview={`Your SexyVoice API credits are ${payload.thresholdPercent}% used.`}
            subtitle="Your external Speech API usage is close to the limit of your latest credit allowance."
            title="Credit usage alert"
          />
        ),
      };
    }
  }
}
