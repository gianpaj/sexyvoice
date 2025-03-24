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
