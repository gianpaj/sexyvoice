# Agent Note: Next.js voice runtime spike

Status: proposed — JS browser/provider call verified locally; runtime and mobile parity pending

## Problem

Chat and calls need one conversation context. The proposed product spans
Next.js and a Python LiveKit agent, which adds deployment and type boundaries.
It is not established whether replacing the voice worker reduces operating
complexity while retaining reliable long mobile calls.

## Proposal

Evaluate the pinned TanStack live-transcription PR with a Next.js TypeScript
cascade and Inworld TTS. Keep the production call flow separate. The
[spike plan](../../../../plans/2026-11-16-tanstack-nextjs-voice-spike.md) owns
experiments, safety bounds, source references and acceptance criteria.
The [product decision](../feature/2026-11-16-chat-first-conversations.md)
retains ownership of chat UX, pricing, history and shared-memory requirements.

Vercel WebSockets inherit function duration. A 60-minute logical call needs
reconnection and external recovery state even with the 30-minute duration beta.
The upstream PR implements STT; the application still owns turn orchestration,
playback, cancellation, persistence, memory and billing.

## Probe boundary

The [internal runbook](../../../../apps/web/lib/voice-spike/README.md) owns the
wire contract, test configuration and implemented limits. Production is blocked;
only configured test users can connect. The first probe has connection-local
history and short leases, so its passing local tests establish neither durable
recovery nor long-call viability. It reuses the exact Grok 4.20 model through
TanStack's model-extension API and keeps the unmerged STT code attributed and
isolated. Memory and customer billing remain production-readiness gates.

Audio uses 24 kHz PCM and waits for each socket write before pulling another
provider chunk. A five-second stalled write ends the probe. This bounds burst
buffering and leaves bandwidth for the planned 1 Mbps network experiment;
48 kHz base64 PCM alone would exceed that profile. Transport completion is not
a playback acknowledgement. Interrupted history keeps the emitted text prefix
and excludes late chunks; heard-audio reconciliation requires client playback
acknowledgements in the mobile experiment.

## JS comparison boundary

The [JS call runbook](../../../../apps/voice-agent/README.md) owns the first
browser demo and its evidence. A persistent Node 24 worker shares this
repository with Next.js, while LiveKit carries media. Explicit JS dispatch
and a runtime handshake keep its microphone from connecting to Python.
The xAI plugin has a scoped model-selection patch with a wire contract test.

A synthetic browser microphone exercised real speech and typed turns in one
session, including mute/unmute. The local result supports continuing this
comparison. It does not establish database context, pgvector parity, shared
admission, billing, iOS reliability, or deployed duration. Each call starts
fresh, and the internal demo has a five-minute limit and no wallet writes.
The [saved voice comparison](../../../../apps/voice-agent/README.md#saved-inworld-voice-comparison)
uses the same owned Inworld clone in both runtimes. The token route reuses
the signed-in Supabase lookup and creates the clone's LiveKit room with a
named agent dispatch. A signed join token is readable by the browser, so it
carries only the room grant for this path. The default Ashley path keeps
dispatch on first join. Pre-creating the clone's room adds one LiveKit API
round trip and leaves a short-lived empty room if the browser leaves.
A worker-side lookup would require separate Supabase credentials for this
probe. The [JS spike plan](../../../../plans/2026-11-16-livekit-agents-js-spike.md#next-experiment)
records the dispatch check and the remaining real-clone comparison.

The 60-second startup deadline reports a connection failure until browser WebRTC connects.
Only a connected browser waiting for the JS runtime reports a missing worker;
a stalled runtime handshake reports a connection failure. This distinction avoids
diagnosing blocked ICE as a stopped worker. Runtime discovery waits for media
connection before sending RPCs or opening the microphone. A reconnect before
runtime discovery keeps the startup deadline rather than rejecting the call.

The JS demo gives Firefox `rtcConfig.bundlePolicy = "max-bundle"` through
LiveKit's public connection options. This shares one ICE/DTLS transport across
the SDK's initial media sections. Chrome, Safari, and iOS Firefox keep defaults;
the Python call UI retains default bundling. The web app shares one SDK pin,
so the 2.23.0 to 2.24.1 upgrade also affects the Python flow. Real Chrome and
Safari calls through `/dashboard/call` remain a merge gate; JS demo tests do
not cover them. Python-flow Firefox connectivity is also unverified. See the
[browser evidence and remaining checks](../../../../apps/voice-agent/README.md#browser-transport-findings).

LiveKit 2.24.1 with default bundling fails ICE in Linux Firefox 153. The same
SDK with max-bundle connects through TURN/TLS and receives decoded audio.
Two consecutive application calls pass text, audio playback, mute/unmute, and
hangup in both Firefox and Chrome. These results identify a working configuration;
they do not establish the underlying browser/server defect. The user reports
Safari typing and speaking work. Firefox 160 on macOS still needs a user retest;
Safari device coverage, interruption, network recovery, and long calls remain
acceptance work. Linux WebKit is not a substitute for Safari devices.

The [browser verification log](../../../../apps/voice-agent/README.md#browser-transport-findings)
also records successful phone playback over Tailscale with the default voice,
after an empty call-token POST passed validation on the live demo.

Forced reconnect diagnostics are absent from the application. Safari logs
collected during a forced-reconnect experiment and Fast Refresh show SCTP
channel closure; they do not isolate a stable-build failure.

Remote development uses the configured `NEXT_PUBLIC_SITE_URL` as an exact
additional origin for the internal token route; forwarded host headers cannot
select it. A private HTTPS proxy covers microphone capture and a second proxy
makes the isolated Supabase API reachable from the testing device. This is a
development-only origin exception, with a regression test for scheme/port and
hostname mismatches.

## Alternatives considered

- Downgrade LiveKit or patch its preallocated media layout: isolated Firefox
  calls work with 2.17.0 and with the layout removed from 2.24.1. Both add
  maintenance or lose upstream fixes. The public max-bundle option works with
  the pinned SDK and preserves its media layout. Relay-only mode, dual peer
  connections, longer startup deadlines, and early microphone capture did not
  resolve the reproduced failure. Forced TLS diagnostics were inconsistent.

- [LiveKit Agents JS in this repository](../../../../plans/2026-11-16-livekit-agents-js-spike.md):
  the preferred next comparison. It keeps LiveKit media handling and TypeScript
  while requiring a persistent worker alongside Next.js. Its spike must verify
  provider compatibility, shared history, memory, billing, and mobile calls
  before runtime selection. This alternative remains under evaluation.
- Keep Python/LiveKit: a tested voice runtime, but retains two languages and
  deployment units. Keep it available until the experiment demonstrates parity.
- Direct provider media: avoids the Vercel relay lifetime, but changes trusted
  control over context, usage and billing. Compare only if relay results warrant it.
- Persistent Node hosting in this repository: keeps TypeScript and one codebase
  while adding a long-running service. Compare if function rotation is disruptive.

## Acceptance criteria

A real mobile cascade and text chat share context. Deployed 30/60-minute calls,
forced rotations, mute, interruption and bad-network recovery pass the plan's
experiments. Memory and credit semantics retain their approved contracts.

### Conversation history

The internal JS call uses the shared `conversations` and
`conversation_messages` tables. The worker appends committed visible turns
and seeds LiveKit from bounded history on redial. An expiring local-only call
lease prevents competing spike workers from writing the same user's history.
Dedicated demo rows can resume without a character. Ordinary threads require
a linked character. Demo messages retain the SDK item ID but have no billable
`call_sessions` row.

We considered writing conversation history in the browser or at hangup. The
worker owns committed turn order and persists during the call, including when
the browser drops. A hangup batch can lose the entire call on a worker crash.

The isolated Supabase and Chromium smoke saved spoken STT, typed text, and
Inworld replies, then resumed after a page reload and recalled the earlier
typed turn without duplicating it. The demo handles a transcription stream
ending during hangup by keeping the received text and closing the stream.

### Shared Grok generation

The JS worker and Next.js use the same TanStack AI Grok adapter. The worker
passes LiveKit's current text context to the adapter and maps reply deltas and
provider token counts into LiveKit's LLM stream. LiveKit handles turn detection
and aborts the request when a caller interrupts. The worker still uses xAI STT
and Inworld TTS.

TanStack's direct browser realtime hook would move voice orchestration into a
provider connection. The worker adapter keeps the existing voice selection and
mute behavior. Contract tests exercise context, streamed text, normalized usage,
and cancellation.

### Memory retrieval

The worker reads the same scoped Supabase slots and hybrid RPC as Python.
It requires an explicit saved opt-in for this internal demo. Memory preload
and per-turn recall are private model context. The worker can use text search
if embeddings are unavailable, and calls continue when memory fails.

We considered importing saved slots as synthetic history turns. Per-request
context keeps recall out of user-visible history and avoids appending the same
facts on redial. Checked extraction and writes remain a separate parity slice.

## Risks

A speech socket is only one part of a voice agent. Replacing LiveKit can require
more custom media machinery than the deployment simplification saves. An open
upstream PR can change. Provider usage during cancellation still costs money.
A local mock cannot prove deployed duration or mobile audio behavior.
