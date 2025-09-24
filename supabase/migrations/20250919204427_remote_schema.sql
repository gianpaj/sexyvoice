drop extension if exists "pg_net";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION extensions.grant_pg_cron_access()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION extensions.grant_pg_net_access()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM pg_event_trigger_ddl_commands() AS ev
      JOIN pg_extension AS ext
      ON ev.objid = ext.oid
      WHERE ext.extname = 'pg_net'
    )
    THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = 'supabase_functions_admin'
      )
      THEN
        CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
      END IF;

      GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

      IF EXISTS (
        SELECT FROM pg_extension
        WHERE extname = 'pg_net'
        -- all versions in use on existing projects as of 2025-02-20
        -- version 0.12.0 onwards don't need these applied
        AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8.0', '0.10.0', '0.11.0')
      ) THEN
        ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
        ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

        ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
        ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

        REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
        REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

        GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
        GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      END IF;
    END IF;
  END;
  $function$
;

drop trigger if exists "update_credits_updated_at" on "public"."credits";

drop policy "Users can insert their own profile" on "public"."profiles";

revoke delete on table "public"."audio_files" from "anon";

revoke insert on table "public"."audio_files" from "anon";

revoke references on table "public"."audio_files" from "anon";

revoke select on table "public"."audio_files" from "anon";

revoke trigger on table "public"."audio_files" from "anon";

revoke truncate on table "public"."audio_files" from "anon";

revoke update on table "public"."audio_files" from "anon";

revoke delete on table "public"."audio_files" from "authenticated";

revoke insert on table "public"."audio_files" from "authenticated";

revoke references on table "public"."audio_files" from "authenticated";

revoke select on table "public"."audio_files" from "authenticated";

revoke trigger on table "public"."audio_files" from "authenticated";

revoke truncate on table "public"."audio_files" from "authenticated";

revoke update on table "public"."audio_files" from "authenticated";

revoke delete on table "public"."audio_files" from "service_role";

revoke insert on table "public"."audio_files" from "service_role";

revoke references on table "public"."audio_files" from "service_role";

revoke select on table "public"."audio_files" from "service_role";

revoke trigger on table "public"."audio_files" from "service_role";

revoke truncate on table "public"."audio_files" from "service_role";

revoke update on table "public"."audio_files" from "service_role";

revoke delete on table "public"."credit_transactions" from "anon";

revoke insert on table "public"."credit_transactions" from "anon";

revoke references on table "public"."credit_transactions" from "anon";

revoke select on table "public"."credit_transactions" from "anon";

revoke trigger on table "public"."credit_transactions" from "anon";

revoke truncate on table "public"."credit_transactions" from "anon";

revoke update on table "public"."credit_transactions" from "anon";

revoke delete on table "public"."credit_transactions" from "authenticated";

revoke insert on table "public"."credit_transactions" from "authenticated";

revoke references on table "public"."credit_transactions" from "authenticated";

revoke select on table "public"."credit_transactions" from "authenticated";

revoke trigger on table "public"."credit_transactions" from "authenticated";

revoke truncate on table "public"."credit_transactions" from "authenticated";

revoke update on table "public"."credit_transactions" from "authenticated";

revoke delete on table "public"."credit_transactions" from "service_role";

revoke insert on table "public"."credit_transactions" from "service_role";

revoke references on table "public"."credit_transactions" from "service_role";

revoke select on table "public"."credit_transactions" from "service_role";

revoke trigger on table "public"."credit_transactions" from "service_role";

revoke truncate on table "public"."credit_transactions" from "service_role";

revoke update on table "public"."credit_transactions" from "service_role";

revoke delete on table "public"."credits" from "anon";

revoke insert on table "public"."credits" from "anon";

revoke references on table "public"."credits" from "anon";

revoke select on table "public"."credits" from "anon";

revoke trigger on table "public"."credits" from "anon";

revoke truncate on table "public"."credits" from "anon";

revoke update on table "public"."credits" from "anon";

revoke delete on table "public"."credits" from "authenticated";

revoke insert on table "public"."credits" from "authenticated";

revoke references on table "public"."credits" from "authenticated";

revoke select on table "public"."credits" from "authenticated";

revoke trigger on table "public"."credits" from "authenticated";

revoke truncate on table "public"."credits" from "authenticated";

revoke update on table "public"."credits" from "authenticated";

revoke delete on table "public"."credits" from "service_role";

revoke insert on table "public"."credits" from "service_role";

revoke references on table "public"."credits" from "service_role";

revoke select on table "public"."credits" from "service_role";

revoke trigger on table "public"."credits" from "service_role";

revoke truncate on table "public"."credits" from "service_role";

revoke update on table "public"."credits" from "service_role";

revoke delete on table "public"."profiles" from "anon";

revoke insert on table "public"."profiles" from "anon";

revoke references on table "public"."profiles" from "anon";

revoke select on table "public"."profiles" from "anon";

revoke trigger on table "public"."profiles" from "anon";

revoke truncate on table "public"."profiles" from "anon";

revoke update on table "public"."profiles" from "anon";

revoke delete on table "public"."profiles" from "authenticated";

revoke insert on table "public"."profiles" from "authenticated";

revoke references on table "public"."profiles" from "authenticated";

revoke select on table "public"."profiles" from "authenticated";

revoke trigger on table "public"."profiles" from "authenticated";

revoke truncate on table "public"."profiles" from "authenticated";

revoke update on table "public"."profiles" from "authenticated";

revoke delete on table "public"."profiles" from "service_role";

revoke insert on table "public"."profiles" from "service_role";

revoke references on table "public"."profiles" from "service_role";

revoke select on table "public"."profiles" from "service_role";

revoke trigger on table "public"."profiles" from "service_role";

revoke truncate on table "public"."profiles" from "service_role";

revoke update on table "public"."profiles" from "service_role";

revoke delete on table "public"."voices" from "anon";

revoke insert on table "public"."voices" from "anon";

revoke references on table "public"."voices" from "anon";

revoke select on table "public"."voices" from "anon";

revoke trigger on table "public"."voices" from "anon";

revoke truncate on table "public"."voices" from "anon";

revoke update on table "public"."voices" from "anon";

revoke delete on table "public"."voices" from "authenticated";

revoke insert on table "public"."voices" from "authenticated";

revoke references on table "public"."voices" from "authenticated";

revoke select on table "public"."voices" from "authenticated";

revoke trigger on table "public"."voices" from "authenticated";

revoke truncate on table "public"."voices" from "authenticated";

revoke update on table "public"."voices" from "authenticated";

revoke delete on table "public"."voices" from "service_role";

revoke insert on table "public"."voices" from "service_role";

revoke references on table "public"."voices" from "service_role";

revoke select on table "public"."voices" from "service_role";

revoke trigger on table "public"."voices" from "service_role";

revoke truncate on table "public"."voices" from "service_role";

revoke update on table "public"."voices" from "service_role";

drop function if exists "public"."add_credits_on_event"();

drop function if exists "public"."increment_user_credits"(user_id uuid, credit_amount integer);

drop index if exists "public"."credit_transactions_metadata_idx";

drop index if exists "public"."credit_transactions_reference_id_idx";

drop index if exists "public"."credit_transactions_subscription_id_idx";

drop index if exists "public"."unique_reference_purchase_idx";

drop index if exists "public"."unique_reference_topup_idx";

alter table "public"."audio_files" drop column "usage";

alter table "public"."audio_files" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."credit_transactions" disable row level security;

alter table "public"."credits" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."credits" disable row level security;

alter table "public"."voices" drop column "prediction_id";

alter table "public"."voices" alter column "id" set default extensions.uuid_generate_v4();

alter table "public"."voices" alter column "model" set default ''::text;

CREATE INDEX audio_files_user_id_idx ON public.audio_files USING btree (user_id);

CREATE INDEX audio_files_voice_id_idx ON public.audio_files USING btree (voice_id);

CREATE INDEX credits_user_id_index ON public.credits USING btree (user_id);

CREATE UNIQUE INDEX credits_user_id_unique ON public.credits USING btree (user_id);

CREATE INDEX idx_voices_user_id ON public.voices USING btree (user_id);

CREATE UNIQUE INDEX unique_user_reference_topup_idx ON public.credit_transactions USING btree (user_id, reference_id) WHERE ((type = 'topup'::credit_transaction_type) AND (reference_id IS NOT NULL));

CREATE UNIQUE INDEX unique_user_subscription_purchase_idx ON public.credit_transactions USING btree (user_id, subscription_id) WHERE ((type = 'purchase'::credit_transaction_type) AND (subscription_id IS NOT NULL));

alter table "public"."credits" add constraint "credits_user_id_unique" UNIQUE using index "credits_user_id_unique";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.increment_user_credits(user_id_var uuid, credit_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Insert or update the credits table
  INSERT INTO public.credits (user_id, amount, created_at, updated_at)
  VALUES (user_id_var, credit_amount, NOW(), NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    amount = credits.amount + credit_amount,
    updated_at = NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.decrement_user_credits(user_id uuid, credit_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;


  create policy "Authenticated users can view their insert audio files"
  on "public"."audio_files"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Update your own audio file (soft delete)"
  on "public"."audio_files"
  as permissive
  for update
  to authenticated
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "User can insert client_transactions"
  on "public"."credit_transactions"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can insert their own profile"
  on "public"."profiles"
  as permissive
  for insert
  to public
with check (( SELECT (auth.uid() = profiles.id)));



