import { emitCreditAllowanceThresholdReachedEvent } from '@/lib/notifications/events';
import type { CreditAllowanceThresholdPercent } from '@/lib/notifications/types';
import { getLatestCreditAllowanceTransactionAdmin } from '@/lib/supabase/queries';

export function resolveThreshold(
  allowanceAmount: number,
  creditsRemaining: number,
): CreditAllowanceThresholdPercent | null {
  if (allowanceAmount <= 0) {
    return null;
  }

  const consumed = Math.max(0, allowanceAmount - creditsRemaining);

  if (consumed >= allowanceAmount) {
    return 100;
  }
  if (consumed * 100 >= allowanceAmount * 95) {
    return 95;
  }
  if (consumed * 100 >= allowanceAmount * 80) {
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

  await emitCreditAllowanceThresholdReachedEvent({
    userId: params.userId,
    creditTransactionId: latestAllowance.id,
    thresholdPercent: threshold,
    creditsRemaining: params.creditsRemaining,
    allowanceAmount: latestAllowance.amount,
  });
}
