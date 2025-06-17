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

export async function increaseCredits({
  userId,
  currentAmount,
  amount,
}: {
  userId: string;
  currentAmount: number;
  amount: number;
}) {
  const supabase = await createClient();

  const newAmount = (currentAmount || 0) + amount;

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

  return await supabase.from('audio_files').insert({
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

  try {
    const { data } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('subscription_id', subscriptionId)
      .single();

    if (data) {
      console.log('Transaction already exists', {
        userId,
        subscriptionId,
        data,
      });
    } else {
      await supabase.from('credit_transactions').insert({
        user_id: userId,
        subscription_id: subscriptionId,
        amount,
        type: 'purchase',
        description: `${subAmount} USD subscription`,
      });
      const currentAmount = await getCredits(userId);
      await increaseCredits({
        userId,
        currentAmount,
        amount,
      });
    }
  } catch (_error) {
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      subscription_id: subscriptionId,
      amount,
      type: 'purchase',
      description: `${subAmount} USD subscription`,
    });
    const currentAmount = await getCredits(userId);
    await increaseCredits({
      userId,
      currentAmount,
      amount,
    });
  }
};
