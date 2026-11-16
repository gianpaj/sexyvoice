# Agent Note: Next.js voice runtime spike

Status: proposed — transport/provider probe implemented; deployment and mobile parity unverified

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

## Alternatives considered

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
