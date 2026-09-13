import { captureException, captureMessage } from '@sentry/nextjs';

import { isCreditBalance } from '@/lib/credit-balance';
import type { TypedSupabaseClient } from './client';

export async function getDashboardCreditBalance(
  supabase: TypedSupabaseClient,
  userId: string,
  route: 'dashboard/generate' | 'dashboard/clone',
): Promise<number | null> {
  const { data, error } = await supabase
    .from('credits')
    .select('amount')
    .eq('user_id', userId)
    .single();

  if (!error && isCreditBalance(data?.amount)) {
    if (data.amount < 0) {
      captureMessage('Negative credit balance', { level: 'warning' });
    }
    return data.amount;
  }

  captureException(
    new Error(
      error
        ? 'Credit balance lookup failed'
        : 'Credit balance is missing or invalid',
    ),
    {
      extra: error
        ? {
            balanceLookupError: {
              code: error.code,
              details: error.details,
              hint: error.hint,
              message: error.message,
            },
          }
        : undefined,
      level: 'error',
      tags: { route },
      user: { id: userId },
    },
  );
  return null;
}
