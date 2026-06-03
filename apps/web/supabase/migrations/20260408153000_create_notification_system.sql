ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_locale_check'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_locale_check
    CHECK (locale IN ('en', 'es', 'de', 'da', 'it', 'fr'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'in_app')),
  preference_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, channel, preference_key)
);

CREATE INDEX IF NOT EXISTS notification_preferences_user_id_idx
ON public.notification_preferences(user_id);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notification_preferences'
      AND policyname = 'Users can view own notification preferences'
  ) THEN
    CREATE POLICY "Users can view own notification preferences"
    ON public.notification_preferences
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notification_preferences'
      AND policyname = 'Users can insert own notification preferences'
  ) THEN
    CREATE POLICY "Users can insert own notification preferences"
    ON public.notification_preferences
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notification_preferences'
      AND policyname = 'Users can update own notification preferences'
  ) THEN
    CREATE POLICY "Users can update own notification preferences"
    ON public.notification_preferences
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_notification_preferences_updated_at'
  ) THEN
    CREATE TRIGGER set_notification_preferences_updated_at
    BEFORE UPDATE ON public.notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  dedupe_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_name, dedupe_key)
);

CREATE INDEX IF NOT EXISTS notification_events_user_id_idx
ON public.notification_events(user_id);

CREATE INDEX IF NOT EXISTS notification_events_source_idx
ON public.notification_events(source_type, source_id);

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_event_id UUID NOT NULL REFERENCES public.notification_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'in_app')),
  template_key TEXT NOT NULL,
  provider TEXT,
  recipient TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending',
      'skipped',
      'sent',
      'delivered',
      'opened',
      'clicked',
      'bounced',
      'complained',
      'failed'
    )
  ),
  provider_message_id TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  last_provider_event_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notification_deliveries_notification_event_id_idx
ON public.notification_deliveries(notification_event_id);

CREATE INDEX IF NOT EXISTS notification_deliveries_user_id_idx
ON public.notification_deliveries(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_provider_message_id_idx
ON public.notification_deliveries(provider, provider_message_id)
WHERE provider IS NOT NULL AND provider_message_id IS NOT NULL;

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_notification_deliveries_updated_at'
  ) THEN
    CREATE TRIGGER set_notification_deliveries_updated_at
    BEFORE UPDATE ON public.notification_deliveries
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.credit_allowance_alert_emails') IS NOT NULL THEN
    INSERT INTO public.notification_events (
      user_id,
      event_name,
      source_type,
      source_id,
      dedupe_key,
      payload,
      created_at
    )
    SELECT
      legacy.user_id,
      'app/credits.allowance-threshold.reached',
      'credit_transaction',
      legacy.credit_transaction_id::text,
      CONCAT(
        'credit-allowance-threshold:',
        legacy.credit_transaction_id::text,
        ':',
        legacy.threshold_percent::text
      ),
      jsonb_build_object(
        'creditTransactionId',
        legacy.credit_transaction_id,
        'thresholdPercent',
        legacy.threshold_percent,
        'migratedFromLegacy',
        true
      ),
      legacy.created_at
    FROM public.credit_allowance_alert_emails legacy
    ON CONFLICT (event_name, dedupe_key) DO NOTHING;

    INSERT INTO public.notification_deliveries (
      notification_event_id,
      user_id,
      channel,
      template_key,
      provider,
      recipient,
      status,
      provider_message_id,
      error_message,
      metadata,
      created_at,
      updated_at,
      sent_at,
      last_provider_event_at
    )
    SELECT
      event_row.id,
      legacy.user_id,
      'email',
      'credit_allowance_threshold',
      'resend',
      legacy.email,
      CASE legacy.status
        WHEN 'pending' THEN 'pending'
        WHEN 'sent' THEN 'sent'
        ELSE 'failed'
      END,
      legacy.resend_message_id,
      legacy.error_message,
      jsonb_build_object(
        'migratedFromLegacy',
        true,
        'legacyTable',
        'credit_allowance_alert_emails'
      ),
      legacy.created_at,
      legacy.created_at,
      legacy.sent_at,
      COALESCE(legacy.sent_at, legacy.created_at)
    FROM public.credit_allowance_alert_emails legacy
    INNER JOIN public.notification_events event_row
      ON event_row.event_name = 'app/credits.allowance-threshold.reached'
      AND event_row.dedupe_key = CONCAT(
        'credit-allowance-threshold:',
        legacy.credit_transaction_id::text,
        ':',
        legacy.threshold_percent::text
      )
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.notification_deliveries existing
      WHERE existing.notification_event_id = event_row.id
        AND existing.channel = 'email'
        AND existing.template_key = 'credit_allowance_threshold'
    );

    DROP TABLE public.credit_allowance_alert_emails;
  END IF;
END $$;
