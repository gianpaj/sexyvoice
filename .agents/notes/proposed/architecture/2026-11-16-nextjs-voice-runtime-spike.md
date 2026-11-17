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
Those omissions keep the runtime decision proposed.

The 60-second startup deadline reports a connection failure until browser WebRTC connects.
Only a connected browser waiting for the JS runtime reports a missing worker;
a stalled runtime handshake reports a connection failure. This distinction avoids
diagnosing blocked ICE as a stopped worker. Runtime discovery waits for media
connection before sending RPCs or opening the microphone. A reconnect before
runtime discovery keeps the startup deadline rather than rejecting the call.

The local Firefox probe reproduces default-path ICE failure. Relay-only ICE
also fails, while a diagnostic probe restricted to TURN/TLS connects. Chrome
connects on both direct UDP and TLS relay. These observations do not establish
the cause of Firefox's candidate-selection failure. The application retains
SDK transport defaults; Firefox support remains an acceptance gap. The SDK
is pinned to 2.24.1 for its documented initial-recovery and Safari fixes, but
both the upgrade and the longer deadline are insufficient to establish Firefox
reliability. The opt-in live Playwright matrix covers Chrome, Firefox, desktop
WebKit, and mobile WebKit. The user reports Safari typing and speaking work. The report does not establish
which desktop/iOS devices passed every scenario; mute, interruption, recovery,
and long-call checks remain required. Linux WebKit results cannot establish
Safari device permissions or audio behavior.
A supported SDK/configuration fix needs a browser regression before changing
transport. Forced reconnect diagnostics are absent from the application. Safari
logs collected during a forced-reconnect experiment and Fast Refresh show SCTP
channel closure; they do not isolate the cause of a stable-build failure.

Remote development uses the configured `NEXT_PUBLIC_SITE_URL` as an exact
additional origin for the internal token route; forwarded host headers cannot
select it. A private HTTPS proxy covers microphone capture and a second proxy
makes the isolated Supabase API reachable from the testing device. This is a
development-only origin exception, with a regression test for scheme/port and
hostname mismatches.

## Alternatives considered

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

## Risks

A speech socket is only one part of a voice agent. Replacing LiveKit can require
more custom media machinery than the deployment simplification saves. An open
upstream PR can change. Provider usage during cancellation still costs money.
A local mock cannot prove deployed duration or mobile audio behavior.
