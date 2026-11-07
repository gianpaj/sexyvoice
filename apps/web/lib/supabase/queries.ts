import { captureException } from '@sentry/nextjs';
import { cache } from 'react';

import {
  CALL_CHARACTER_COLUMNS,
  OWN_CHARACTER_COLUMNS,
  PUBLIC_CHARACTER_COLUMNS,
} from '@/lib/calls/characters';
import { RETIRED_TTS_MODELS_FILTER } from '@/lib/tts/models';
import { SUBSCRIPTION_BONUS_MULTIPLIER } from '../stripe/pricing';
import { createAdminClient } from './admin';
import { FREE_USER_CALL_LIMIT_SECONDS } from './constants';
import { createClient } from './server';

// Types for usage event tracking
type UsageSourceType = Database['public']['Enums']['usage_source_type'];
type UsageUnitType = Database['public']['Enums']['usage_unit_type'];

// ─── Voices ───

/** Get call voices (feature = 'call') for SSR */
export async function getCallVoices() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('voices')
    .select(
      'id, name, type, description, sample_url, feature, model, language, sort_order',
    )
    .eq('feature', 'call')
    .eq('is_public', true)
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return data;
}

// ─── Characters ───

/** Predefined call characters for SSR. Their prompt text stays on the server. */
export async function getPublicCallCharacters() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('characters')
    .select(PUBLIC_CHARACTER_COLUMNS)
    .eq('is_public', true)
    .order('sort_order');
  if (error) throw error;
  return data;
}

/** A user's custom call characters for SSR, with their editable prompts. */
export async function getUserCallCharacters(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('characters')
    .select(OWN_CHARACTER_COLUMNS)
    .eq('is_public', false)
    .eq('user_id', userId)
    .order('sort_order');
  if (error) throw error;
  return data;
}

/** Count user's custom call characters (for 10-limit check) */
export async function countUserCallCharacters(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('characters')
    .select('id', { count: 'exact', head: true })
    .eq('is_public', false)
    .eq('user_id', userId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * A character and its prompts for call-token. The admin client reads
 * predefined prompt text, which never leaves the server.
 */
export async function getCallCharacter(characterId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('characters')
    .select(CALL_CHARACTER_COLUMNS)
    .eq('id', characterId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

interface InsertUsageEventParams {
  apiKeyId?: string | null;
  creditsUsed: number;
  dollarAmount?: number | null;
  durationSeconds?: number | null;
  inputChars?: number | null;
  metadata?: Json;
  model?: string | null;
  outputChars?: number | null;
  quantity: number;
  requestId?: string | null;
  sourceId?: string | null;
  sourceType: UsageSourceType;
  unit: UsageUnitType;
  userId: string;
}

export async function getCredits(userId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('credits')
    .select('amount')
    .eq('user_id', userId)
    .single();

  if (error) throw error;

  return data.amount;
}

export const INSUFFICIENT_CREDITS_ERROR_CODE = 'INSUFFICIENT_CREDITS';

interface CreditErrorLike {
  cause?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  message?: unknown;
}

export function isInsufficientCreditsError(error: unknown): boolean {
  if (
    error instanceof Error &&
    error.cause === INSUFFICIENT_CREDITS_ERROR_CODE
  ) {
    return true;
  }

  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const maybeError = error as CreditErrorLike;
  const errorContext = [
    maybeError.message,
    maybeError.details,
    maybeError.hint,
    maybeError.code,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');

  return /insufficient credits/i.test(errorContext);
}

function toCreditDebitError(error: unknown): unknown {
  if (!isInsufficientCreditsError(error)) {
    return error;
  }

  return new Error('Insufficient credits', {
    cause: INSUFFICIENT_CREDITS_ERROR_CODE,
  });
}

/** Scope name lookups by model; equal timestamps are ordered by ID. */
export async function getVoiceIdByName(
  voiceName: string,
  isPublic = true,
  models?: readonly string[],
): Promise<Pick<
  Tables<'voices'>,
  'id' | 'name' | 'language' | 'model'
> | null> {
  const supabase = await createClient();
  let query = supabase
    .from('voices')
    .select('id, name, language, model')
    .not('model', 'in', RETIRED_TTS_MODELS_FILTER)
    .eq('name', voiceName)
    .eq('is_public', isPublic);
  if (models) query = query.in('model', [...models]);
  const { data, error } = await query
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data;
}

export async function getVoiceById(
  voiceId: string,
): Promise<Pick<
  Tables<'voices'>,
  'id' | 'name' | 'language' | 'model'
> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('voices')
    .select('id, name, language, model')
    .not('model', 'in', RETIRED_TTS_MODELS_FILTER)
    .eq('id', voiceId)
    .eq('is_public', true)
    .maybeSingle();

  if (error) throw error;

  return data;
}

export async function reduceCredits({
  userId,
  amount,
}: {
  userId: string;
  amount: number;
}) {
  const supabase = await createClient();

  // Decrement user credits by the specified amount using an RPC call
  const { error: creditsError } = await supabase.rpc('decrement_user_credits', {
    credit_amount_var: Math.abs(amount),
    user_id_var: userId,
  });

  if (creditsError) throw toCreditDebitError(creditsError);
}

export async function reduceCreditsUpTo({
  userId,
  amount,
}: {
  userId: string;
  amount: number;
}): Promise<number> {
  const creditAmount = Math.abs(amount);
  if (creditAmount === 0) {
    return 0;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('decrement_user_credits_up_to', {
    credit_amount_var: creditAmount,
    user_id_var: userId,
  });

  if (error) throw toCreditDebitError(error);

  return data ?? 0;
}

export async function restoreCredits({
  userId,
  amount,
}: {
  userId: string;
  amount: number;
}) {
  const creditAmount = Math.abs(amount);
  if (creditAmount === 0) {
    return;
  }

  await updateUserCredits(userId, creditAmount);
}

export async function saveAudioFile({
  userId,
  filename,
  text,
  url,
  model,
  predictionId,
  isPublic,
  voiceId,
  duration,
  credits_used,
  usage,
}: {
  userId: string;
  filename: string;
  text: string;
  url: string;
  model: string;
  predictionId?: string;
  isPublic: boolean;
  voiceId: string;
  duration: string;
  credits_used: number;
  usage?: Record<string, string | number | boolean>;
}) {
  const supabase = await createClient();

  return supabase
    .from('audio_files')
    .insert({
      credits_used,
      duration: Number.parseFloat(duration),
      is_public: isPublic,
      model,
      prediction_id: predictionId,
      storage_key: filename,
      text_content: text,
      url,
      usage,
      user_id: userId,
      voice_id: voiceId,
    })
    .select('id')
    .single();
}

/**
 * Insert a usage event record for tracking credit consumption.
 *
 * Design Decision: Usage tracking is non-blocking. If this function fails,
 * it logs the error to Sentry but doesn't throw. This ensures that
 * billing/tracking issues don't prevent users from using the service.
 *
 * @returns The inserted usage event ID, or null on failure
 */
export const insertUsageEvent = async (
  params: InsertUsageEventParams,
): Promise<string | null> => {
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from('usage_events')
      .insert({
        api_key_id: params.apiKeyId ?? null,
        credits_used: params.creditsUsed,
        dollar_amount: params.dollarAmount ?? null,
        duration_seconds: params.durationSeconds ?? null,
        input_chars: params.inputChars ?? null,
        metadata: (params.metadata ?? {}) as Json,
        model: params.model ?? null,
        output_chars: params.outputChars ?? null,
        quantity: params.quantity,
        request_id: params.requestId ?? null,
        source_id: params.sourceId ?? null,
        source_type: params.sourceType,
        unit: params.unit,
        user_id: params.userId,
      })
      .select('id')
      .single();

    if (error) {
      captureException(error, {
        extra: {
          context: 'insertUsageEvent',
          params,
        },
      });
      console.error('Failed to insert usage event:', error);
      return null;
    }

    return data?.id ?? null;
  } catch (error) {
    captureException(error, {
      extra: {
        context: 'insertUsageEvent',
        params,
      },
    });
    console.error('Failed to insert usage event:', error);
    return null;
  }
};

export const getUserById = async (userId: string) => {
  const { data } = await getUserByIdWithError(userId);

  return data;
};

export const getUserByIdWithError = async (userId: string) => {
  const supabase = await createClient();

  return supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
};

export const getUserIdByStripeCustomerId = async (customerId: string) => {
  const supabase = await createClient();

  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_id', customerId)
    .single();

  return data?.id;
};

export const getUserByStripeCustomerId = async (customerId: string) => {
  const supabase = await createClient();

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('stripe_id', customerId)
    .single();
  return data;
};

/**
 * Non-blocking duplicate-credit guard. Lookup failures are logged and treated
 * as "no prior credit" because `unique_reference_topup_idx` and
 * `unique_reference_purchase_idx` reject duplicate inserts (see
 * `isCreditTransactionReferenceConflict`).
 */
const findCreditTransactionByReference = async (
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  referenceId: string,
) => {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('reference_id', referenceId)
    .maybeSingle();

  if (error) {
    console.error('Error checking existing credit transaction:', {
      error: error.message,
      referenceId,
      userId,
    });
    return null;
  }

  return data;
};

export const insertSubscriptionCreditTransaction = async (
  userId: string,
  paymentIntentId: string,
  subscriptionId: string,
  creditAmount: number,
  dollarAmount: number,
) => {
  const supabase = createAdminClient();

  // Check if transaction already exists using reference_id (payment_intent)
  // This prevents duplicate credits when multiple webhook events fire
  const existing = await findCreditTransactionByReference(
    supabase,
    userId,
    paymentIntentId,
  );

  if (existing) {
    console.log('Subscription transaction already exists', {
      data: existing,
      paymentIntentId,
      subscriptionId,
      userId,
    });
    return;
  }

  // Check if this is the user's first subscription transaction
  const { data: existingSubscriptions } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'purchase')
    .limit(1);

  const isFirstSubscription =
    !existingSubscriptions || existingSubscriptions.length === 0;

  // Insert the transaction with reference_id (payment_intent)
  const { error } = await supabase.from('credit_transactions').insert({
    amount: creditAmount,
    description: `Subscription payment - $${dollarAmount} (includes ${Math.round((SUBSCRIPTION_BONUS_MULTIPLIER - 1) * 100)}% bonus)`,
    metadata: {
      dollarAmount,
      isFirstSubscription,
    },
    reference_id: paymentIntentId,
    subscription_id: subscriptionId,
    type: 'purchase',
    user_id: userId,
  });

  if (error) {
    if (isCreditTransactionReferenceConflict(error)) {
      console.log('Subscription transaction already exists', {
        paymentIntentId,
        subscriptionId,
        userId,
      });
      return;
    }

    console.error('Error inserting subscription transaction:', {
      error: error.message,
      paymentIntentId,
      subscriptionId,
      userId,
    });
    throw error;
  }

  // Update user's credit balance using the database function
  await updateUserCredits(userId, creditAmount);
};

export const insertTopupCreditTransaction = async (
  userId: string,
  paymentIntentId: string,
  creditAmount: number,
  dollarAmount: number,
  packageId: string,
  promo?: string | null,
) => {
  const supabase = createAdminClient();

  // Check if transaction already exists to prevent duplicates
  const existing = await findCreditTransactionByReference(
    supabase,
    userId,
    paymentIntentId,
  );

  if (existing) {
    console.log('Topup transaction already exists', {
      data: existing,
      paymentIntentId,
      userId,
    });
    return;
  }

  // Check if this is the user's first transaction (topup)
  const { data: existingTopup } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'topup')
    .limit(1);

  const isFirstTopup = !existingTopup || existingTopup.length === 0;

  // Insert the transaction
  const { error } = await supabase.from('credit_transactions').insert({
    amount: creditAmount,
    description: `Credit top-up - $${dollarAmount}`,
    metadata: {
      dollarAmount,
      isFirstTopup,
      packageId,
      ...(promo && { promo }),
    },
    reference_id: paymentIntentId,
    type: 'topup',
    user_id: userId,
  });

  if (error) {
    if (isCreditTransactionReferenceConflict(error)) {
      console.log('Topup transaction already exists', {
        paymentIntentId,
        userId,
      });
      return;
    }

    throw error;
  }

  // Update user's credit balance using the database function
  await updateUserCredits(userId, creditAmount);
};

export const isCreditTransactionReferenceConflict = (error: {
  code?: string;
  details?: string;
  message?: string;
}): boolean => {
  const conflictContext = `${error.message ?? ''} ${error.details ?? ''}`;

  return (
    error.code === '23505' &&
    /unique_reference|reference_id/i.test(conflictContext)
  );
};

const updateUserCredits = async (userId: string, creditAmount: number) => {
  const supabase = createAdminClient();

  const { error } = await supabase.rpc('increment_user_credits', {
    credit_amount_var: creditAmount,
    user_id_var: userId,
  });

  if (error) throw error;
};

// Deduplicated per server request: the dashboard layout and its pages both
// check paid status.
export const hasUserPaid = cache(async (userId: string): Promise<boolean> => {
  const supabase = await createClient();
  // Check if the user has any non-freemium credit transactions.
  const { data: nonFreemiumTransactions, error: nonFreemiumError } =
    await supabase
      .from('credit_transactions')
      .select('type')
      .eq('user_id', userId)
      .in('type', ['purchase', 'topup']);

  if (nonFreemiumError) {
    throw nonFreemiumError;
  }

  // Return true if there is at least one non-freemium (i.e., purchase) transaction.
  return (nonFreemiumTransactions?.length ?? 0) > 0;
});

// Deduplicated per server request: the dashboard layout and the Generate,
// Clone, and Call pages all sum these amounts for the credits widget.
export const getCreditTransactionAmounts = cache(
  async (
    userId: string,
  ): Promise<Pick<Tables<'credit_transactions'>, 'amount'>[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('credit_transactions')
      .select('amount')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    return data;
  },
);

/**
 * Get the total call duration in seconds for a user.
 * This sums up all duration_seconds from their call_sessions.
 */
const getTotalCallDurationSeconds = async (userId: string): Promise<number> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('call_sessions')
    .select('duration_seconds')
    .eq('user_id', userId);

  if (error) {
    captureException(error, {
      extra: { context: 'getTotalCallDurationSeconds', userId },
    });
    throw error;
  }

  const totalSeconds = data.reduce(
    (sum, session) => sum + (session.duration_seconds ?? 0),
    0,
  );

  return totalSeconds;
};

/**
 * Check if a free user has exceeded the call limit (5 minutes).
 * Returns true if the user is a free user AND has exceeded the limit.
 */
export const isFreeUserOverCallLimit = async (
  userId: string,
): Promise<boolean> => {
  const hasPaid = await hasUserPaid(userId);

  if (hasPaid) {
    return false;
  }

  const totalDuration = await getTotalCallDurationSeconds(userId);
  return totalDuration >= FREE_USER_CALL_LIMIT_SECONDS;
};

// ─── Admin variants for external API routes ───
// These bypass RLS using the service role key. Use only in server-side
// API routes where the userId is resolved from a trusted API key, not a
// session cookie.

export async function getCreditsAdmin(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('credits')
    .select('amount')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  return data?.amount ?? 0;
}

/** Admin variant of {@link getVoiceIdByName}; same model scoping rules. */
export async function getVoiceIdByNameAdmin(
  voiceName: string,
  isPublic = true,
  models?: readonly string[],
): Promise<Pick<
  Tables<'voices'>,
  'id' | 'name' | 'language' | 'model'
> | null> {
  const admin = createAdminClient();
  let query = admin
    .from('voices')
    .select('id, name, language, model')
    .not('model', 'in', RETIRED_TTS_MODELS_FILTER)
    .eq('name', voiceName)
    .eq('is_public', isPublic);
  if (models) query = query.in('model', [...models]);
  const { data, error } = await query
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data;
}

export async function getVoiceByIdAdmin(
  voiceId: string,
  isPublic = true,
): Promise<Pick<
  Tables<'voices'>,
  'id' | 'name' | 'language' | 'model'
> | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('voices')
    .select('id, name, language, model')
    .not('model', 'in', RETIRED_TTS_MODELS_FILTER)
    .eq('id', voiceId)
    .eq('feature', 'tts')
    .eq('is_public', isPublic)
    .maybeSingle();

  if (error) throw error;

  return data;
}

export async function reduceCreditsAdmin({
  userId,
  amount,
}: {
  userId: string;
  amount: number;
}) {
  const admin = createAdminClient();
  const { error } = await admin.rpc('decrement_user_credits', {
    credit_amount_var: Math.abs(amount),
    user_id_var: userId,
  });

  if (error) throw toCreditDebitError(error);
}

export async function reduceCreditsUpToAdmin({
  userId,
  amount,
}: {
  userId: string;
  amount: number;
}): Promise<number> {
  const creditAmount = Math.abs(amount);
  if (creditAmount === 0) {
    return 0;
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('decrement_user_credits_up_to', {
    credit_amount_var: creditAmount,
    user_id_var: userId,
  });

  if (error) throw toCreditDebitError(error);

  return data ?? 0;
}

// biome-ignore lint/suspicious/useAwait: server action
export async function saveAudioFileAdmin(params: {
  userId: string;
  filename: string;
  text: string;
  url: string;
  model: string;
  predictionId?: string;
  isPublic: boolean;
  voiceId: string;
  duration: string;
  credits_used: number;
  usage?: Record<string, string | number | boolean>;
}) {
  const admin = createAdminClient();
  return admin
    .from('audio_files')
    .insert({
      credits_used: params.credits_used,
      duration: Number.parseFloat(params.duration),
      is_public: params.isPublic,
      model: params.model,
      prediction_id: params.predictionId,
      storage_key: params.filename,
      text_content: params.text,
      url: params.url,
      usage: params.usage,
      user_id: params.userId,
      voice_id: params.voiceId,
    })
    .select('id')
    .single();
}

export async function hasUserPaidAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('credit_transactions')
    .select('type')
    .eq('user_id', userId)
    .in('type', ['purchase', 'topup']);

  if (error) throw error;

  return (data?.length ?? 0) > 0;
}
