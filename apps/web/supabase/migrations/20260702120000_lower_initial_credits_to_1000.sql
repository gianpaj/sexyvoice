-- Lower the freemium signup grant from 10,000 to 1,000 credits.
-- The bulk of the free allowance (9,000 credits) is now unlocked separately
-- via the card-on-file bonus (see card_bonus migrations).
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  -- Create profile for new user
  INSERT INTO public.profiles (id, username)
  VALUES (new.id, new.email);

  -- Add initial credits transaction
  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    type,
    description,
    created_at
  ) VALUES (
    new.id,
    1000,
    'freemium',
    'Initial user credits',
    now()
  );

  -- Set initial credits balance
  INSERT INTO public.credits (
    user_id,
    amount
  ) VALUES (
    new.id,
    1000
  );

  RETURN new;
END;
$function$;

-- add_credits_trigger only ever wrote a second, duplicate freemium ledger row
-- (it never touched the credits balance table). Dropping it stops the ledger
-- from double-counting the freemium grant, so each new user has exactly one
-- freemium row matching their actual balance.
DROP TRIGGER IF EXISTS add_credits_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.add_credits_on_event();
