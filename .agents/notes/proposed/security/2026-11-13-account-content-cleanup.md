# Account content cleanup

Account deletion clears stored call transcripts and revokes API keys. The login,
profile, credit balance and internal cost history remain intact.

## Decisions

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

## Rejected options

Deleting usage events or call sessions loses recorded or estimated provider
costs. Physically deleting referenced API-key rows requires changing the audit
schema; revocation disables credentials through the existing access mechanism.

## Verification

Account-deletion tests cover user scoping, unchanged billing fields, revoked
keys, cleanup failures and retained usage records. API-key route tests cover
the shared revocation query's single-key caller.
