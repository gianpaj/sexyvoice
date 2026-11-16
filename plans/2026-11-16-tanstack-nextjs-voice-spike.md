# TanStack AI voice and text in Next.js: feasibility spike

Status: approved to implement as an isolated experiment; production runtime
selection depends on the results below. Written 2026-11-16.

## Question

Can Sexyvoice own streamed text chat and an xAI STT → Grok → Inworld TTS voice
pipeline in TypeScript, without a separate Python voice worker, while preserving
mobile usability, shared context, existing memory, and 30–60 minute calls?

The [product plan](2026-11-16-chat-first-conversations-and-calls.md) owns the
customer experience, credit rates, trial estimates, and failure policies.
This spike evaluates the runtime choice. It does not authorize a production
cutover, replace existing minute billing, or claim parity with LiveKit.

## Evidence and boundaries

- [TanStack PR #1964](https://github.com/TanStack/ai/pull/1964) is open.
  Inspect and pin head `4725e44c97d5b562bf69019411245ff1ebf47f1a`.
  It supplies `transcriptionSession`, audio conversion, a WebSocket lifecycle
  helper, and seven STT adapters. It does not supply a voice orchestrator.
  The xAI adapter handles `transcript.partial`, committed segments and turn end.
  Keep a small attributed copy of this unmerged code isolated from production;
  use published TanStack AI packages for chat. Record local changes and license.
- Vercel [made WebSockets generally available on 2026-10-20](https://vercel.com/changelog/websocket-support-is-now-generally-available).
  The [Next.js helper](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#upgradewebsocket)
  requires `@vercel/functions >=3.10.0` and `ws`. Local upgrades require
  `vercel dev >=54.14.2`; `next dev` cannot validate this path.
- [Function duration](https://vercel.com/docs/functions/configuring-functions/duration)
  also bounds WebSockets. Eligible Pro/Enterprise Fluid functions support an
  extended-duration beta up to 1,800 seconds; ordinary limits can be lower.
  Check this project's plan and settings before a live soak. A 60-minute logical
  call cannot rely on one Vercel invocation. Even a 30-minute call needs margin.
- [Vercel's connection model](https://vercel.com/docs/functions/websockets)
  pins a socket to an instance. A replacement can reach another instance or
  deployment. Keep authoritative recovery state outside the function.
- [Inworld streaming synthesis](https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech-stream)
  returns NDJSON with independently base64-encoded `result.audioContent` chunks.
  Request raw PCM explicitly; LINEAR16 adds WAV headers. Parse split lines and
  the final unterminated line. Record first-chunk usage even when later chunks
  report zero. Cancellation can still incur provider spend.
- Existing LiveKit cascade code in Sexycall (`src/voice_pipeline.py`,
  `src/inworld_voice.py`, `src/session_manager.py`, and `src/call_monitor.py`)
  is the behavioral baseline for turn handling, speech cancellation, history,
  shutdown, memory, and billing. Compare with the
  [LiveKit text/audio example](https://docs.livekit.io/agents/multimodality/text/)
  and [turn handling](https://docs.livekit.io/agents/logic/turns/).

## Shape of the experiment

Start with browser → authenticated Next.js WebSocket → server-side providers.
Use the same typed turn pipeline for text and transcribed speech. Chat mode
opens neither STT nor TTS. A call explicitly enables capture; mute blocks audio
at both the browser send path and the server's STT forwarding path. Leave the
production LiveKit page and Python runtime intact.

Keep the experiment unavailable in production and allow only explicitly
configured test user IDs in development/preview. Require verified Supabase
identity and matching WebSocket Origin before upgrade. Enforce bounded frames,
audio queues, text lengths, turn count, output length, and connection duration.
Provider credentials and character prompts stay server-side. Test calls incur
provider cost but do not change customer credits; this restriction is why the
spike cannot be exposed as a public alternative call endpoint.

Use an isolated test character, no real customer transcripts. A test client
shows ordered messages, a composer, explicit call/mute/hangup controls, and
Thinking until visible assistant text. It reports transport and latency
measurements without putting diagnostic controls into the product UI.

## Step 1: transport and provider probe

1. Add typed and validated socket messages and a provider-independent turn
   runner. Stream visible text through TanStack `chat()` and synthesize bounded
   phrases through Inworld HTTP streaming. Keep STT event consumption concurrent
   with generation so interruption can cancel LLM, TTS and playback promptly.
2. Exercise the pinned PR's real xAI adapter with fake sockets, including setup,
   duplicate utterance finals, unexpected close, timeout, and abort during setup.
   Close every provider on browser disconnect or function deadline.
3. Add an authenticated, preview-only Next.js upgrade route. First test an echo
   and forced short connection lifetime without spending provider credits.
   Measure provider adapters separately before joining the cascade.
4. Run focused protocol/provider tests, formatting, and type checks. Commit the
   first useful slice separately from this plan. Record what it proves.

## Step 2: mobile vertical slice

1. Capture mono PCM16 with AudioWorklet, echo cancellation and noise suppression.
   Send bounded chunks at the actual AudioContext sample rate; reject unsupported
   rates. Handle Safari audio unlock on the explicit call gesture.
2. Queue returned PCM in AudioContext. Track played position separately from
   generated text. Cap queued duration. Stop and clear pending audio on hangup,
   interruption, disconnect, and playback errors. Never replay old audio after
   reconnection. Late frames from an interrupted turn carry an ID and are ignored.
3. Add a minimal internal mobile test view, not a product redesign. Include
   permission denial, disconnected state, Thinking, mute, and manual retry.
4. Demonstrate chat → call → chat with the same model context and no duplicate
   seeded messages. Test text-only mode with browser microphone access denied.

## Step 3: durable context, memory, and reconnection

Use the existing `conversations` and `conversation_messages` migration in the
base branch. Do not store API keys, system prompts, memory context, reasoning,
or raw audio in visible message parts. Conversation and character ownership
come from the authenticated server context, never a socket-supplied user ID.

- Stable thread, message and operation IDs survive reconnect. Allocate positions
  atomically; upsert corrections by source item ID. The schema alone does not
  implement writer fencing or admission: add that transaction before using real
  shared history. Never pretend a process-local map is durable or cross-device.
- Hold one active generation/call per user across tabs, characters and instances.
  Reconnect reattaches the accepted operation; it never starts it again. Reserve
  and settle chat credits using the product plan before any public rollout.
- Use TanStack's durable stream interface for text, with an external log and
  opaque replay offset. Persist before sending. Snapshot recovery after producer
  death reports interruption; explicit Retry is a new operation. WebSockets alone
  provide no resumable-stream semantics. Live audio has no automatic replay.
- Reuse existing Supabase memory scopes and saved preference. Start with read
  parity against Python preload/retrieval. Extraction, verification, corrections,
  deletion and per-user serialization need parity tests before a TypeScript port.
  Do not quietly maintain two competing memory writers. The existing Python
  memory service can remain temporarily if a complete port is not justified.
- Perform controlled transport rotation before the effective invocation deadline.
  Quiesce capture, finish or explicitly interrupt the active turn, checkpoint,
  close the old providers, then attach a new socket from the saved cursor. Bound
  the pause and show Reconnecting. Never overlap two billable STT sessions or
  claim that reconnecting can recreate lost microphone samples.

The current relational migration is already verified in isolated local Supabase.
Any new migrations must be reviewable and user-applied under AGENTS.md.

## Step 4: experiments and acceptance

Use synthetic audio and disposable test conversations. Record runtime, dependency
versions, deployment, network profile, event timestamps, provider usage and error
counts. Do not log transcript content or secrets. Keep actual results separate
from targets. Mock-time tests are not real-duration soaks.

| Experiment         | Pass condition                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| Chat only          | Streamed visible text; Thinking covers server wait; zero mic/STT/TTS activity                          |
| Cascade            | Real xAI STT, Grok reply and audible Inworld PCM; typed and spoken turns share context                 |
| Mute/hangup        | Zero forwarded audio after acknowledged mute; media tracks and providers close on exit                 |
| Interruption       | New speech cancels old reply; no stale text/audio enters the next turn                                 |
| Context            | Chat → voice → chat retains order and identity, including reload and corrected transcripts             |
| Short rotation     | Forced 30–60 second leases recover without repeated generation, speech or charges                      |
| Long calls         | Actual 30- and 60-minute preview soaks survive required rotations; record all gaps                     |
| Bad mobile network | 400 ms RTT, 1 Mbps, 3% loss; offline 5/30/90 s; no unbounded queue or silent retry                     |
| Device lifecycle   | iOS Safari and Android Chrome; permission denial, Bluetooth change, background/foreground, screen lock |
| Authorization      | Anonymous, wrong Origin, other user/thread, oversize/flooded frames rejected before spend              |
| Memory             | Opt-out and both scopes match existing behavior; extraction/check outages do not break call            |
| Latency            | Compare end-of-speech → first audio p50/p95 against Python Inworld mode using identical scenarios      |
| Cost               | Measure connected STT, uncached/cached/output LLM, submitted TTS characters and Vercel compute/egress  |

Target a local/preview first-audio regression below 300 ms p95 versus the
baseline; investigate larger regressions before choosing this architecture.
Set the final latency target from paired measurements rather than a provider's
advertised latency. Accept brief explicit reconnection only after observing and
reviewing its actual effect on a mobile conversation.

## Decision after the spike

Choose the Next.js relay if the deployed duration, latency, interruption,
recovery, memory and cost tests pass without recreating most of LiveKit.
One repository is useful only if the operating model is also simpler.

If relay rotation harms calls, compare direct browser-to-provider ephemeral
credentials with Next.js owning auth, history and billing. The
[Inworld Realtime API](https://docs.inworld.ai/realtime/overview) is a separate
managed option with different LLM/turn/billing control; it is not the PR's TTS
cascade. Compare a persistent Node process from this same repository as another
hosting option. Keeping a TypeScript runtime in one codebase does not require
hosting its media socket in a Vercel Function.

Keep Python/LiveKit if the replacement needs a new media service and substantial
custom turn, recovery or memory machinery without measured benefit. Record the
choice and remaining production gates in the Agent Note; do not delete the
existing runtime as part of this experiment.
