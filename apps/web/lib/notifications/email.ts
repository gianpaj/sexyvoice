import type { ReactElement } from 'react';
import { Resend } from 'resend';

export async function sendNotificationEmail(params: {
  react: ReactElement;
  subject: string;
  to: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!(apiKey && from)) {
    return { sent: false, reason: 'resend_not_configured' as const };
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: [params.to],
    subject: params.subject,
    react: params.react,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return {
    sent: true,
    messageId: result.data?.id ?? null,
  };
}
