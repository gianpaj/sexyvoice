-- Make credit debits atomic so concurrent generation requests cannot overdraw.
CREATE OR REPLACE FUNCTION public.decrement_user_credits(user_id_var UUID, credit_amount_var INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF credit_amount_var <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.credits
  SET
    amount = amount - credit_amount_var,
    updated_at = NOW()
  WHERE user_id = user_id_var
    AND amount >= credit_amount_var;

  IF FOUND THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.credits
    WHERE user_id = user_id_var
  ) THEN
    INSERT INTO public.credits (user_id, amount, created_at, updated_at)
    VALUES (user_id_var, 0, NOW(), NOW())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RAISE EXCEPTION 'Insufficient credits'
    USING ERRCODE = 'P0001';
END;
$$;
