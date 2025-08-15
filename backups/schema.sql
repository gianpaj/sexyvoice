

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."credit_transaction_type" AS ENUM (
    'purchase',
    'usage',
    'freemium',
    'topup'
);


ALTER TYPE "public"."credit_transaction_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_user_credits"("user_id" "uuid", "credit_amount" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."decrement_user_credits"("user_id" "uuid", "credit_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_user_credits"("user_id_var" "uuid", "credit_amount" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Insert or update the credits table
  INSERT INTO public.credits (user_id, amount, created_at, updated_at)
  VALUES (user_id_var, credit_amount, NOW(), NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    amount = credits.amount + credit_amount,
    updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."increment_user_credits"("user_id_var" "uuid", "credit_amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audio_files" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "voice_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "storage_key" "text" NOT NULL,
    "duration" double precision NOT NULL,
    "text_content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "total_votes" integer DEFAULT 0 NOT NULL,
    "url" "text" NOT NULL,
    "is_public" boolean DEFAULT false NOT NULL,
    "model" "text" NOT NULL,
    "prediction_id" "text",
    "credits_used" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."audio_files" OWNER TO "postgres";


COMMENT ON COLUMN "public"."audio_files"."status" IS 'Status of the audio file: active, deleted';



COMMENT ON COLUMN "public"."audio_files"."deleted_at" IS 'Timestamp when the audio file was soft deleted';



CREATE TABLE IF NOT EXISTS "public"."credit_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" integer NOT NULL,
    "type" "public"."credit_transaction_type" NOT NULL,
    "description" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "subscription_id" "text",
    "reference_id" "text",
    "metadata" "jsonb"
);


ALTER TABLE "public"."credit_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credits" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."credits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "stripe_id" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."voices" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "language" "text" NOT NULL,
    "is_nsfw" boolean DEFAULT false,
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "model" "text" DEFAULT ''::"text" NOT NULL,
    "sample_url" "text",
    "sample_prompt" "text"
);


ALTER TABLE "public"."voices" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audio_files"
    ADD CONSTRAINT "audio_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_transactions"
    ADD CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credits"
    ADD CONSTRAINT "credits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credits"
    ADD CONSTRAINT "credits_user_id_unique" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."voices"
    ADD CONSTRAINT "voices_pkey" PRIMARY KEY ("id");



CREATE INDEX "audio_files_user_id_idx" ON "public"."audio_files" USING "btree" ("user_id");



CREATE INDEX "audio_files_voice_id_idx" ON "public"."audio_files" USING "btree" ("voice_id");



CREATE INDEX "credit_transactions_created_at_idx" ON "public"."credit_transactions" USING "btree" ("created_at");



CREATE INDEX "credit_transactions_user_id_idx" ON "public"."credit_transactions" USING "btree" ("user_id");



CREATE INDEX "credits_user_id_index" ON "public"."credits" USING "btree" ("user_id");



CREATE INDEX "idx_audio_files_status" ON "public"."audio_files" USING "btree" ("status");



CREATE INDEX "idx_voices_user_id" ON "public"."voices" USING "btree" ("user_id");



CREATE UNIQUE INDEX "unique_user_reference_topup_idx" ON "public"."credit_transactions" USING "btree" ("user_id", "reference_id") WHERE (("type" = 'topup'::"public"."credit_transaction_type") AND ("reference_id" IS NOT NULL));



COMMENT ON INDEX "public"."unique_user_reference_topup_idx" IS 'Prevents duplicate topup transactions for the same user and payment intent to avoid race conditions in Stripe webhooks';



CREATE UNIQUE INDEX "unique_user_subscription_purchase_idx" ON "public"."credit_transactions" USING "btree" ("user_id", "subscription_id") WHERE (("type" = 'purchase'::"public"."credit_transaction_type") AND ("subscription_id" IS NOT NULL));



COMMENT ON INDEX "public"."unique_user_subscription_purchase_idx" IS 'Prevents duplicate purchase transactions for the same user and subscription to avoid race conditions in Stripe webhooks';



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_voices_updated_at" BEFORE UPDATE ON "public"."voices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."audio_files"
    ADD CONSTRAINT "audio_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."audio_files"
    ADD CONSTRAINT "audio_files_voice_id_fkey" FOREIGN KEY ("voice_id") REFERENCES "public"."voices"("id");



ALTER TABLE ONLY "public"."credit_transactions"
    ADD CONSTRAINT "credit_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."credits"
    ADD CONSTRAINT "credits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."voices"
    ADD CONSTRAINT "voices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



CREATE POLICY "Authenticated users can view their insert audio files" ON "public"."audio_files" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can view their own audio files" ON "public"."audio_files" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Only system can insert credits" ON "public"."credits" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Only system can update credits" ON "public"."credits" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Public audio files are viewable by everyone" ON "public"."audio_files" FOR SELECT TO "authenticated", "anon" USING ("is_public");



CREATE POLICY "Public profiles are viewable by everyone" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Update your own audio file (soft delete)" ON "public"."audio_files" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "User can insert client_transactions" ON "public"."credit_transactions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own voices" ON "public"."voices" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (( SELECT ("auth"."uid"() = "profiles"."id")));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own voices" ON "public"."voices" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own credit transactions" ON "public"."credit_transactions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own credits" ON "public"."credits" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view public voices" ON "public"."voices" FOR SELECT USING (("is_public" OR ("auth"."uid"() = "user_id")));



ALTER TABLE "public"."audio_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."voices" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";




















































































































































































GRANT ALL ON FUNCTION "public"."decrement_user_credits"("user_id" "uuid", "credit_amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_user_credits"("user_id" "uuid", "credit_amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_user_credits"("user_id" "uuid", "credit_amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_user_credits"("user_id_var" "uuid", "credit_amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_user_credits"("user_id_var" "uuid", "credit_amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_user_credits"("user_id_var" "uuid", "credit_amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."audio_files" TO "anon";
GRANT ALL ON TABLE "public"."audio_files" TO "authenticated";
GRANT ALL ON TABLE "public"."audio_files" TO "service_role";



GRANT ALL ON TABLE "public"."credit_transactions" TO "anon";
GRANT ALL ON TABLE "public"."credit_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."credits" TO "anon";
GRANT ALL ON TABLE "public"."credits" TO "authenticated";
GRANT ALL ON TABLE "public"."credits" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."voices" TO "anon";
GRANT ALL ON TABLE "public"."voices" TO "authenticated";
GRANT ALL ON TABLE "public"."voices" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
