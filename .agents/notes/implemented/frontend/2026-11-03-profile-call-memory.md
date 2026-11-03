# Profile call memory

## Decision

Reapply the memory change from PR #527 on current main. Enable memory by
default for free and paid accounts. Put the switch in the Profile page's
existing Voice Call Memory card, above the separate delete action. Keep the
call page and its modals free of memory controls.

Save `call_memory_enabled` through the browser client's `auth.updateUser()`.
Resolve it with `lib/call-memory.ts`. Auth metadata stores a user preference;
paid entitlements and ownership checks remain separate.

Read current Auth data when issuing a memory-enabled call token. A stale
JWT must not override a saved opt-out, including on another device. Failed
preference reads log a warning and disable memory for the call. Explicit
`memory: false` requests
remain an additional opt-out. The setting applies at call start; it does
not change active calls or delete stored memories.

## Alternatives

- Merging the original branch carries conflicts in deleted call components
  and translation keys. Reuse its default and payload tests instead.
- A call-panel toggle conflicts with the requested Profile-only placement.
- Local storage limits the preference to one browser. A database column
  requires a migration for a preference Auth metadata can already store.
- JWT metadata can retain an outdated preference until the token refreshes.

## Verification

- `pnpm fixall`, `pnpm type-check`, translation checks, and `git diff --check`
  pass. English and Spanish privacy content builds through Contentlayer.
- Focused schema, payload, route, and profile UI coverage passes: 96 tests.
- The full web run passes 2,013 tests in all 138 files, with 18 skipped tests.
  The Redis suites require local socket access outside the sandbox.
- Preference tests cover free calls, absent preferences, explicit per-call
  opt-outs, stale JWT metadata, failed reads, and a changed account setting
  applied to the next call. UI tests cover saving both values, failed saves,
  and disabling the switch while saving.

## Agent compatibility

Verified against `gianpaj/sexycall` main at
`c5f2f76e4e267620fc305b7820123edba2712bfa`, with its locked LiveKit 1.6.10
packages. The web token's `memory` boolean maps to
`parse_session_config().memory_enabled` for both
`grok-voice-think-fast-1.0` and `inworld-tts`.

Both paths share memory initialization and the awaited job shutdown callback.
Enabled calls seed chat context from the search RPC and save extracted facts
to `agent_memories` under the authenticated user and `__shared__` scope.
Disabled calls perform neither memory reads nor writes. Shutdown flush runs
at most once.

Grok's server-side turn detection bypasses `on_user_turn_completed` in the
locked SDK. Its memory consists of startup preload and shutdown persistence;
per-turn retrieval does not run. Inworld's STT-driven cascade can run that
hook. This limitation exists in the checked agent main branch. See
[LiveKit's realtime turn detection requirement](https://docs.livekit.io/agents/logic/nodes/#on-user-turn-completed).

Verification passes 72 existing agent tests plus five isolated lifecycle and
SDK checks, and all 62 web generation-route tests including the Inworld
preference cases. Agent checks use an exact-main snapshot under `/tmp`, real
model constructors, and fake embedding, extraction, and database boundaries.
No live calls or production data writes are part of this verification.

## Review decisions

An unreadable preference disables memory and logs a warning while allowing the
call to start. This respects every opt-out without making optional memory an
availability dependency. The lookup overlaps voice and character resolution.

Default-on collection follows the requested product behavior. It does not
record affirmative consent, and the review objection about consent remains
open. The implementation does not establish a lawful basis for collection.
