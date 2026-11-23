# LiveKit call dispatch

SexyVoice owns the versioned JSON in `RoomAgentDispatch.metadata`. The browser
gets a room grant. SexyCall verifies the shape, expiry, room, and caller before
accepting a linked call. The optional saved voice is a database reference UUID.
Resolve it within the authenticated user's Inworld references.

Generate the schema from the repository root:

```sh
node packages/voice-chat/export-dispatch-schema.mts > packages/voice-chat/contracts/dispatch-v1.schema.json
```

Versioned releases are immutable. Copy the schema and fixtures from the same
SexyVoice commit into SexyCall's `src/contracts/` and run both contract suites.
Record the source commit with the copies. For a breaking change, add a new
version and deploy a reader for it before selecting it in the producer.

## Thread history and admission

The [Postgres context RPC](../../../apps/web/supabase/migrations/20261123180000_read_conversation_context.sql)
reads the latest 32 committed message rows, budgets 12,000 Unicode characters,
and returns visible turns in order. A linked Python call can append committed
turns against the same thread using its live billing row and room.
Generate client RPC types from the migrated local database.

The [admission migration](../../../apps/web/supabase/migrations/20261123190000_share_conversation_admission.sql)
takes the per-account lock for both conversation leases and `call_sessions`
writes that start a call. Legacy Python calls participate through their normal
session insert. An active Python call keeps admission until its billing
row leaves `active`. Existing Python call startup handles stale-session
cleanup.

Apply both migrations before deploying their consumers. The cross-repository
test in SexyCall exercises the TypeScript dispatch builder and Python
adapters against the same local Supabase project. Browser verification
requires a named Python worker and runtime selection in the call page.
