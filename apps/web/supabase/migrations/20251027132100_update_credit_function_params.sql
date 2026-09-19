-- Migration: Update credit function parameter names to match production
-- This updates the parameter names to user_id_var and credit_amount_var to match the cloud database

-- Drop and recreate increment_user_credits function with new parameter names
DROP FUNCTION IF EXISTS public.increment_user_credits(uuid, integer);
CREATE OR REPLACE FUNCTION public.increment_user_credits(user_id_var UUID, credit_amount_var INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Insert or update the credits table
  INSERT INTO public.credits (user_id, amount, created_at, updated_at)
  VALUES (user_id_var, credit_amount_var, NOW(), NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    amount = public.credits.amount + credit_amount_var,
    updated_at = NOW();
END;
$$;
-- Drop and recreate decrement_user_credits function with new parameter names
DROP FUNCTION IF EXISTS public.decrement_user_credits(uuid, integer);
CREATE OR REPLACE FUNCTION public.decrement_user_credits(user_id_var UUID, credit_amount_var INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Update the credits table, ensuring amount doesn't go below 0
  UPDATE public.credits
  SET
    amount = GREATEST(0, amount - credit_amount_var),
    updated_at = NOW()
  WHERE user_id = user_id_var;

  -- If no row exists, create one with 0 credits (in case of edge case)
  INSERT INTO public.credits (user_id, amount, created_at, updated_at)
  SELECT user_id_var, 0, NOW(), NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.credits WHERE user_id = user_id_var
  );
END;
$$;
