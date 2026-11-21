# Agent Note: Shared conversation history

Status: proposed — schema verified in isolated local Supabase; runtime integration pending

## Problem

Text chat and Python LiveKit calls need the same durable conversation. The
call transcript JSON has no thread identity, indexed message order, or durable
source IDs for correcting repeated transcription events. Users also need to
retain several conversations with one character for a future thread menu.

## Proposal

The [migration](../../../../apps/web/supabase/migrations/20261116140000_create_conversations.sql)
adds `conversations`, `conversation_messages`, and a nullable
`call_sessions.conversation_id`. It does not backfill historical calls.
Existing transcript JSON and minute billing keep their current roles.

A conversation owns a character reference, display-name snapshot, scene ID and
user-selected scene instructions, language, timestamps, and history revision.
Deleting a character retains the conversation with a NULL character reference.
The application must treat that history as read-only and refuse new model work.
Deleting a conversation cascades its messages and unlinks its diagnostic call
records. Deleting a source call retains its visible messages.

Message identity is `(conversation_id, id)`. Explicit positive `position` values
order the thread; creation time and event arrival do not determine context.
The position constraint permits an atomic reorder. Each message records role,
chat/voice source, visible text parts, lifecycle state, revision, and optional
call/LiveKit item IDs. Repeated call finals update the same item, including its
interruption state. Identity is immutable; updates advance message and thread
revisions. Source-call references are checked at transaction end so thread
removal can both delete messages and unlink calls.

Only verified backend code writes these tables. Authenticated owners can read
them through RLS; anonymous users have no access. A call's owner must match its
conversation, and call messages must reference that same conversation. A
trigger protects the link from existing browser call INSERT/UPDATE privileges.
No arbitrary metadata, system prompts, reasoning, memory injections, or raw
audio belong in the visible text parts.

Use TanStack AI for the new Next.js chat runtime. Conversation IDs map to
`threadId`; durable message IDs map to `UIMessage.id`. The text-part shape is
`{ type: "text", content: string }`. Vercel AI SDK consumers for speech-script
annotation and call analysis remain independent of this schema work.

TanStack's [MessageStore](https://github.com/TanStack/ai/blob/22f7c73123ee02a39ed24e934a2ae872a7af2f29/packages/ai-persistence/src/types.ts)
replaces a complete authoritative transcript. The later adapter must lock the
conversation, verify its expected revision and admitted run, and reconcile rows
atomically. An append-only implementation does not satisfy that contract.
Pagination and model input bounds remain separate from full transcript storage.

This migration does not enforce exclusive chat/call admission, reserve credits,
settle tokens, extract memory, or implement resumable streams. Add those with
the runtime work and its tests. TanStack persistence and its per-run durability
log are separate; message rows alone cannot replay a stream.

## Alternatives considered

- One growing transcript JSON per thread makes pagination, independent
  corrections, source deduplication, and stable message identity harder.
- One thread per user/character prevents the requested future thread menu.
- Using call sessions as threads makes a text-only chat depend on voice records
  and cannot naturally contain several calls.
- Replacing the call transcript JSON breaks existing diagnostics and analysis.
- A browser-writable transcript bypasses request admission and lets the client
  forge context. Server writes keep one authority across Next.js and Python.
- Adding run, wallet, memory-work, and chunk-log tables in this slice would
  choose unimplemented adapter contracts without their transactional tests.

## Acceptance criteria

The [pgTAP suite](../../../../apps/web/supabase/tests/conversations.test.sql)
passes against migrated local Supabase. It covers ownership, grants, stable
identity, positions, revisions, visible text validation, duplicate source items,
call ownership, legacy browser call writes, and history retention on deletion.
The [generated types](../../../../apps/web/lib/supabase/types.d.ts) match the
migrated local database. Add queries through those schema-derived types.

## Risks

Schema constraints do not implement atomic admission or protect against stale
backend writers on their own. Later writers must acquire the thread lock before
writing rows and release user admission only after history and billing finalize.
Character access and paid scene/custom-character entitlements are server checks.
The migration adds indexes and constraints to `call_sessions`; review deployment
locking against production table size. Apply through migration history only.

## Verification

The migration is applied and recorded in isolated local Supabase on database
port 55322. The full pgTAP suite passes: eight files, 130 assertions, including
all 48 conversation assertions. Types are generated from this applied schema.
Repository TypeScript checks and scoped `fixall` pass with those types. The web
unit suite passes 2,199 tests in 143 files; 18 tests are skipped. SQL and
procedural syntax also parse offline; Biome does not check SQL. Production is
unchanged. Runtime admission, billing, replay, and Python integration need their
own later verification.
