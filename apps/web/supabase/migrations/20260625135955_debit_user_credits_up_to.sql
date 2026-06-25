-- Partial debit helper for post-generation credit reconciliation.
--
-- Keep public.decrement_user_credits strict for upfront reservations: callers
-- should fail before provider work starts when the estimate cannot be paid.
-- This function is for the opposite case: provider work already succeeded,
-- actual usage exceeded the estimate, and we should collect every remaining
-- credit without ever letting the balance go negative.
CREATE OR REPLACE FUNCTION public.decrement_user_credits_up_to(
  user_id_var UUID,
  credit_amount_var INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_amount INTEGER;
  debited_amount INTEGER;
BEGIN
  IF credit_amount_var <= 0 THEN
    RETURN 0;
  END IF;

  -- Lock the credit row while deciding the partial debit amount. Without this,
  -- concurrent reconciliations could both read the same balance and overdraw.
  SELECT public.credits.amount
  INTO current_amount
  FROM public.credits
  WHERE public.credits.user_id = user_id_var
  FOR UPDATE;

  -- Match the existing credit RPC behavior for missing rows: create a zero
  -- balance row for consistency, but report that no credits were collected.
  IF NOT FOUND THEN
    INSERT INTO public.credits (user_id, amount, created_at, updated_at)
    VALUES (user_id_var, 0, NOW(), NOW())
    ON CONFLICT (user_id) DO NOTHING;

    RETURN 0;
  END IF;

  -- Clamp the debit to the current balance. The caller records this returned
  -- amount as the actual extra charge collected.
  debited_amount := GREATEST(0, LEAST(current_amount, credit_amount_var));

  IF debited_amount = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.credits
  SET
    amount = amount - debited_amount,
    updated_at = NOW()
  WHERE public.credits.user_id = user_id_var;

  RETURN debited_amount;
END;
$$;
