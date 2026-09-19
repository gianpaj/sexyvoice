-- Add handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$;
ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
-- Add down migration
-- DROP FUNCTION IF EXISTS public.handle_new_user();
