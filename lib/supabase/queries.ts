'use server';

import * as Sentry from '@sentry/nextjs';

import { createAdminClient } from './admin';
import {
  FREE_USER_CALL_LIMIT_SECONDS,
  MAX_FREE_GENERATIONS,
} from './constants';
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
    // .eq('is_public', true)
    .order('sort_order');
  if (error) throw error;
  return data;
}

// ─── Characters ───

/**
 * Get public (predefined) call characters for SSR.
 * Joins with voices to get voice name + sample_url.
 * Does NOT include prompt text — predefined prompts never reach the client.
 */
export async function getPublicCallCharacters() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('characters')
    .select(
      `
      id, name, localized_descriptions, image, session_config, sort_order, is_public,
      voice_id,
      voices ( name, sample_url ),
      prompt_id,
      prompts ( type )
    `,
    )
    // NOTE: prompt TEXT intentionally not selected — predefined prompt content never sent to client.
    // Only prompt metadata (type) is joined. Public prompts are readable via RLS (is_public=true).
    .eq('is_public', true)
    .order('sort_order');
  if (error) throw error;
  return data;
}

/**
 * Get user's custom call characters for SSR.
 * Joins with prompts (to get editable prompt text) and voices.
 */
export async function getUserCallCharacters(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('characters')
    .select(
      `
      id, name, localized_descriptions, image, session_config, sort_order, is_public,
      voice_id,
      voices ( name, sample_url ),
      prompt_id,
      prompts ( prompt, localized_prompts )
    `,
    )
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

// ─── Prompts (admin — for call-token resolution) ───

/**
 * Fetch full character details by character ID, including voice and prompt relations.
 * Uses admin client to bypass RLS (reads character configuration and prompt text server-side).
 */
export async function fetchCharacterDetails(characterId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('characters')
    .select(
      `
      id, is_public, user_id, voice_id,
      voices ( id, name ),
      prompts ( prompt, localized_prompts )
    `,
    )
    .eq('id', characterId)
    .single();
  if (error) throw error;
  return data;
}

export interface InsertUsageEventParams {
  userId: string;
  sourceType: UsageSourceType;
  sourceId?: string | null;
  unit: UsageUnitType;
  quantity: number;
  creditsUsed: number;
  metadata?: Json;
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

export async function getVoiceIdByName(
  voiceName: string,
  isPublic = true,
): Promise<{ id: string; name: string; language: string; model: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('voices')
    .select('id, name, language, model')
    .eq('name', voiceName)
    .eq('is_public', isPublic)
    .single();

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
    user_id_var: userId,
    credit_amount_var: Math.abs(amount),
  });

  if (creditsError) throw creditsError;
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
      user_id: userId,
      storage_key: filename,
      text_content: text,
      url,
      model,
      prediction_id: predictionId,
      is_public: isPublic,
      voice_id: voiceId,
      duration: Number.parseFloat(duration),
      credits_used,
      usage,
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
        user_id: params.userId,
        source_type: params.sourceType,
        source_id: params.sourceId ?? null,
        unit: params.unit,
        quantity: params.quantity,
        credits_used: params.creditsUsed,
        metadata: (params.metadata ?? {}) as Json,
      })
      .select('id')
      .single();

    if (error) {
      Sentry.captureException(error, {
        extra: {
          params,
          context: 'insertUsageEvent',
        },
      });
      console.error('Failed to insert usage event:', error);
      return null;
    }

    return data?.id ?? null;
  } catch (error) {
    Sentry.captureException(error, {
      extra: {
        params,
        context: 'insertUsageEvent',
      },
    });
    console.error('Failed to insert usage event:', error);
    return null;
  }
};

export const getUserById = async (userId: string) => {
  const supabase = await createClient();

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  return data;
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

export const insertSubscriptionCreditTransaction = async (
  userId: string,
  paymentIntentId: string,
  subscriptionId: string,
  creditAmount: number,
  dollarAmount: number,
) => {
  const supabase = createAdminClient();

  try {
    // Check if transaction already exists using reference_id (payment_intent)
    // This prevents duplicate credits when multiple webhook events fire
    const { data } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('reference_id', paymentIntentId)
      .single();

    if (data) {
      console.log('Subscription transaction already exists', {
        userId,
        paymentIntentId,
        subscriptionId,
        data,
      });
      return;
    }
  } catch (_error) {
    // Transaction doesn't exist, continue with insertion
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
    user_id: userId,
    reference_id: paymentIntentId,
    subscription_id: subscriptionId,
    amount: creditAmount,
    type: 'purchase',
    description: `Subscription payment - $${dollarAmount}`,
    metadata: {
      dollarAmount,
      isFirstSubscription,
      // Figure out how to send promo metadata with a Stripe pricing table
      // ...(promo && { promo }),
    },
  });

  if (error) {
    console.error('Error inserting subscription transaction:', {
      userId,
      subscriptionId,
      paymentIntentId,
      error: error.message,
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

  try {
    // Check if transaction already exists to prevent duplicates
    const { data } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('reference_id', paymentIntentId)
      .single();

    if (data) {
      console.log('Topup transaction already exists', {
        userId,
        paymentIntentId,
        data,
      });
      return;
    }
  } catch (_error) {
    // Transaction doesn't exist, continue with insertion
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
    user_id: userId,
    amount: creditAmount,
    type: 'topup',
    description: `Credit top-up - $${dollarAmount}`,
    reference_id: paymentIntentId,
    metadata: {
      packageId,
      dollarAmount,
      isFirstTopup,
      ...(promo && { promo }),
    },
  });

  if (error) throw error;

  // Update user's credit balance using the database function
  await updateUserCredits(userId, creditAmount);
};

const updateUserCredits = async (userId: string, creditAmount: number) => {
  const supabase = createAdminClient();

  const { error } = await supabase.rpc('increment_user_credits', {
    user_id_var: userId,
    credit_amount_var: creditAmount,
  });

  if (error) throw error;
};

export const getPaidTransactions = async (userId: string) => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .in('type', ['purchase', 'topup'])
    .order('created_at', { ascending: false });
  if (error) throw error;

  return data;
};

export const hasUserPaid = async (userId: string): Promise<boolean> => {
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
};

/**
 * Get the total call duration in seconds for a user.
 * This sums up all duration_seconds from their call_sessions.
 */
export const getTotalCallDurationSeconds = async (
  userId: string,
): Promise<number> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('call_sessions')
    .select('duration_seconds')
    .eq('user_id', userId);

  if (error) {
    Sentry.captureException(error, {
      extra: { userId, context: 'getTotalCallDurationSeconds' },
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

export const isFreemiumUserOverLimit = async (
  userId: string,
): Promise<boolean> => {
  const supabase = await createClient();
  // TODO: use redis instead
  // If the user is a freemium user, count their voice model 'gpro' audio files.
  const { data: audioFiles, error: audioFilesError } = await supabase
    .from('audio_files')
    .select('id, voices(model)')
    .eq('user_id', userId);

  if (audioFilesError) {
    throw audioFilesError;
  }

  const gproAudioCount = audioFiles.filter(
    (file) => file.voices?.model === 'gpro',
  ).length;

  return (gproAudioCount ?? 0) > MAX_FREE_GENERATIONS;
};
