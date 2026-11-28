# Account content cleanup

Account deletion erases conversation history, clears stored call transcripts,
and revokes API keys. The login,
profile, credit balance and internal cost history remain intact.

## Decisions

- Erase owned threads under the per-user chat and call admission lock.
  Messages, resumable reply receipts, and call leases cascade. Linked
  call sessions keep their billing fields and lose the thread link.
- Block new conversations for ten minutes after each erasure. The server-only
  deadline outlasts the current chat run, call lease and dispatch token.
  In-flight writers still require their deleted lease and thread. A fresh
  conversation can start after the deadline.

- Clear only `call_sessions.transcript`. Keep duration, model, timestamps and
  credit fields because `resolveUsageCost` uses them to estimate provider spend.
- Retain `usage_events`. It stores recorded dollar amounts and provider-cost
  metadata, and database triggers enforce an append-only audit history.
- Revoke keys through the shared `revokeApiKeys` query. The dashboard's Delete
  key action uses the same behavior. API authentication requires `is_active`.
- Keep API-key rows as audit references. Their foreign key uses
  `ON DELETE SET NULL`, which would update immutable usage rows during physical
  key deletion.
- Stop successful deletion and sign-out if transcript cleanup or revocation
  fails. Keep the existing billing reservation cleanup in `finally`.
- Retain transcript-derived analysis and aggregate reports as internal analytics,
  including topics, requests and summaries.
- Legacy Python calls still clear only the stored transcript snapshot. A
  running Python call can save its transcript again and trigger analysis.

## Rejected options

Relying on the Auth foreign key would leave history because account deletion
retains the login. Deleting rows without recording the erasure would let
a delayed call or chat recreate a thread.

Deleting usage events or call sessions loses recorded or estimated provider
costs. Physically deleting referenced API-key rows requires changing the audit
schema; revocation disables credentials through the existing access mechanism.

## Verification

Account-deletion tests cover user scoping, unchanged billing fields, revoked
keys, cleanup failures and retained usage records. API-key route tests cover
the shared revocation query's single-key caller.

Database tests cover cascades, retained call charges, stale chat and call
writers, and starting fresh once the erasure lock expires.
