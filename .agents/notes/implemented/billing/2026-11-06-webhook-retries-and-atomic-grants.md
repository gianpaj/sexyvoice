# Retry failed Stripe webhooks and grant credits atomically

## Decision

`POST /api/stripe/webhook` returns 500 when a handled event fails, so Stripe
retries it, and reports each failure to Sentry once from the route.
`grant_purchased_credits` records a purchase and adds its credits in one
database transaction, so a retry after a failed balance update grants again
instead of stopping at the `reference_id` dedupe.

The response rules are documented in
[Architecture](../../../../ARCHITECTURE.md#stripe-webhooks).

## Alternatives and consequences

- An unknown price ID or customer on a paid event returns 500. Both usually
  have a fixable or transient cause: a missing price variable, or a failed
  profile lookup, which `getUserIdByStripeCustomerId` reports as no user.
  Stripe retries for up to three days.
- Missing top-up metadata and a subscription checkout without IDs return 200
  after one report. The event cannot change, so a retry would only fail again.
- An invalid signature returns 400 and is still reported once, so a rotated
  `STRIPE_WEBHOOK_SECRET` shows up in Sentry. Unsigned requests add noise.
- Reports carry the event and object IDs, not the event payload with its
  customer details. The Stripe dashboard holds the full event.
- The function runs as SECURITY INVOKER and calls `increment_user_credits` for
  the caller-role check and amount validation instead of copying them. Only
  `service_role` can execute it.
- `on conflict do nothing` has no conflict target because the unique
  `reference_id` indexes are partial, one per type. The function accepts only
  `purchase` and `topup`, the types those indexes cover.
- The TypeScript helpers keep their pre-check so a recorded payment skips the
  first-purchase lookup. The function still decides whether to grant.

## Verification

`apps/web/tests/stripe-webhook.test.ts` covers the status codes and single
reports. `apps/web/supabase/tests/grant_purchased_credits.test.sql` covers a
grant, a repeat, and a retry after a failed balance update; run it with
`pnpm test:db` once the migration is applied locally.
