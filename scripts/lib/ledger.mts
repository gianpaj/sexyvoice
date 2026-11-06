/// <reference path="../../apps/web/lib/supabase/types.d.ts" />

import {
  PAGE_SIZE,
  type QueryResult,
  readAllRows,
  type ScriptSupabaseClient,
} from './supabase.mts';
import { UUID_PATTERN } from './uuid.mts';

/** User IDs per `.in()` filter; 100 UUIDs keep a request URL near 4 KB. */
const USER_IDS_PER_REQUEST = 100;

export type CreditTransaction = Tables<'credit_transactions'>;
export type CreditBalance = Pick<
  Tables<'credits'>,
  'amount' | 'updated_at' | 'user_id'
>;
export type UsageEvent = Pick<
  Tables<'usage_events'>,
  | 'created_at'
  | 'credits_used'
  | 'id'
  | 'occurred_at'
  | 'quantity'
  | 'source_type'
  | 'user_id'
>;
export type Payment = Pick<
  CreditTransaction,
  'created_at' | 'id' | 'type' | 'user_id'
>;

/** Every row for these users, read a chunk of users at a time. */
async function readForUsers<Row extends { id: string }>(
  label: string,
  userIds: readonly string[],
  page: (
    userIdChunk: string[],
    afterId: string | undefined,
  ) => PromiseLike<QueryResult<Row>>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let start = 0; start < userIds.length; start += USER_IDS_PER_REQUEST) {
    const chunk = userIds.slice(start, start + USER_IDS_PER_REQUEST);
    rows.push(...(await readAllRows(label, (afterId) => page(chunk, afterId))));
  }
  return rows;
}

/** Every credit transaction of these users, oldest first. */
export async function readCreditTransactions(
  supabase: ScriptSupabaseClient,
  userIds: readonly string[],
  { until }: { until?: string } = {},
): Promise<CreditTransaction[]> {
  const rows = await readForUsers(
    'credit transactions',
    userIds,
    (chunk, afterId) => {
      let query = supabase
        .from('credit_transactions')
        .select('*')
        .in('user_id', chunk)
        .order('id')
        .limit(PAGE_SIZE);
      if (until) query = query.lte('created_at', until);
      if (afterId) query = query.gt('id', afterId);
      return query;
    },
  );
  return rows.sort(
    (left, right) =>
      Date.parse(left.created_at) - Date.parse(right.created_at) ||
      left.id.localeCompare(right.id),
  );
}

/** Every usage event of these users, earliest first. */
export async function readUsageEvents(
  supabase: ScriptSupabaseClient,
  userIds: readonly string[],
  { until }: { until?: string } = {},
): Promise<UsageEvent[]> {
  const rows = await readForUsers('usage events', userIds, (chunk, afterId) => {
    let query = supabase
      .from('usage_events')
      .select(
        'id, user_id, source_type, quantity, credits_used, occurred_at, created_at',
      )
      .in('user_id', chunk)
      .order('id')
      .limit(PAGE_SIZE);
    if (until) query = query.lte('created_at', until);
    if (afterId) query = query.gt('id', afterId);
    return query;
  });
  return rows.sort(
    (left, right) =>
      Date.parse(left.occurred_at) - Date.parse(right.occurred_at) ||
      left.id.localeCompare(right.id),
  );
}

/** `credits` rows by user ID; a user without a row is absent. */
export async function readBalances(
  supabase: ScriptSupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, CreditBalance>> {
  const rows = await readForUsers(
    'credit balances',
    userIds,
    (chunk, afterId) => {
      let query = supabase
        .from('credits')
        .select('id, user_id, amount, updated_at')
        .in('user_id', chunk)
        .order('id')
        .limit(PAGE_SIZE);
      if (afterId) query = query.gt('id', afterId);
      return query;
    },
  );
  return new Map(
    rows.map(({ amount, updated_at, user_id }) => [
      user_id,
      { amount, updated_at, user_id },
    ]),
  );
}

/** Purchase and top-up rows of these users. */
export function readPayments(
  supabase: ScriptSupabaseClient,
  userIds: readonly string[],
): Promise<Payment[]> {
  return readForUsers('payments', userIds, (chunk, afterId) => {
    let query = supabase
      .from('credit_transactions')
      .select('id, user_id, type, created_at')
      .in('user_id', chunk)
      .in('type', ['purchase', 'topup'])
      .order('id')
      .limit(PAGE_SIZE);
    if (afterId) query = query.gt('id', afterId);
    return query;
  });
}

/** The users, among these, who ever paid; see hasEverPaid. */
export async function readPaidUserIds(
  supabase: ScriptSupabaseClient,
  userIds: readonly string[],
): Promise<Set<string>> {
  const payments = await readPayments(supabase, userIds);
  return new Set(payments.map((payment) => payment.user_id));
}

export function isPayment(
  transaction: Pick<CreditTransaction, 'type'>,
): boolean {
  return transaction.type === 'purchase' || transaction.type === 'topup';
}

/**
 * `metadata.dollarAmount`: what a purchase or top-up charged, or a negative
 * amount on the refund row of a cash refund.
 */
export function dollarAmount(
  transaction: Pick<CreditTransaction, 'metadata'>,
): number | undefined {
  const { metadata } = transaction;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const value = metadata.dollarAmount;
    return typeof value === 'number' ? value : undefined;
  }
  return undefined;
}

/** A payment that charged money, so a cash refund can go against it. */
export function isCashPayment(
  transaction: Pick<CreditTransaction, 'metadata' | 'type'>,
): boolean {
  return isPayment(transaction) && (dollarAmount(transaction) ?? 0) > 0;
}

/**
 * A paid user has a purchase or top-up row, ever; the web app's hasUserPaid
 * uses the same rule. Penalty resets never touch paid users.
 */
export function hasEverPaid(
  transactions: readonly Pick<CreditTransaction, 'type'>[],
): boolean {
  return transactions.some(isPayment);
}

/** Whether a purchase or top-up happened before `at`, as for `free_call`. */
export function paidBefore(
  transactions: readonly Pick<CreditTransaction, 'created_at' | 'type'>[],
  at: string,
): boolean {
  const cutoff = Date.parse(at);
  return transactions.some(
    (transaction) =>
      isPayment(transaction) && Date.parse(transaction.created_at) < cutoff,
  );
}

/** Whether any payment charged money; only then can a cash refund happen. */
export function hasCashPurchase(
  transactions: readonly Pick<CreditTransaction, 'metadata' | 'type'>[],
): boolean {
  return transactions.some(isCashPayment);
}

/**
 * The ledger equation: a balance should equal the sum of every
 * credit_transactions amount (purchases, top-ups, freemium grants and signed
 * refunds) minus the credits recorded in usage_events.
 */
export function expectedBalance(
  netLedgerCredits: number,
  creditsUsed: number,
): number {
  return netLedgerCredits - creditsUsed;
}

export interface LedgerSummary {
  balance: number;
  /** Dollars returned by cash refunds. */
  cashRefunded: number;
  /** Dollars charged by purchases and top-ups. */
  charged: number;
  creditsUsed: number;
  /** balance - expected: above 0 the ledger does not explain the credits. */
  delta: number;
  expected: number;
  freemium: number;
  /** Credits from purchases and top-ups. */
  purchased: number;
  /** Credits that `refund` rows added back. */
  refundsAdded: number;
  /** Credits that `refund` rows took away (cash refunds and resets). */
  refundsRemoved: number;
}

export function summarizeLedger(
  transactions: readonly CreditTransaction[],
  creditsUsed: number,
  balance: number,
): LedgerSummary {
  const summary = {
    cashRefunded: 0,
    charged: 0,
    freemium: 0,
    purchased: 0,
    refundsAdded: 0,
    refundsRemoved: 0,
  };
  let net = 0;
  for (const transaction of transactions) {
    net += transaction.amount;
    if (isPayment(transaction)) {
      summary.purchased += transaction.amount;
      if (isCashPayment(transaction)) {
        summary.charged += dollarAmount(transaction) ?? 0;
      }
    } else if (transaction.type === 'freemium') {
      summary.freemium += transaction.amount;
    } else {
      if (transaction.amount > 0) {
        summary.refundsAdded += transaction.amount;
      } else {
        summary.refundsRemoved -= transaction.amount;
      }
      summary.cashRefunded -= Math.min(0, dollarAmount(transaction) ?? 0);
    }
  }
  const expected = expectedBalance(net, creditsUsed);
  return {
    ...summary,
    balance,
    creditsUsed,
    delta: balance - expected,
    expected,
  };
}

export interface CreditAdjustment {
  /** Signed credits: positive adds to the balance, negative removes. */
  amount: number;
  description: string;
  /** A second adjustment with the same key for the user is skipped. */
  idempotencyKey?: string;
  metadata?: { [key: string]: Json | undefined };
  /** Why the credits moved, stored as `metadata.reason`. */
  reason: string;
  /** Payment intent of the purchase that a cash refund reverses. */
  referenceId?: string | null;
  userId: string;
}

export interface AdjustmentResult {
  status: 'applied' | 'duplicate';
  transactionId: string;
}

/**
 * The one write path for script credit changes. It records a `refund` row,
 * the enum's only type for manual adjustments, then moves the balance by the
 * same amount. When the database rejects the balance change it deletes the
 * row, so the ledger never shows credits that did not move.
 */
export async function adjustCredits(
  supabase: ScriptSupabaseClient,
  adjustment: CreditAdjustment,
): Promise<AdjustmentResult> {
  const { amount, idempotencyKey, userId } = adjustment;
  if (!UUID_PATTERN.test(userId)) {
    throw new Error(`Invalid user ID: ${userId}`);
  }
  if (!Number.isSafeInteger(amount) || amount === 0) {
    throw new Error(`Credit adjustment must be a non-zero integer: ${amount}`);
  }

  if (idempotencyKey) {
    const { data, error } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'refund')
      .eq('metadata->>idempotencyKey', idempotencyKey)
      .limit(1);
    if (error) {
      throw new Error(`Failed to check earlier adjustments: ${error.message}`);
    }
    const existing = data?.[0];
    if (existing) {
      return { status: 'duplicate', transactionId: existing.id };
    }
  }

  const { data: row, error: insertError } = await supabase
    .from('credit_transactions')
    .insert({
      amount,
      description: adjustment.description,
      metadata: {
        ...adjustment.metadata,
        ...(idempotencyKey && { idempotencyKey }),
        reason: adjustment.reason,
      },
      reference_id: adjustment.referenceId ?? null,
      type: 'refund',
      user_id: userId,
    })
    .select('id')
    .single();
  if (insertError || !row) {
    throw new Error(
      `Failed to record the credit adjustment: ${insertError?.message ?? 'no row returned'}`,
    );
  }

  const { error: balanceError, status } =
    amount > 0
      ? await supabase.rpc('increment_user_credits', {
          credit_amount_var: amount,
          user_id_var: userId,
        })
      : await supabase.rpc('decrement_user_credits', {
          credit_amount_var: -amount,
          user_id_var: userId,
        });
  if (!balanceError) {
    return { status: 'applied', transactionId: row.id };
  }

  // Status 0 means no response arrived, so the balance may have moved.
  if (status === 0) {
    throw new Error(
      `Balance update outcome unknown (${balanceError.message}); ledger row ${row.id} was written. Check the balance before retrying.`,
    );
  }
  const { error: deleteError } = await supabase
    .from('credit_transactions')
    .delete()
    .eq('id', row.id);
  if (deleteError) {
    throw new Error(
      `Balance not changed (${balanceError.message}), and ledger row ${row.id} could not be removed (${deleteError.message}); delete it by hand.`,
    );
  }
  throw new Error(
    `Balance not changed (${balanceError.message}); the ledger row was removed.`,
  );
}

export interface PaymentRefund {
  chargeId?: string;
  /** Credits taken back; positive. */
  credits: number;
  /** Dollars returned; positive. */
  dollars: number;
  /** The purchase or top-up the money goes back for. */
  payment: Pick<CreditTransaction, 'created_at' | 'id' | 'reference_id'>;
  userId: string;
}

/**
 * Return cash for part of a payment: remove the credits and store the dollars
 * as a negative `metadata.dollarAmount`, which summarizeLedger counts as
 * cashRefunded and daily-stats subtracts from collections.
 */
export function refundPayment(
  supabase: ScriptSupabaseClient,
  { chargeId, credits, dollars, payment, userId }: PaymentRefund,
): Promise<AdjustmentResult> {
  if (!(credits > 0 && dollars > 0)) {
    throw new Error('A cash refund needs positive credits and dollars');
  }
  const paidOn = new Date(payment.created_at).toISOString().slice(0, 10);
  return adjustCredits(supabase, {
    amount: -credits,
    description: `Refund for transaction of ${paidOn} - $${dollars.toFixed(2)}`,
    metadata: {
      ...(chargeId && { chargeId }),
      dollarAmount: -dollars,
      originalTransactionId: payment.id,
      originalTransactionRefId: payment.reference_id,
    },
    reason: 'cash_refund',
    referenceId: payment.reference_id,
    userId,
  });
}
