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

  SELECT public.credits.amount
  INTO current_amount
  FROM public.credits
  WHERE public.credits.user_id = user_id_var
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.credits (user_id, amount, created_at, updated_at)
    VALUES (user_id_var, 0, NOW(), NOW())
    ON CONFLICT (user_id) DO NOTHING;

    RETURN 0;
  END IF;

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
