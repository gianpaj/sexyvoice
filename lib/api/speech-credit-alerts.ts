import { sendCreditAllowanceAlertEmail } from '@/lib/email/send-credit-allowance-alert-email';
import {
  getLatestCreditAllowanceTransactionAdmin,
  getUserEmailAdmin,
  markCreditAllowanceAlertEmailAdmin,
  reserveCreditAllowanceAlertEmailAdmin,
} from '@/lib/supabase/queries';

function resolveThreshold(
  allowanceAmount: number,
  creditsRemaining: number,
): 80 | 95 | 100 | null {
  if (allowanceAmount <= 0) {
    return null;
  }

  const consumed = Math.max(0, allowanceAmount - creditsRemaining);
  const consumedPercent = (consumed / allowanceAmount) * 100;

  if (consumedPercent >= 100) {
    return 100;
  }
  if (consumedPercent >= 95) {
    return 95;
  }
  if (consumedPercent >= 80) {
    return 80;
  }

  return null;
}

export async function maybeSendSpeechCreditAllowanceAlert(params: {
  userId: string;
  creditsRemaining: number;
}) {
  const latestAllowance = await getLatestCreditAllowanceTransactionAdmin(
    params.userId,
  );
  if (!latestAllowance) {
    return;
  }

  const threshold = resolveThreshold(
    latestAllowance.amount,
    params.creditsRemaining,
  );
  if (!threshold) {
    return;
  }

  const email = await getUserEmailAdmin(params.userId);
  if (!email) {
    return;
  }

  const reserved = await reserveCreditAllowanceAlertEmailAdmin({
    userId: params.userId,
    creditTransactionId: latestAllowance.id,
    thresholdPercent: threshold,
    email,
  });

  if (!reserved) {
    return;
  }

  try {
    const result = await sendCreditAllowanceAlertEmail({
      to: email,
      thresholdPercent: threshold,
      creditsRemaining: params.creditsRemaining,
    });

    await markCreditAllowanceAlertEmailAdmin({
      creditTransactionId: latestAllowance.id,
      thresholdPercent: threshold,
      status: result.sent ? 'sent' : 'failed',
      resendMessageId: result.sent ? result.messageId : null,
      errorMessage: result.sent ? null : result.reason,
    });
  } catch (error) {
    await markCreditAllowanceAlertEmailAdmin({
      creditTransactionId: latestAllowance.id,
      thresholdPercent: threshold,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
