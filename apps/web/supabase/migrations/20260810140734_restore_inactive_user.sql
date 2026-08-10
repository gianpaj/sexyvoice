-- Restore application state for retained Auth users whose inactive, empty
-- profiles were removed by the database-retention workflow.
CREATE OR REPLACE FUNCTION public.restore_inactive_user(
  p_user_id uuid,
  p_email text,
  p_auth_created_at timestamp with time zone
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  profile_was_inserted boolean;
  restored_at timestamp with time zone := now();
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required';
  END IF;

  IF NULLIF(BTRIM(p_email), '') IS NULL THEN
    RAISE EXCEPTION 'User email is required';
  END IF;

  IF p_auth_created_at IS NULL THEN
    RAISE EXCEPTION 'Auth creation timestamp is required';
  END IF;

  INSERT INTO public.profiles (
    id,
    username,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_email,
    p_auth_created_at,
    restored_at
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING true INTO profile_was_inserted;

  IF NOT COALESCE(profile_was_inserted, false) THEN
    RETURN false;
  END IF;

  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    type,
    description,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    10000,
    'freemium',
    'Initial user credits',
    p_auth_created_at,
    restored_at
  );

  INSERT INTO public.credits (
    user_id,
    amount,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    10000,
    p_auth_created_at,
    restored_at
  );

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_inactive_user(uuid, text, timestamp with time zone)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_inactive_user(uuid, text, timestamp with time zone)
FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_inactive_user(uuid, text, timestamp with time zone)
TO service_role;

COMMENT ON FUNCTION public.restore_inactive_user(uuid, text, timestamp with time zone) IS
'Atomically restores the profile and untouched signup credits for a retained inactive Auth user.';
