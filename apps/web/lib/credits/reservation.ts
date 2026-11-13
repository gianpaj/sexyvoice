import { captureException, logger } from '@sentry/nextjs';

import {
  reduceCredits,
  reduceCreditsAdmin,
  reduceCreditsUpTo,
  reduceCreditsUpToAdmin,
  restoreCredits,
} from '@/lib/supabase/queries';

/**
 * Who debits the balance: the signed-in user's session (dashboard) or the
 * service role (external API, where the user comes from an API key). Refunds
 * always run as the service role.
 */
type CreditActor = 'session' | 'service';

type SettlementOutcome =
  | 'exact'
  | 'refunded'
  | 'refund_failed'
  | 'debited'
  | 'partial_debit'
  | 'debit_failed';

interface CreditSettlement {
  /** Credits kept for the generation. */
  debited: number;
  /** Provider error message when a refund or extra debit failed. */
  error?: string;
  outcome: SettlementOutcome;
}

type RefundResult = { ok: true } | { error: string; ok: false };

export interface CreditReservation {
  /** Credits currently held. */
  readonly held: number;
  /**
   * Refund `amount` credits (all held credits by default). A failed refund
   * keeps the charge and is reported to Sentry.
   */
  release: (context: string, amount?: number) => Promise<RefundResult>;
  /**
   * Charge `actual` credits: refund the unused part, or debit the extra up to
   * the remaining balance. A failed refund or debit keeps the held amount.
   * Closes the reservation.
   */
  settle: (actual: number, context: string) => Promise<CreditSettlement>;
}

interface ReserveCreditsInput {
  actor: CreditActor;
  amount: number;
  /** Extra Sentry fields that identify the request. */
  telemetry?: Record<string, unknown>;
  userId: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Debit `amount` credits before provider work. Throws the RPC's
 * insufficient-credits error when the balance is short (see
 * `isInsufficientCreditsError`).
 */
export async function reserveCredits({
  actor,
  amount,
  telemetry = {},
  userId,
}: ReserveCreditsInput): Promise<CreditReservation> {
  const debit = actor === 'session' ? reduceCredits : reduceCreditsAdmin;
  const debitUpTo =
    actor === 'session' ? reduceCreditsUpTo : reduceCreditsUpToAdmin;
  const user = { id: userId };

  await debit({ amount, userId });
  let held = amount;
  let settled = false;

  async function refund(
    refundAmount: number,
    context: string,
    extra: Record<string, unknown>,
  ): Promise<RefundResult> {
    try {
      await restoreCredits({ amount: refundAmount, userId });
      return { ok: true };
    } catch (error) {
      logger.error('Failed to restore reserved credits', {
        extra: {
          ...telemetry,
          ...extra,
          amount: refundAmount,
          context,
          errorMessage: errorMessage(error),
        },
        user,
      });
      captureException(error, {
        extra: { ...telemetry, ...extra, amount: refundAmount, context },
        user,
      });
      return { error: errorMessage(error), ok: false };
    }
  }

  return {
    get held() {
      return held;
    },

    release(context, amount = held) {
      const refundAmount = Math.min(amount, held);
      if (refundAmount <= 0) {
        return Promise.resolve({ ok: true });
      }
      held -= refundAmount;
      return refund(refundAmount, context, {});
    },

    async settle(actual, context) {
      // A second settle would see nothing held and debit `actual` again.
      if (settled) {
        throw new Error('Credit reservation already settled');
      }
      settled = true;
      const reserved = held;
      held = 0;

      if (actual === reserved) {
        return { debited: reserved, outcome: 'exact' };
      }

      if (actual < reserved) {
        const refunded = await refund(reserved - actual, context, {
          actualCredits: actual,
          reservedCredits: reserved,
        });
        return refunded.ok
          ? { debited: actual, outcome: 'refunded' }
          : {
              debited: reserved,
              error: refunded.error,
              outcome: 'refund_failed',
            };
      }

      const additionalCredits = actual - reserved;
      try {
        const taken = await debitUpTo({ amount: additionalCredits, userId });
        const debited = reserved + taken;
        if (taken < additionalCredits) {
          logger.warn('Partially debited additional reserved credits', {
            extra: {
              ...telemetry,
              actualCredits: actual,
              additionalCredits,
              additionalCreditsDebited: taken,
              context,
              reservedCredits: reserved,
              totalCreditsDebited: debited,
            },
            user,
          });
          return { debited, outcome: 'partial_debit' };
        }
        return { debited, outcome: 'debited' };
      } catch (error) {
        logger.error('Failed to debit additional reserved credits', {
          extra: {
            ...telemetry,
            actualCredits: actual,
            additionalCredits,
            context,
            errorMessage: errorMessage(error),
            reservedCredits: reserved,
          },
          user,
        });
        captureException(error, {
          extra: {
            ...telemetry,
            actualCredits: actual,
            additionalCredits,
            context,
            reservedCredits: reserved,
          },
          user,
        });
        return {
          debited: reserved,
          error: errorMessage(error),
          outcome: 'debit_failed',
        };
      }
    },
  };
}
