# Inactive User Reactivation Design

## Goal

Let an authenticated user whose retained Supabase Auth identity has lost its
application rows return to the dashboard. Restore the user as an unused
free-tier account without changing the original account creation date.

The existing retention workflow may continue deleting application rows for
inactive, empty accounts to reduce database storage. It must only select users
who still have the untouched 10,000-credit signup grant.

## Reactivation Boundary

The dashboard layout will ensure that the authenticated user has an application
profile before it reads credits, transactions, or other profile-dependent data.
This boundary covers Google and password login because both flows enter the
dashboard. It also repairs an orphaned user who still has a valid session.

A server-only helper will first look up the profile with the Supabase admin
client. Existing profiles require no writes. A missing profile will cause the
helper to call a service-role-only Postgres function.

## Atomic Restoration

The Postgres function will run as `SECURITY INVOKER` under the service role. The
migration will revoke execution from `public`, `anon`, and `authenticated`, then
grant execution to `service_role`.

The function will accept the authenticated user's ID, email, and Auth creation
timestamp. In one transaction it will:

1. Insert `public.profiles` with the original Auth creation timestamp.
2. Insert one 10,000-credit `freemium` transaction with that timestamp.
3. Insert the 10,000-credit balance with that timestamp.

The function will use current time for each restored row's `updated_at` value.
It will insert dependent rows only when it inserts the profile. A repeated or
concurrent call will return without adding credits when the profile already
exists.

The application will report successful reactivation as structured telemetry.
It will report and throw restoration failures before dashboard queries run, so
the user never receives a partially initialized dashboard.

## Retention Eligibility

The retention SQL will keep the six-month inactivity requirement and existing
checks for generated audio, calls, usage events, voices, prompts, characters,
and API keys. It will tighten the credit rules. An eligible account must have:

- one credit balance row whose amount is exactly 10,000;
- one credit transaction, the original 10,000-credit `freemium` grant; and
- no purchase, top-up, refund, or other credit transaction.

The preview, summary, and delete candidate queries will share the same rules.
The script will continue deleting `public.credits` before `public.profiles`;
profile deletion will cascade to the freemium transaction. It will retain
`auth.users`, allowing later restoration.

## Tests and Verification

Focused tests will verify that the dashboard:

- leaves an existing profile unchanged;
- restores a missing profile before profile-dependent queries;
- passes the original Auth creation timestamp to restoration;
- stops before dashboard data reads when restoration fails; and
- reports a successful restoration.

Database-level verification will inspect the migration for service-role-only
execution, transactional inserts, preserved creation timestamps, and
idempotency. Retention-query tests will verify that only untouched free-tier
accounts qualify and that changed balances or extra transactions disqualify an
account.

Before completion, the focused tests, `pnpm fixall`, and `pnpm type-check` must
pass.
