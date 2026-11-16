# Internal Next.js voice probe

This is step 1 of the [voice spike](../../../../plans/2026-11-16-tanstack-nextjs-voice-spike.md):
a server-side transport and provider probe. It runs text and transcribed turns
through TanStack AI/Grok 4.20 and streams Inworld PCM over a Next.js WebSocket.
It uses a fixed test assistant, the Ashley voice, and English transcription.
The [pinned upstream sources](upstream/README.md) are an isolated MIT copy of
TanStack PR #1964, not a released transcription API.

## Run

Use a disposable test account and synthetic dialogue. Set `VOICE_SPIKE_USER_IDS`
to that account's Supabase user UUID, plus the existing `XAI_API_KEY` and
`INWORLD_API_KEY`. Empty allowlist disables the route; production is blocked.
Use the normal Supabase web configuration for sign-in. Credentials stay on the
server. This probe does not debit customer credits or write database records.

From `apps/web`, run `vercel dev` with Vercel CLI 54.14.2+ and sign in to that
local app. `next dev` cannot exercise Vercel's upgrade helper. A linked preview
can use the same route after configuring its test-user allowlist. Deployment
protection and the Supabase session cookie must both permit the handshake.

Run this in the signed-in app's browser console for a provider-free transport
check. Inspect only event types and timing in logs:

```js
const url = new URL("/api/voice-spike?leaseSeconds=30", location.href);
url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(url);
socket.addEventListener("message", ({ data }) => {
  const event = JSON.parse(data);
  console.info(performance.now(), event.type);
  if (event.type === "ready") {
    socket.send(JSON.stringify({ type: "ping", id: "transport-probe" }));
  }
});
socket.addEventListener("close", ({ code }) => console.info("closed", code));
```

Expect `ready`, `pong`, then `rotate` and close code 1012. Rotation deliberately
ends this connection: this slice has no recovery cursor or automatic retry.
Do not call this a successful long-call or resumable-stream test.

For a short paid-provider text probe, send after `ready`:

```js
socket.send(
  JSON.stringify({
    type: "text",
    id: crypto.randomUUID(),
    text: "Say hello briefly.",
  }),
);
```

Expect `text.start`, `state: thinking`, visible `text.delta`, usage, and
`text.end`. The accepted ID is deduplicated within this connection. Text mode
opens no speech service. A phone/microphone client is step 2, not part of this
transport probe.

## Wire contract

Client controls are validated as strict objects. IDs have 1–100 characters.
Text has at most 2,000 Unicode code points, one accepted message per second,
and one pending reply. A connection holds at most 40 history entries.

| Client message                 | Behavior                                                    |
| ------------------------------ | ----------------------------------------------------------- |
| `ping` with `id`               | Return `pong`; opens no provider                            |
| `text` with `id`, `text`       | Stream a text reply; reject during a call                   |
| `call.start` with `sampleRate` | Open xAI STT for mono PCM16 little-endian                   |
| binary PCM frame               | Forward only after STT is ready, in an unmuted call         |
| `mute` with `muted`            | Close STT on mute; create a new session on unmute           |
| `call.stop`                    | Abort the reply, close STT, retain connection-local history |
| `interrupt`                    | Abort LLM/TTS; discard subsequent chunks from that turn     |

Supported input rates are 8,000, 16,000, 22,050, 24,000, 44,100 and 48,000 Hz.
The server sends `transcript` events and `audio` events with independent base64
PCM16, 48,000 Hz, mono, and a turn ID. Clients must clear queued playback on
interruption, interim speech, disconnect and hangup. `text.end` indicates
server output completion, not that audio has finished playing.

Incoming frames are bounded to 32 KiB and 100 per second. Audio is bounded to
two seconds of PCM per one-second window. A slow socket is disconnected above
256 KiB buffered output. Output is capped at 256 model tokens, 4,000 UTF-16
code units and 6 MB decoded PCM per reply. Requested leases are 10–240 seconds,
default 60; the function limit is 300 seconds, with deadline headroom.

## What this slice proves

Focused tests exercise a real local Node socket through the installed Vercel
upgrade helper and the Next.js handler, with mocked identity/request context.
The real TanStack adapter consumes synthetic Responses API events and submits
the exact Grok 4.20 model with bounded output and provider storage disabled.
Fake STT sockets and HTTP streams cover cancellation, duplicate finals, setup
failure, partial NDJSON, first-chunk usage and late errors. A concurrent cascade
test carries spoken dialogue into text mode without requiring paid providers.

These are local contract tests. The preview runtime, real providers, mobile
capture/playback, bad networks and actual 30/60-minute calls are unverified.

## Remaining stages

- Mobile AudioWorklet capture, PCM playback, echo behavior and audio unlocking.
- Phrase-by-phrase LLM/TTS pipelining; the probe synthesizes the complete reply.
  Compare against Python's VAD interruptions and contextual Inworld WebSocket
  synthesis, including the five-reply context and 1,500-character budget.
- Owned database history, distributed single-operation admission, writer fencing,
  TanStack durable text logs and checkpointed transport rotation. A socket and
  process-local history supply none of these guarantees.
- Existing pgvector memory preference/scope and extraction/check/correction
  parity. The test assistant does not access or modify user memory.
- Production token reservations/settlement and voice minute metering. Provider
  usage events here are diagnostics, not authoritative billing records.

Run the focused tests with
`pnpm --filter @sexyvoice/web test --run tests/voice-spike`.
The full experiment and decision gates remain in the linked plan.
