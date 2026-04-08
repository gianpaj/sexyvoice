import { Resend } from 'resend';

import { CreditAllowanceAlertEmail } from '@/lib/email/templates/credit-allowance-alert';

export async function sendCreditAllowanceAlertEmail(params: {
  to: string;
  thresholdPercent: 80 | 95 | 100;
  creditsRemaining: number;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!(apiKey && from)) {
    return { sent: false, reason: 'resend_not_configured' as const };
  }

  const resend = new Resend(apiKey);
  const subject =
    params.thresholdPercent === 100
      ? 'Your SexyVoice API credits are fully used'
      : `Your SexyVoice API credits are ${params.thresholdPercent}% used`;

  const result = await resend.emails.send({
    from,
    to: params.to,
    subject,
    react: (
      <CreditAllowanceAlertEmail
        creditsRemaining={params.creditsRemaining}
        thresholdPercent={params.thresholdPercent}
      />
    ),
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return {
    sent: true,
    messageId: result.data?.id ?? null,
  };
}
