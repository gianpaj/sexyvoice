-- public.handle_new_user() already creates the profile, initial credit
-- transaction, and starting balance. This older trigger duplicates that work
-- and fires first locally, before the profile required by the transaction FK
-- exists. Production no longer has this trigger; remove the stale local schema
-- objects idempotently so rebuilt environments match production.
DROP TRIGGER IF EXISTS add_credits_trigger ON auth.users;

DROP FUNCTION IF EXISTS public.add_credits_on_event();
