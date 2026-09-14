# Database query performance

## Status

The Stripe ID uniqueness index is implemented and applied to production.
The broader optimization work remains proposed.

## Decision

`profiles.stripe_id` identifies one Stripe customer and is queried with
PostgREST `.single()`. Enforce that invariant with a partial unique index so
multiple `NULL` values remain valid:

```sql
create unique index profiles_stripe_id_unique_idx
  on public.profiles (stripe_id)
  where stripe_id is not null;
```

Production preflight on 2026-09-13 found no duplicate non-null Stripe IDs and no
existing Stripe ID index.

## Rollout

Migration:
`apps/web/supabase/migrations/20260913171301_add_unique_profiles_stripe_id.sql`

A human must apply pending migrations locally before `pnpm test:db` runs. The
remaining work is defined in
`docs/plans/2026-09-13-database-query-performance-implementation-plan.md`.
