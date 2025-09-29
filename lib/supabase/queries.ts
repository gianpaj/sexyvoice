import { createClient } from './server';
import { getCurrentBalance } from './credits';

const MAX_FREE_GENERATIONS = 6;

export async function getCredits(userId: string): Promise<number> {
  // Use new event-sourced balance calculation
  return await getCurrentBalance(userId);
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

// DEPRECATED: Use deductCredits from './credits' instead
// Kept for backward compatibility during migration
export async function reduceCredits({
  userId,
  currentAmount,
  amount,
}: {
  userId: string;
  currentAmount: number;
  amount: number;
}) {
  // This function is deprecated - credits are now managed via transactions
  // The actual deduction should be done via deductCredits() in the new system
  console.warn('reduceCredits() is deprecated. Use deductCredits() from ./credits instead.');
  
  // For now, we'll skip the direct balance update since transactions handle it
  // This prevents double-deduction during the migration period
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
  estimated_credits,
  status = 'completed',
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
  estimated_credits?: number;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}) {
  const supabase = await createClient();

  return supabase.from('audio_files').insert({
    user_id: userId,
    storage_key: filename,
    text_content: text,
    url: url,
    model: model,
    prediction_id: predictionId,
    is_public: isPublic,
    voice_id: voiceId,
    duration: Number.parseFloat(duration),
    credits_used,
    estimated_credits: estimated_credits || credits_used,
    status,
  });
}

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

export const insertCreditTransaction = async (
  userId: string,
  subscriptionId: string,
  amount: number,
  subAmount: number,
) => {
  // Use new addCredits function for proper event-sourced approach
  const { addCredits } = await import('./credits');
  
  return await addCredits({
    userId,
    amount,
    type: 'subscription_grant',
    subscriptionId,
    referenceId: subscriptionId,
    referenceType: 'subscription',
    description: `${subAmount} USD subscription`,
    metadata: { dollarAmount: subAmount },
    idempotencyKey: `sub_${subscriptionId}_${userId}`
  });
};

export const insertTopupTransaction = async (
  userId: string,
  paymentIntentId: string,
  amount: number,
  dollarAmount: number,
  priceId: string,
) => {
  // Use new addCredits function for proper event-sourced approach
  const { addCredits } = await import('./credits');
  
  return await addCredits({
    userId,
    amount,
    type: 'topup',
    referenceId: paymentIntentId,
    referenceType: 'stripe_payment',
    description: `Credit top-up - $${dollarAmount}`,
    metadata: { priceId, dollarAmount },
    idempotencyKey: `topup_${paymentIntentId}`
  });
};

// DEPRECATED: Credits are now managed via transactions
// Kept for backward compatibility during migration
export const updateUserCredits = async (
  userId: string,
  creditAmount: number,
) => {
  console.warn('updateUserCredits() is deprecated. Credits are now managed via event-sourced transactions.');
  // In the new system, credits are automatically calculated from transactions
  // No direct balance updates needed
};

export const isFreemiumUserOverLimit = async (
  userId: string,
): Promise<boolean> => {
  const supabase = await createClient();

  // First, check if the user has only a 'freemium' credit transaction
  const { data: allTransactions, error: freemiumError } = await supabase
    .from('credit_transactions')
    .select('type')
    .eq('user_id', userId);

  // Check if user has only freemium transactions
  const hasOnlyFreemium = (allTransactions?.length ?? 0) > 0 &&
    allTransactions?.every(transaction => transaction.type === 'freemium');

  if (freemiumError) {
    // For "No rows found", it's not an error, just not a freemium user.
    if (freemiumError.code === 'PGRST116') {
      return false;
    }
    throw freemiumError;
  }

  if (!hasOnlyFreemium) {
    // If the user is not a freemium user, they are not over the limit.
    return false;
  }

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

  return (gproAudioCount ?? 0) >= MAX_FREE_GENERATIONS;
};
