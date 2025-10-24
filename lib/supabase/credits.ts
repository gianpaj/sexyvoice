import { nanoid } from 'nanoid';
import { createClient } from './server';

export type CreditTransactionType = 
  | 'purchase' 
  | 'usage' 
  | 'subscription_grant' 
  | 'bonus' 
  | 'refund' 
  | 'adjustment'
  | 'freemium'
  | 'topup';

export type CreditTransactionDirection = 'credit' | 'debit';

export interface CreditTransaction {
  id?: string;
  user_id: string;
  type: CreditTransactionType;
  amount: number;
  direction: CreditTransactionDirection;
  balance_after: number;
  reference_id?: string;
  reference_type?: string;
  subscription_id?: string;
  description: string;
  metadata?: any;
  idempotency_key?: string;
  created_by?: string;
}

/**
 * Get current balance for a user by computing from all transactions
 * This is the most accurate method but can be slower for users with many transactions
 */
export async function getCurrentBalance(userId: string): Promise<number> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('amount, direction')
    .eq('user_id', userId);

  if (error) throw error;

  const balance = data.reduce((total, transaction) => {
    return total + (transaction.direction === 'credit' ? transaction.amount : -transaction.amount);
  }, 0);

  return Math.max(0, balance); // Ensure balance never goes negative
}

/**
 * Get cached balance from materialized view (faster but might be slightly stale)
 */
export async function getCachedBalance(userId: string): Promise<number> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('user_credit_balances')
    .select('balance')
    .eq('user_id', userId)
    .single();

  if (error) {
    // If no cached balance exists, compute it directly
    if (error.code === 'PGRST116') {
      return await getCurrentBalance(userId);
    }
    throw error;
  }

  return Math.max(0, data.balance || 0);
}

/**
 * Add credits to a user's account (purchase, subscription, bonus, etc.)
 */
export async function addCredits({
  userId,
  amount,
  type = 'purchase',
  subscriptionId,
  referenceId,
  referenceType,
  description,
  metadata = {},
  idempotencyKey
}: {
  userId: string;
  amount: number;
  type?: CreditTransactionType;
  subscriptionId?: string;
  referenceId?: string;
  referenceType?: string;
  description: string;
  metadata?: any;
  idempotencyKey?: string;
}): Promise<CreditTransaction> {
  const supabase = await createClient();
  
  // Check idempotency
  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (existing) {
      console.log('Transaction already processed:', idempotencyKey);
      return existing;
    }
  }

  const currentBalance = await getCurrentBalance(userId);
  const newBalance = currentBalance + amount;
  const transactionId = `txn_${nanoid(12)}`;

  const transaction: CreditTransaction = {
    id: transactionId,
    user_id: userId,
    type,
    amount,
    direction: 'credit',
    balance_after: newBalance,
    subscription_id: subscriptionId,
    reference_id: referenceId,
    reference_type: referenceType || (type === 'purchase' ? 'stripe_payment' : 'system'),
    description,
    metadata,
    idempotency_key: idempotencyKey,
    created_by: 'system'
  };

  const { data, error } = await supabase
    .from('credit_transactions')
    .insert([transaction])
    .select()
    .single();

  if (error) throw error;

  // Optionally refresh materialized view (can be done async)
  // await supabase.rpc('refresh_user_credit_balances');

  return data;
}

/**
 * Deduct credits from a user's account (usage, refund reversal, etc.)
 */
export async function deductCredits({
  userId,
  amount,
  referenceId,
  referenceType,
  description,
  metadata = {},
  idempotencyKey
}: {
  userId: string;
  amount: number;
  referenceId?: string;
  referenceType?: string;
  description: string;
  metadata?: any;
  idempotencyKey?: string;
}): Promise<CreditTransaction> {
  const supabase = await createClient();

  // Check idempotency
  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (existing) {
      console.log('Transaction already processed:', idempotencyKey);
      return existing;
    }
  }

  const currentBalance = await getCurrentBalance(userId);

  if (currentBalance < amount) {
    throw new Error(`Insufficient credits. Have: ${currentBalance}, Need: ${amount}`);
  }

  const newBalance = currentBalance - amount;
  const transactionId = `txn_${nanoid(12)}`;

  const transaction: CreditTransaction = {
    id: transactionId,
    user_id: userId,
    type: 'usage',
    amount,
    direction: 'debit',
    balance_after: newBalance,
    reference_id: referenceId,
    reference_type: referenceType || 'audio_generation',
    description,
    metadata,
    idempotency_key: idempotencyKey,
    created_by: 'system'
  };

  const { data, error } = await supabase
    .from('credit_transactions')
    .insert([transaction])
    .select()
    .single();

  if (error) throw error;

  return data;
}

/**
 * Create a refund transaction (reverses a previous deduction)
 */
export async function refundTransaction(
  originalTransactionId: string,
  reason: string
): Promise<CreditTransaction> {
  const supabase = await createClient();

  // Get original transaction
  const { data: original, error: fetchError } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('id', originalTransactionId)
    .single();

  if (fetchError) throw fetchError;

  if (!original) {
    throw new Error(`Transaction not found: ${originalTransactionId}`);
  }

  // Create reverse transaction
  return await addCredits({
    userId: original.user_id,
    amount: original.amount,
    type: 'refund',
    referenceId: originalTransactionId,
    referenceType: 'refund',
    description: `Refund: ${reason}`,
    metadata: { original_transaction_id: originalTransactionId, reason },
    idempotencyKey: `refund_${originalTransactionId}`
  });
}

/**
 * Get user credit summary with breakdown
 */
export async function getUserCreditSummary(userId: string) {
  const supabase = await createClient();
  
  const balance = await getCurrentBalance(userId);

  const [totalEarnedResult, totalSpentResult, recentTransactions] = await Promise.all([
    // Total credits earned
    supabase
      .from('credit_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('direction', 'credit'),

    // Total credits spent  
    supabase
      .from('credit_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('direction', 'debit'),

    // Recent transactions
    supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)
  ]);

  const totalEarned = totalEarnedResult.data?.reduce((sum, t) => sum + t.amount, 0) || 0;
  const totalSpent = totalSpentResult.data?.reduce((sum, t) => sum + t.amount, 0) || 0;

  return {
    balance,
    total_earned: totalEarned,
    total_spent: totalSpent,
    recent_transactions: recentTransactions.data || []
  };
}

/**
 * Refresh the materialized view for better performance
 * Call this periodically or after batch operations
 */
export async function refreshCreditBalancesCache(): Promise<void> {
  const supabase = await createClient();
  
  const { error } = await supabase.rpc('refresh_materialized_view', {
    view_name: 'user_credit_balances'
  });

  if (error) {
    console.warn('Failed to refresh credit balances cache:', error);
  }
}