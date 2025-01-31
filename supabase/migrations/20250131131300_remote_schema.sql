set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (new.id, new.email); -- Assuming 'email' is a column in auth.users
  RETURN new;
END;
$function$
;

create policy "Authenticated users can view their own audio files"
on "public"."audio_files"
as permissive
for select
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Public audio files are viewable by everyone"
on "public"."audio_files"
as permissive
for select
to authenticated, anon
using (is_public);



