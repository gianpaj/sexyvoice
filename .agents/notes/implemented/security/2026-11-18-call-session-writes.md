# Agent Note: Server-only call session writes

Status: implemented — users read their own call sessions; only the service role writes them

## Problem

`call_sessions` had owner-only INSERT and UPDATE policies with no column
limits. Wherever `authenticated` holds table write grants, which production has
from Supabase's legacy defaults, a signed-in user could:

- fabricate completed sessions with a transcript. The
  `call_sessions_summarize_trigger` webhook then queues them for paid xAI
  analysis, which charges no user credits.
- lower `duration_seconds` on past sessions. `isFreeUserOverCallLimit` sums
  that column, so a free user could reset their 5-minute live-call allowance.

## Decision

Only the service role writes `call_sessions`.
`20261118090000_restrict_call_session_writes.sql` drops both user write
policies and revokes INSERT, UPDATE, DELETE and TRUNCATE from `PUBLIC`, `anon`
and `authenticated`. The SELECT policy keeps users' read access to their own
history.

The SexyCall agent creates, meters and finalizes sessions with
`SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS. Account deletion clears the
verified user's transcripts with `createAdminClient()`, scoped by `user_id`.

## Alternatives considered

- **Column-level grants that leave users only `transcript`.** Account deletion
  was the only user-session write, and it already runs server-side with a
  verified user, so no client needs any write.
- **A validation trigger on user writes.** It would have to know which fields
  the agent owns and stay in sync with it; removing the writes is smaller.
- **Revoke the legacy default grants across all tables.** The right long-term
  fix, but it touches every table's access at once; this change closes the two
  exploitable paths on the table that needs it.

## Consequences

- No client can create, edit or delete call sessions. Any future user-facing
  edit must go through a server route that validates the fields it changes.
- `call_sessions_security.test.sql` asserts RLS, the single SELECT policy, the
  absent write policies, and the role grants.
- Other tables with owner-only write policies may carry the same legacy grants
  and need the same review.
