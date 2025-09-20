import { createClient } from './server';

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
  currentAmount,
  amount,
}: {
  userId: string;
  currentAmount: number;
  amount: number;
}) {
  const supabase = await createClient();

  const newAmount = (currentAmount || 0) - amount;

  const { error: updateError } = await supabase
    .from('credits')
    .update({ amount: newAmount })
    .eq('user_id', userId);

  if (updateError) throw updateError;
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
  const supabase = await createClient();

  // Check for existing transaction first
  const { data: existingTransaction, error: selectError } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('subscription_id', subscriptionId)
    // .eq('type', 'purchase')
    .single();

  // If SELECT failed for reasons other than "no rows", throw the error
  if (selectError && selectError.code !== 'PGRST116') {
    console.error('Error checking for existing transaction:', selectError);
    throw selectError;
  }

  // If transaction already exists, log and return early
  if (existingTransaction) {
    console.warn('Transaction already exists', {
      userId,
      subscriptionId,
      data: existingTransaction,
    });
    return;
  }

  // Transaction doesn't exist, proceed with insertion
  try {
    const description = `Subscription payment - ${subAmount}`;
    const { error: insertError } = await supabase
      .from('credit_transactions')
      .insert({
        user_id: userId,
        subscription_id: subscriptionId,
        amount,
        type: 'purchase',
        description,
        metadata: { priceId: 'subscription', dollarAmount: subAmount },
      });

    if (insertError) {
      // Check if it's a unique constraint violation (race condition)
      if (insertError.code === '23505') {
        console.warn(
          'Transaction already inserted by another process (race condition)',
          {
            userId,
            subscriptionId,
            error: insertError.message,
          },
        );
        return; // Don't throw error, just return as this is expected in race conditions
      }
      throw insertError;
    }

    // Successfully inserted, now update user credits
    await updateUserCredits(userId, amount);
  } catch (error) {
    console.error('Error inserting credit transaction:', error);
    throw error;
  }
};

export const insertTopupTransaction = async (
  userId: string,
  paymentIntentId: string,
  amount: number,
  dollarAmount: number,
  priceId: string,
) => {
  const supabase = await createClient();

  // Check for existing transaction first
  const { data: existingTransaction, error: selectError } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('reference_id', paymentIntentId)
    // .eq('type', 'topup')
    .single();

  // If SELECT failed for reasons other than "no rows", throw the error
  if (selectError && selectError.code !== 'PGRST116') {
    console.error(
      'Error checking for existing topup transaction:',
      selectError,
    );
    throw selectError;
  }

  // If transaction already exists, log and return early
  if (existingTransaction) {
    console.warn('Topup transaction already exists', {
      userId,
      paymentIntentId,
      data: existingTransaction,
    });
    return;
  }

  // Transaction doesn't exist, proceed with insertion
  try {
    const { error: insertError } = await supabase
      .from('credit_transactions')
      .insert({
        user_id: userId,
        amount: amount,
        type: 'topup',
        description: `Credit top-up - $${dollarAmount}`,
        reference_id: paymentIntentId,
        metadata: { priceId, dollarAmount },
      });

    if (insertError) {
      // Check if it's a unique constraint violation (race condition)
      if (insertError.code === '23505') {
        console.error(
          'Topup transaction already inserted by another process (race condition)',
          {
            userId,
            paymentIntentId,
            error: insertError.message,
          },
        );
        return; // Don't throw error, just return as this is expected in race conditions
      }
      throw insertError;
    }

    // Successfully inserted, now update user credits
    await updateUserCredits(userId, amount);
  } catch (error) {
    console.error('Error inserting topup transaction:', error);
    throw error;
  }
};

export const updateUserCredits = async (
  userId: string,
  creditAmount: number,
) => {
  const supabase = await createClient();

  const { error } = await supabase.rpc('increment_user_credits', {
    user_id_var: userId,
    credit_amount: creditAmount,
  });

  if (error) throw error;
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

  // The limit is 4 generations.
  const gproAudioCount = audioFiles.filter(
    (file) => file.voices?.model === 'gpro',
  ).length;

  // The limit is 2 generations. If the user already has 2 or more, they are over the limit.
  return (gproAudioCount ?? 0) >= 4;
};
