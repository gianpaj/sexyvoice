-- Create or replace function to safely increment user credits
CREATE OR REPLACE FUNCTION increment_user_credits(user_id UUID, credit_amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Insert or update the credits table
  INSERT INTO public.credits (user_id, amount, created_at, updated_at)
  VALUES (user_id, credit_amount, NOW(), NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    amount = public.credits.amount + credit_amount,
    updated_at = NOW();
END;
$$;
-- Create or replace function to safely decrement user credits
CREATE OR REPLACE FUNCTION decrement_user_credits(user_id UUID, credit_amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Update the credits table, ensuring amount doesn't go below 0
  UPDATE public.credits
  SET
    amount = GREATEST(0, amount - credit_amount),
    updated_at = NOW()
  WHERE user_id = decrement_user_credits.user_id;

  -- If no row exists, create one with 0 credits (in case of edge case)
  INSERT INTO public.credits (user_id, amount, created_at, updated_at)
  SELECT decrement_user_credits.user_id, 0, NOW(), NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.credits WHERE user_id = decrement_user_credits.user_id
  );
END;
$$;
