# Agent Note: Chat-first conversations

Status: proposed — local Inworld pilot implemented on the call page

## Problem

The call entry flow requires a microphone and a live voice session before a
user can converse. Users need a familiar mobile chat with streamed replies,
an explicit call button, and credit charges that match the selected mode.
Connection failures must not lose accepted messages or charge them twice.

## Proposal

Open a saved character conversation as chat. Next.js streams text with TanStack
AI and adapted shadcn AI Elements visual patterns. Starting a call creates a LiveKit
session; Python seeds it from the owned conversation and appends committed
call turns. Chat and calls share history and the credit wallet.

Only one generation or call runs per user. Chat reserves bounded credits and
settles once from authoritative token usage. The agreed rate version is
`grok420-chat-v1`: 50 / 10 / 100 credits per 1,000 uncached input / cached input /
output tokens. Free and paid users consume credits at the same rate. Calls
retain minute metering. Browser mute also gates Python audio input. Text mode
has no voice session. Resume the accepted reply after disconnect without
automatically regenerating. Keep saved-message recovery for producer failure.

The [plan](../../../../plans/2026-11-16-chat-first-conversations-and-calls.md)
owns the cross-repository contract, proposed failure policy, component and SDK
sources, calculations, trial-cost estimates, readiness gates, and network test
matrix. Start with the approved thread/message migration and pgTAP suite in
Sexyvoice; add TanStack adapters, durable delivery, and pricing transactions in
the following slice. Keep existing Vercel SDK features independent.

The [context source review](../../../../plans/2026-11-16-conversation-context-and-stream-recovery.md)
records the supplied Vercel/TanStack designs and inspected implementations.
Track stable threads and individual messages for text and voice. The thread
menu can follow later. Show `Thinking…` until visible answer text arrives.

Both modes use the existing Supabase long-term memory and saved preference.
The proposed Python backend interface keeps preload, retrieval, extraction,
and verification in one implementation. Persist incremental extraction work,
serialize writes per user, and prevent queued work from recreating deleted
memories. Starting a thread does not reset shared or character memories.

### Pilot runtime

The first Inworld TTS pilot uses SexyCall's Python LiveKit worker for calls,
including typed turns during a call. Next.js retains standalone TanStack AI chat.
Both modes share Supabase conversation history and admission. Reusing Python
keeps the existing voice metering, limits, memory writes, and incident tooling.

The [runtime comparison](../../../../plans/2026-11-23-sexycall-inworld-chat-assessment.md#side-by-side-decision)
records the alternatives and the first-pilot acceptance check. The JS worker
provides browser and thread-integration evidence for that check.

SexyVoice owns the [shared contracts](../../../../packages/voice-chat/contracts/README.md).
SexyCall tests a pinned dispatch schema and generates its RPC types from the
migrated database. The Postgres tests cover shared history and admission.

Paid, allowlisted local users open chat from an owned Inworld character on
`/dashboard/call`. The phone button dispatches the `sexycall-inworld-chat`
worker using the current thread ID. The keyboard button releases browser
capture and waits for the worker to disable audio input before enabling Send.
The character still speaks. A microphone button returns to voice, and the
conversation button opens the complete visible thread with jump-to-latest.
Grok Realtime keeps its existing voice controls.

Python continues to write the legacy call transcript for existing operational
tooling, while shared message rows supply the thread. Next.js chat records
token usage with the reply run. Customer credit settlement for standalone chat
and text-only replies during a call remain open pilot decisions.

The local Playwright test verifies Inworld playback, auto-mute, recall of a
pre-call message, and persistence after reload in Chromium and Firefox at a
390px viewport. Physical Safari and longer paid test calls remain unverified.

## Alternatives considered

- [In-call interleaving first](../../rejected/feature/2026-11-16-in-call-text-and-microphone-mute.md)
  does not provide the user's selected chat entry flow or token-based pricing.
- An always-connected LiveKit chat opens the voice infrastructure before the
  user asks for a call and complicates microphone and billing boundaries.
- Independent histories for the two modes lose the conversation at call start
  and hangup. A shared durable conversation keeps the transition understandable.
- Snapshot-only recovery cannot resume an active reply as requested. TanStack's
  per-run durable log retains produced chunks across processes; saved history
  remains available after log retention expires. A dead provider request still
  requires reconciliation and explicit Retry.
- A growing JSON transcript lacks message identity, independent corrections,
  and efficient pagination. Keep parts as JSONB within individual message rows.
- Vercel AI SDK with the reviewed `resumable-stream` integration keeps an
  existing dependency but relies on a process-local producer buffer. The user
  selected TanStack for the new chat path and durable delivery. Its adapters
  still need ownership, billing, Python integration, and conformance tests.
- Porting memory extraction to TypeScript duplicates verification and correction
  rules. A shared Python interface keeps those rules in one place.
- Pricing at 10 / 2 / 20 increases the model-cost allowance for a fully spent
  trial fivefold. Pricing at 100 / 20 / 200 shortens the trial. The selected
  middle rate keeps a useful trial with room for other product costs.

## Acceptance criteria

A mobile user can stream chat without microphone access, recover an accepted
reply after a network drop with one charge, start a call with the same context,
mute without forwarding new STT frames, and continue texting after hangup.
Stable threads contain both text and voice turns. The active reply resumes
without duplicate text or another charge. Thinking state survives reload.
Enabled memory reads and writes apply to both modes. Tests exercise the real
Next.js/Python handoff, replay, memory work, and database settlement boundaries.

## Risks

A maximum reservation must not strand a smaller affordable balance. The trial
cost estimate covers metered tokens; refunded or unreported provider attempts
can add spend. Server termination can leave incomplete usage; reconcile expired
reservations without fabricating charges. Call finalization and seeded-history
filtering must prevent duplicated messages and duplicate memory extraction.
Mobile media permissions and background audio need device verification beyond
emulation. The memory interface and selected shared durability backend need
deployment verification. Memory extraction/check calls and embeddings add
cost beyond the metered chat-token estimate. New threads retain enabled
long-term memory; forgetting remains a separate user action.
