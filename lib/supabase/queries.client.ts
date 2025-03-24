import { createClient } from './client';

export async function addInitialCredits(userId: string): Promise<void> {
  const supabase = createClient();

  const INITIAL_CREDITS = 10_000;
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
