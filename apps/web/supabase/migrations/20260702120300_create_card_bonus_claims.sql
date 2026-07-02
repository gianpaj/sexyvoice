-- Global one-bonus-per-card enforcement: a physical card (identified by its
-- Stripe fingerprint) can only ever unlock the card-on-file credit bonus
-- once, across all accounts.
CREATE TABLE public.card_bonus_claims (
  fingerprint text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  setup_intent_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.card_bonus_claims ENABLE ROW LEVEL SECURITY;
-- No public policies: service-role only. Writes happen in the Stripe
-- webhook via createAdminClient(); users never read this table directly.
