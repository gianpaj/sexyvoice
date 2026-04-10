-- Track external API low-credit email notifications tied to allowance transactions.
CREATE TABLE IF NOT EXISTS public.credit_allowance_alert_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  credit_transaction_id UUID NOT NULL REFERENCES public.credit_transactions(id) ON DELETE CASCADE,
  threshold_percent INTEGER NOT NULL CHECK (threshold_percent IN (80, 95, 100)),
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  resend_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  UNIQUE (credit_transaction_id, threshold_percent)
);

CREATE INDEX IF NOT EXISTS credit_allowance_alert_emails_user_id_idx
ON public.credit_allowance_alert_emails(user_id);

ALTER TABLE public.credit_allowance_alert_emails ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.credit_allowance_alert_emails IS
  'Emails sent when users are near depletion (80/95/100%) of a specific credit allowance transaction.';
