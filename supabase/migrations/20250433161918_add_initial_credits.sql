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
    10000,
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
    10000
  );

  RETURN new;
END;
$function$;