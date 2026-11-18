# LiveKit Agents JS: shared chat and voice spike

Status: internal JS call works with real providers. macOS Firefox retest,
saved-clone parity, shared history, and deployed mobile calls remain open.
Written 2026-11-16.

## What the internal call established

The [JS call runbook](../apps/voice-agent/README.md) owns setup, package pins,
browser results, and operational limits. Next.js issues a token for the
allowlisted JS worker. The browser sends media over LiveKit WebRTC, and the
persistent Node 24 worker runs the cascade. The call has a five-minute cap.
`packages/voice-spike` shares the dispatch and mute contracts with the web app.

The tested cascade matches SexyCall's `inworld-tts` model defaults:
`grok-voice-transcribe-2.0` → LiveKit Inference
`xai/grok-4.20-0309-non-reasoning` → direct `inworld-tts-2` in `BALANCED`
mode. Both use STT turn detection and Silero VAD for interruptions. The JS
worker fixes the language to English, the voice to `Ashley`, and the reply
budget to 256 completion tokens. The scoped xAI plugin patch pins the STT
model on the wire.

Typed turns bypass STT, enter the same in-memory history as spoken turns, and
produce a spoken reply and a transcript. A synthetic-mic call recalled a
typed fact in a spoken turn. The mute test produced no transcript for the
muted utterance and accepted fresh speech after unmute. A provider-side check
for forwarded audio frames during mute remains open. Each call starts with
fresh history. In-call typing exercises the shared session for this demo;
the [product plan](2026-11-16-chat-first-conversations-and-calls.md) owns the
chat and call UX.

Playwright Chrome and Linux Firefox passed live calls with typed replies,
Inworld playback, mic toggle, and hangup. Default bundling failed ICE in the
Linux Firefox test. The spike uses LiveKit's public `max-bundle` option for
desktop Firefox, and the user confirmed typing and speaking in Safari. The
remaining manual JS demo check is Firefox 160 on macOS: connect, hear the
greeting, type a message, speak a message, toggle mute, and hang up. Record
the result and browser version. The [runbook's browser section](../apps/voice-agent/README.md#browser-transport-findings)
also tracks the separate Python call page regression check for the shared
browser SDK upgrade.

## Next experiment

Use a saved Inworld clone in a dedicated test LiveKit project. Resolve the
caller's `audio_references` row by ID, owner, and provider before opening
providers, then pass its Inworld `voice_id` to TTS. Compare JS and Python with
the same voice, language, prompt, and turn policy. Measure first audio,
interruption, delivery across successive replies, and provider usage. Python
passes up to five previous replies within 1,500 characters to Inworld's
`synthesisContext.previousRequests`; the JS worker currently sends no
synthesis context. Test whether that difference affects delivery before
choosing how to carry it over.

The demo establishes that Agents JS can run the cascade, so continue with it
as the next runtime candidate. Shared chat and call history, pgvector memory,
billing, and deployed 30–60 minute mobile calls remain part of the runtime
decision.

## Question and outcome

Can a LiveKit Agents JS worker in the Sexyvoice TypeScript monorepo run our
xAI STT → Grok 4.20 → Inworld TTS calls, share context and pgvector memory
with TanStack text chat, and retain reliable 30–60 minute mobile calls?

The output is a measured recommendation, a small internal demonstration, and
an explicit list of production gaps. Start with the official Node framework
instead of rebuilding its media pipeline. Preserve the Python worker as the
comparison and fallback throughout the experiment.

The [product plan](2026-11-16-chat-first-conversations-and-calls.md) owns UX,
credit rates, free-credit estimates, and failure policies. The
[context plan](2026-11-16-conversation-context-and-stream-recovery.md) owns
relational history and text resumption. This experiment complements the
[Next.js WebSocket spike](2026-11-16-tanstack-nextjs-voice-spike.md); it does
not select a production replacement merely because one call works.

## Proposed shape

- `apps/web`: Next.js authentication, character configuration, the mobile chat
  view, TanStack text generation/resumption, and call-token issuance.
- `apps/voice-agent`: a persistent Node.js 24 LiveKit worker. LiveKit owns
  browser media transport, turn handling, interruptions, and call text streams.
- `packages/conversations`: only the contracts and server helpers actually
  used by both apps: validated visible messages, context conversion, owned
  history, admission, and usage normalization. Keep framework adapters local
  to their apps. Do not import Next.js internals into the worker.
- Supabase: authoritative threads, messages, call records, and existing memory.
  Reuse the planned operations and delivery contracts as they are implemented.

This gives one repository and language, with two deployment units. Next.js can
stay on Vercel; the voice worker runs locally first, then in a separate Fly.io
test app near the current media/providers. LiveKit Cloud hosting is an
alternative if Fly requires material extra setup. Pick one host for the soak.
The browser connects to LiveKit for calls, so a call does not depend on one
long-running Vercel request. Provider limits, worker restarts, and mobile
disconnects still need testing. See [agent hosting](https://docs.livekit.io/deploy/agents/).

Ordinary chat creates no LiveKit room or voice worker job. On a call, recent
saved dialogue seeds the agent. On hangup, committed call messages return to
the same thread before another text generation starts. Keep TanStack as the
text runtime; do not add a TanStack-to-LiveKit LLM adapter during this spike.
Both runtimes receive the same server-resolved character and scene context.

## Source baseline and compatibility checks

Research snapshots are source evidence, not proof of published package support:

- Agents JS commit `6efe6e31f69e88ec1fe5ed8acfbbf33d7ea4dbbc`:
  [session and history](https://github.com/livekit/agents-js/blob/6efe6e31f69e88ec1fe5ed8acfbbf33d7ea4dbbc/agents/src/voice/agent_session.ts),
  [ChatContext](https://github.com/livekit/agents-js/blob/6efe6e31f69e88ec1fe5ed8acfbbf33d7ea4dbbc/agents/src/llm/chat_context.ts),
  [audio controls](https://github.com/livekit/agents-js/blob/6efe6e31f69e88ec1fe5ed8acfbbf33d7ea4dbbc/agents/src/voice/io.ts).
- Official Node starter commit `c05b8564c59e1e546b65f9d06496ca12daee7a09`:
  [worker entrypoint](https://github.com/livekit-examples/agent-starter-node/blob/c05b8564c59e1e546b65f9d06496ca12daee7a09/src/main.ts)
  and [package configuration](https://github.com/livekit-examples/agent-starter-node/blob/c05b8564c59e1e546b65f9d06496ca12daee7a09/package.json).
  Reuse lifecycle and packaging patterns; choose our existing providers and
  turn policy rather than copying the starter's models or greeting.
- The official [Inworld plugin](https://github.com/livekit/agents-js/blob/6efe6e31f69e88ec1fe5ed8acfbbf33d7ea4dbbc/plugins/inworld/src/tts.ts)
  supports bidirectional streaming and direct Inworld authentication. Use this
  path for saved workspace voices; LiveKit Inference does not expose existing
  custom Inworld voices. See [Inworld integration](https://docs.livekit.io/agents/models/tts/inworld/).
- The inspected [xAI STT plugin](https://github.com/livekit/agents-js/blob/6efe6e31f69e88ec1fe5ed8acfbbf33d7ea4dbbc/plugins/xai/src/stt.ts)
  does not expose a model selector or send a model query parameter. Python's
  `src/xai_stt.py` explicitly pins `grok-voice-transcribe-2.0`. Verify the
  selected release and wire request; never silently accept a provider default.
- Python's `src/inworld_voice.py` adds `synthesisContext.previousRequests`
  with up to five replies and 1,500 characters. The inspected JS plugin has
  no equivalent option. Test delivery consistency and identify the smallest
  supported extension or isolated package patch. Record this as a parity gap
  until measured; do not silently remove contextual synthesis.
- [Text and audio examples](https://docs.livekit.io/agents/multimodality/text/)
  cover text-only operation and dynamic audio controls. Their switches are
  building blocks; prove muted frames cannot reach our STT connection.

The behavioral baseline is Sexycall's `src/voice_pipeline.py`,
`src/inworld_voice.py`, `src/session_manager.py`, `src/supabase_memory.py`,
`src/memory_extraction.py`, `src/billing_session.py`, and
`src/transcript_collector.py`. Record the exact baseline commit with results.

## Stages and stopping points

### 1. Dependency and provider feasibility

The local Node 24 worker and the model pins are verified with Ashley. The
target image, saved-clone parity, provider usage, and cancellation measurements
remain open.

1. Check registry versions, release age, peer dependencies, and native
   `rtc-node` support for Node 24 and the target Linux image. Pin a compatible
   published set in pnpm; GitHub `main` versions can differ from npm releases.
   Build and boot the worker image before running the deployed tests.
2. Probe the exact baseline stack: `grok-voice-transcribe-2.0`, LiveKit inference
   `xai/grok-4.20-0309-non-reasoning`, and direct `inworld-tts-2` with the saved
   voice, language, and `BALANCED` delivery mode. Verify streaming, cancellation,
   provider usage, and the actual STT model parameter. Model IDs differ between
   the direct xAI chat API and LiveKit inference; test each endpoint explicitly.
3. Match Python's STT turn detection and VAD interruption policy first. Measure
   any newer semantic or adaptive policy separately; changing the turn policy
   would confound the runtime comparison.
4. Write focused contract tests before any STT-model or synthesis-context patch.
   Prefer public extension points; keep a necessary pnpm patch attributed and
   isolated. Stop if parity requires maintaining a broad framework fork.

Deliverable: a pinned compatibility table with working, missing, or blocked
capabilities and one bounded live provider smoke test. Proceed only if the
core cascade works or a small, testable compatibility patch resolves the gap.

### 2. One internal call

The internal page, JS-only dispatch, live transcription, mute controls, and
five-minute cap are implemented. Local calls used the configured LiveKit
project and a disposable local Supabase account.

1. Move the next experiment to a dedicated test LiveKit project with synthetic
   accounts. Use the existing authenticated token route and `sexyvoice-js-spike`
   dispatch.
2. Derive user, character, voice ownership, scene, language, and memory
   preference on the server. Reuse the context plan's operation contract to
   admit one call per user transactionally before issuing a token. Implement
   that minimal local migration if the shared admission slice is unavailable.
   Bind the accepted operation to the room and verified participant; the worker
   claims and revalidates it before provider startup, heartbeats it, and releases
   it after finalization. Browser metadata cannot select another user's data.
3. Use the existing internal page to verify interruption and provider cleanup
   with the saved voice. Then confirm iOS audio unlock and microphone permission
   from the call gesture.

Deliverable: one real mobile call with timing and usage measurements. No
customer credit writes; shadow accounting records provider spend separately.

### 3. Chat → call → chat with saved context

1. Add a minimal internal mobile chat using TanStack and adapted shadcn AI
   Elements patterns. Messages use normal chronological DOM order, newest at
   the bottom; preserve drafts and reading position. Keep the composer below
   the messages and the phone button at the top right. Reuse an available
   chat implementation; a temporary test endpoint is not the public feature.
2. Use `conversations` and `conversation_messages` from
   `20261116140000_create_conversations.sql`. The migration supplies history,
   not operations, writer fencing, wallet reservations, or durable stream logs.
   Extend stage 2's shared admission with the transactional message-writing
   slice needed here, following the context plan. Use local migrations and
   pgTAP; do not create a second admission service for the JS worker.
3. Extend admission to TanStack text generations, preserving one generation or
   call per user across tabs, devices, and characters. Test chat/call races,
   duplicate token requests, expired startup, stale workers, and delayed
   finalizers. Reconnect reattaches the accepted operation rather than admitting
   another one.
4. Load owned history from the database in `position` order. Seed a bounded
   `ChatContext` with stable IDs and interruption flags; inject character,
   scene, and memory separately. Reuse the context plan's token budget and
   truncation policy in both runtimes. A history failure returns to chat.
5. Persist newly committed call items idempotently by call ID and SDK item ID.
   Seeded messages must not reappear as new speech. Reconcile corrections and
   interrupted assistant text from SDK-committed output, not the full generated
   reply. Serialize writes with thread revision checks and operation fencing.
6. On hangup, flush call history, finalize once, then release admission. Fetch
   the saved revision before enabling text sending. If flushing fails, show
   recovery state and keep the draft; do not reply from incomplete history.
7. Keep TanStack text replay distinct from call reconnection. Test the shared
   durable stream adapter with a dropped text connection: replay must attach
   to the same operation, invoke no model, and add no charge. A dead producer
   yields an interrupted snapshot and explicit Retry. If this adapter is not
   implemented, report resumption as unverified rather than substituting a
   process-local buffer. Never replay call audio after reconnect.

Deliverable: reloadable shared history demonstrating a detail introduced in
chat, recalled in the call, and used by the next text reply, without duplicates.
Multiple saved threads remain possible; a thread menu is outside this spike.

### 4. Mute, memory, and accounting parity

- Chat requests no microphone and creates no STT/TTS clients. Call microphone
  mute stops browser capture/publication promptly and disables worker input
  before acknowledging the requested state. Ignore late callbacks and discard
  buffered muted speech. Unmute starts with fresh audio; it cannot replay the
  muted interval. Test lost/reordered mute acknowledgements and reconnect
  while muted. Output mute is independent and must not implicitly mute input.
- Show `Thinking…` after Send through the first visible text, including server
  wait; voice uses the agent's thinking state until speaking or failure. Clear
  transient indicators on stop, error, or disconnect. Do not persist them or
  expose model reasoning. Keep microphone-denied chat usable and retain drafts
  when call startup fails. In-call typing remains outside the first product
  flow; no second generation can race an active call.
- Reuse `agent_memories`, the hybrid search RPC, existing embedding dimensions,
  saved opt-in, and shared/character scopes. Begin with preload and overflow
  retrieval fixtures shared with Python. Keep memory guidance and the cascade
  pre-response retrieval hook; never inject recalled facts as visible turns.
- Exercise extraction, verification, correction/deletion, and outage fixtures
  against disposable local data. Serialize memory writes per user, exclude
  seeded history from extraction, and keep one writer for each accepted range.
  Preserve hard boundaries and fail-closed checking. A memory outage must not
  terminate the call. Any unported extraction behavior blocks a full JS cutover;
  a temporary Python dependency must be explicit in the recommendation.
- Run the existing call-metering rules in shadow mode: clock start, first-speech
  eligibility, 30-second intervals, exhaustion, and finalization. Simulate wallet
  responses; do not debit real wallets. Compare Python and JS outcomes for the
  same fixtures. Text retains `grok420-chat-v1` rates from the product plan.
  A reconnect must not create another reservation, greeting, or charge.
- Capture uncached/cached/output LLM usage, STT duration, and submitted TTS
  characters, including cancelled attempts. Incomplete usage stays unpriced;
  never turn missing usage into zero spend. Include worker hosting and LiveKit
  media/inference charges in the cost comparison without double-counting them.

Deliverable: parity results with explicit failures and unimplemented behavior.
An audible demo alone cannot satisfy memory or billing readiness.

### 5. Mobile, network, and real-duration validation

Use iOS Safari and Android Chrome on physical devices for media and network
checks. Playwright covers UI/state transitions; mocked tracks do not prove
mobile audio or WebRTC packet-loss behavior. Run the worker in its target
container/host and the frontend in preview for the deployed tests.

| Experiment             | Required observation                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| Chat only / denied mic | Text streams with Thinking; no capture, room, STT, or TTS; failed call setup retains draft                     |
| Shared thread          | Chat → call → chat → reload preserves IDs, order, corrections, and interrupted output                          |
| Mute                   | No PCM forwarded to STT after acknowledged mute; no buffered speech on unmute; reconnect stays muted           |
| Interruption           | User speech stops stale audio; late LLM/TTS events cannot contaminate another turn                             |
| Text reconnect         | Same operation and delivery cursor; no regeneration, duplicate message, or repeated settlement                 |
| Concurrency            | Another tab/device/character cannot start work; reconnect reattaches the admitted operation                    |
| Poor network           | 400 ms RTT, 1 Mbps, 3% packet loss; bounded latency/queues and an explicit reconnecting state                  |
| Offline                | 5/30/90-second outages; no old audio replay or overlapping workers; lost audio is not invented                 |
| Device lifecycle       | Screen lock, background/foreground, Bluetooth route change, permission revoke, and reconnect while muted       |
| Real calls             | Actual 30- and 60-minute sessions; record every provider reconnect, audio gap, resource trend, and usage total |
| Worker failure         | Graceful drain and forced process loss; durable history survives and admission expires safely                  |
| Ownership              | Forged thread/character/voice/room/operation claims fail before provider spend                                 |

Apply packet loss and bandwidth constraints to media as well as HTTP; browser
request throttling alone is insufficient. Record the shaping method and actual
observed conditions. Mark unsupported background behavior honestly instead of
promising mobile operating systems will keep an active microphone indefinitely.

Transient network reconnect may retain the same worker/session. A dead worker
does not have an automatically resumable LiveKit session: finalize the lost
operation and offer explicit redial from durable history. No automatic redial
or replay of the previous greeting. Use 90 seconds as the spike's recovery
cutoff: end the attempt visibly and permit retry once server admission has
been reconciled. Review this provisional timeout against mobile results before
adopting it as product behavior.

Run at least 20 paired scripted turns per runtime under the same region,
providers, voice, language, and turn settings. Report end-of-speech → first-audio
and text time-to-first-visible-token p50/p95, with sample counts. Investigate a
JS first-audio p95 regression over 300 ms versus Python. That is a provisional
decision threshold, not a measured result. Record interruption-to-audio-stop
latency and reconnect gaps separately. Do not use a mocked clock as a long soak.

### 6. Decision report

Record versions, commits, deployment/region, device/browser, network method,
scenarios, timing, usage/cost, and remaining gaps. Link commands and redacted
artifacts so another engineer can repeat the experiment. Compare with Python
and the existing custom relay only where comparable measurements exist.

Recommend Agents JS if the exact provider pipeline, shared context, mute,
interruption, memory, accounting, and long mobile calls work with a small
maintainable integration. Keep Python if the JS path needs broad SDK patches or
fails those requirements. Stop extending the custom relay if LiveKit supplies
the same behavior with less owned media code.

A production migration needs a separate implementation decision, complete
memory and billing parity, operational monitoring, and a staged rollback plan.
Do not remove Python, switch public dispatch, add a thread menu, redesign the
call UI, port unrelated voice providers, or promise seamless crash recovery
as part of this experiment.

## Implementation bounds and verification

Allow only explicit test users in development/preview, with production blocked
at token issuance and worker startup. Use synthetic dialogue and a dedicated
LiveKit project. Keep the five-minute cap for short probes and record actual
spend before the soak. For the deployed 30/60-minute sessions, use a hard
65-minute cap, bounded output/context, and one admitted operation. Keep transcript
content, prompts, memory, raw audio, and credentials out of diagnostic logs.

Write contract tests before modifying lifecycle, context, or provider behavior.
Use Vitest for adapters/state and pgTAP for transactional ownership/admission;
include abrupt shutdown, retries, and stale callbacks. Run focused tests per
slice, `pnpm fixall`, `pnpm type-check`, and relevant web E2E before a code push.
Apply any new migrations only to the isolated local project with
`supabase migration up --local`, then run `pnpm test:db` and generate types.
Keep ports separate from other worktrees. Only the user applies production
migrations. Update the owning Agent Note as results change the recommendation.

Port the SexyCall behavior tests with each JS slice. Use the same inputs and
expected outcomes where the behavior is shared. Keep the Python suite as the
baseline for its worker.

| SexyCall coverage                                                              | JS coverage to carry over                                                                                        |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `test_inworld_voice.py`                                                        | Owned clone resolution, streamed provider request and cancellation, reply context, and incomplete provider usage |
| `test_memory.py`, `test_supabase_memory.py`, `test_memory_extraction.py`       | Opt-in, scope, preload, overflow retrieval, checked updates, and outages                                         |
| `test_billing_buckets.py`, `test_call_tracker.py`, `test_credit_exhaustion.py` | First speech, minimum duration, bucket boundaries, low balance, exhaustion, timeout, and meter/finalize races    |
| `test_call_sessions.py`, `test_final_usage.py`                                 | Concurrent admission, stale sessions, finalization, and accounting with unavailable costs                        |

Implementation slices: compatibility probe → internal call → shared history
and admission → mute/memory/accounting → deployed mobile soaks → recommendation.
Stop at a failed prerequisite and report it; do not build later layers to hide
an unresolved provider or runtime limitation.
