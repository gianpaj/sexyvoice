-- Record a credit purchase and add its credits in one transaction.
--
-- Affected: new function public.grant_purchased_credits.
--
-- Stripe webhook grants inserted the credit_transactions row and then called
-- increment_user_credits in a second request. When the increment failed, the
-- row stayed, so every retry stopped at the reference_id dedupe and the user
-- never received the credits. This function performs both writes in one
-- transaction: a failed increment rolls back the ledger row, so a retry can
-- grant again.

create or replace function public.grant_purchased_credits(
  p_user_id uuid,
  p_type public.credit_transaction_type,
  p_amount integer,
  p_reference_id text,
  p_description text,
  p_metadata jsonb,
  p_subscription_id text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transaction_id uuid;
begin
  -- Only purchase and topup rows have the unique reference_id indexes
  -- (unique_reference_purchase_idx and unique_reference_topup_idx) that turn
  -- a repeated grant into a no-op.
  if p_type is null or p_type not in ('purchase', 'topup') then
    raise exception 'Only purchase and topup credits can be granted'
      using errcode = '22023';
  end if;

  -- A payment that is already recorded conflicts with one of those indexes:
  -- nothing is inserted and nothing is granted.
  insert into public.credit_transactions (
    user_id,
    type,
    amount,
    reference_id,
    subscription_id,
    description,
    metadata
  )
  values (
    p_user_id,
    p_type,
    p_amount,
    p_reference_id,
    p_subscription_id,
    p_description,
    p_metadata
  )
  on conflict do nothing
  returning id into v_transaction_id;

  if v_transaction_id is null then
    return false;
  end if;

  -- increment_user_credits checks the caller's role and validates the user and
  -- amount. Any error rolls back the ledger row inserted above.
  perform public.increment_user_credits(p_user_id, p_amount);

  return true;
end;
$$;

-- Functions are executable by PUBLIC by default. Credit grants must only be
-- reachable through server-side clients using the service role, like
-- increment_user_credits.
revoke execute
  on function public.grant_purchased_credits(
    uuid,
    public.credit_transaction_type,
    integer,
    text,
    text,
    jsonb,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.grant_purchased_credits(
    uuid,
    public.credit_transaction_type,
    integer,
    text,
    text,
    jsonb,
    text
  )
  to service_role;
