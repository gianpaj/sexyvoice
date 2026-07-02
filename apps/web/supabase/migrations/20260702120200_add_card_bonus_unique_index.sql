-- Enforce at most one 'card_bonus' credit transaction per user.
CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_one_card_bonus_per_user
  ON public.credit_transactions (user_id)
  WHERE type = 'card_bonus';
