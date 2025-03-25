import { createClient } from './server';

const INITIAL_CREDITS = 10_000;

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

export async function addInitialCredits(userId: string): Promise<void> {
  const supabase = await createClient();

  try {
    const res1 = await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: INITIAL_CREDITS,
      type: 'freemium',
      description: 'Initial user credits',
      created_at: new Date().toISOString(),
    });
    // REFACTOR: no need for separate credits table
    const res2 = await supabase
      .from('credits')
      .insert({ user_id: userId, amount: INITIAL_CREDITS });

    if (res1.error || res2.error) {
      console.error(res1.error || res2.error);

      throw new Error(
        res1.error?.message || res2.error?.message || 'Error creating account',
      );
    }
  } catch (error) {
    console.error('Error adding initial credits:', error);
  }
}

export async function getVoiceIdByName(
  voiceName: string,
  isPublic = true,
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('voices')
    .select('id, name, language')
    .eq('name', voiceName)
    .eq('is_public', isPublic)
    .limit(1);

  if (error) throw error;

  return data?.[0]?.id;
}

export async function reduceCredits({
  userId,
  currentAmount,
  amount,
}: { userId: string; currentAmount: number; amount: number }) {
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
    duration: duration,
    // credits_used: estimate,
  });
}
