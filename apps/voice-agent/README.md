# Internal JS browser call

A short LiveKit Agents JS call runs in this monorepo with xAI streaming STT,
Grok 4.20 through TanStack AI and the xAI API, and streaming Inworld TTS. Next.js issues
a token; media goes through LiveKit to a persistent Node worker.

Open `/{lang}/dashboard/voice-spike`, then press the phone button. Speak, or
send text from the composer during the call. Both inputs reach the same agent
session. Replies appear as transcripts and audio. The normal dashboard Call
page remains the Python call flow.

## Local setup

Use Node 24 and pnpm from the repository root:

```sh
pnpm install --frozen-lockfile
cp apps/voice-agent/.env.example apps/voice-agent/.env.local
```

Fill the worker file with credentials for a test LiveKit project, xAI, and
Inworld. `VOICE_SPIKE_USER_IDS` lists the Supabase UUIDs allowed to test;
`VOICE_SPIKE_ENABLED=true` explicitly enables this worker. Keep it off in
production. Calls use Ashley by default and speak English.

Apply the thread migration to the isolated local Supabase project first. Set
`NEXT_PUBLIC_SUPABASE_URL` in the worker file to its loopback API URL and
`SUPABASE_SECRET_KEY` to that project's server key. The worker rejects non-local
database URLs.

Configure `apps/web/.env.local` for the same isolated Supabase project and set
`XAI_API_KEY` for chat. Both services use the same
`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and
`VOICE_SPIKE_USER_IDS`. Keep xAI and Inworld credentials server-side. The JS route ignores
`LIVEKIT_AGENT_NAME` and always dispatches `sexyvoice-js-spike`.

In separate terminals, from the repository root:

```sh
pnpm --filter @sexyvoice/voice-agent start
pnpm --filter @sexyvoice/web exec next dev --port 3007
```

Sign in with an allowed test account at
`http://localhost:3007/en/dashboard/voice-spike`. An existing Python worker
can stay connected: explicit dispatch selects only the JS worker. Do not run
two JS workers against the same project when comparing local changes.
Run both services locally. Use the private HTTPS proxy below for remote browser
tests.

## Continue a conversation

The call page adds `?conversation=<uuid>` after the first successful connection.
Redial or reopen that URL while signed in as the same user to continue the thread.
Open the page without the conversation parameter to start fresh.

The worker reads up to 32 recent turns and 12,000 characters when starting a
call. It saves committed typed and spoken turns to `conversation_messages`
and allows one active JS demo call per user. Demo calls do not create
`call_sessions` or charge credits.

## Supabase memory

The worker reads the caller's saved `call_memory_enabled` preference and loads
memory only when it is explicitly enabled. It uses shared slots and, for a
thread with a character, that character's slots from `agent_memories`.

The preload keeps pinned slots and fills a 4,000-character budget with recent
facts. If the full set does not fit, spoken and typed turns can query
`match_agent_memories_hybrid`. Set `OPENAI_API_KEY` in the worker for pgvector
plus full-text search. Without it, recall uses full text. Memory outages let
the call continue with thread history alone.

Memory context goes to the model separately from visible conversation turns.
The worker reads existing long-term slots. Call-end extraction, verification,
and updates remain in the Python path.

## Shadow call accounting

Run the local worker at info level to collect one structured
`Voice spike shadow accounting` event per finalized call:

```sh
cd apps/voice-agent
node --env-file-if-exists=.env.local src/agent.ts start --log-level info
```

The call clock starts just before the LiveKit session starts and stops when
the worker begins ending the call. Provider usage can still arrive during
teardown. The projection follows SexyCall's first-speech and minimum-duration
rules. A call that never speaks or ends before ten whole seconds projects zero
credits. A qualifying call projects 500 credits per started 30-second bucket
of elapsed whole seconds. The five-minute demo cap applies regardless of the
projection. The demo reads and writes no wallet data.

The report includes xAI STT audio milliseconds, Grok uncached/cached/output
tokens, and Inworld TTS characters reported by the adapters. It estimates each
component using global [xAI rates](https://docs.x.ai/developers/pricing) and
[Inworld On-Demand rates](https://inworld.ai/pricing). A cancelled or failed
Grok request without final usage counts as unreported. Missing audio or character
readings remain null. Provider retries and cancelled synthesis may be
underreported by the SDK. The report has no total or invoice-equivalent cost.
It excludes LiveKit media, worker compute, and workspace discounts. The event
contains the room name, duration, and counters.

## Saved Inworld voice comparison

Sign in as the owner of a consented test clone, then open
`/{lang}/dashboard/voice-spike?voice=<audio_references.id>`. The route checks
the row ID, authenticated owner, and Inworld provider before creating the
room. The worker key must access the workspace that owns the clone.
Missing or inaccessible clones fail the call request.

The provider voice ID travels in LiveKit's server-side job metadata. The
browser receives a join token without that metadata. To exercise this flow
with the live browser suite below, set
`PLAYWRIGHT_VOICE_SPIKE_AUDIO_REFERENCE_ID` to the row UUID and use the
clone owner's browser auth fixture.

## Access from another device

Bind Next.js with `--hostname 0.0.0.0` for direct network access. Voice capture
requires a trusted HTTPS origin outside localhost. A private Tailscale Serve
proxy can provide HTTPS for both Next.js and the isolated local Supabase API.
Use dedicated ports so existing proxies keep their configuration:

```sh
tailscale serve --bg --https=8447 http://127.0.0.1:3007
tailscale serve --bg --https=8448 http://127.0.0.1:55321
```

Set `NEXT_PUBLIC_SITE_URL` to the web proxy's HTTPS origin and
`NEXT_PUBLIC_SUPABASE_URL` to the API proxy's HTTPS origin in
`apps/web/.env.local`. Keep the local project's keys. Restart Next.js after
changing URLs. The configured site hostname is allowed for development assets;
the spike accepts that exact origin during development when a proxy changes
the internal request URL. Forwarded host headers do not expand the allowlist.

Remove only these demo proxies with `tailscale serve --https=8447 off` and
`tailscale serve --https=8448 off` when finished.

## Implemented bounds

- Authenticated, same-origin token requests in Next.js development.
- Worker revalidates the allowlist, runtime, and short dispatch lifetime before
  opening providers. Browser input stays off until the JS runtime marker and
  mute RPC are acknowledged. Startup has a 60-second deadline.
- Mute stops the browser microphone track and disables session audio input;
  unmute reacquires capture. A failed mute RPC ends the call. Reconnection
  reapplies the acknowledged mute state. Output audio remains independent.
- Typed messages use `lk.chat`, capped at 2,000 characters. They interrupt the
  current reply and use the same session as speech. `Thinking…` covers the wait.
- A call ends after five minutes, on participant departure, or on an
  unrecoverable provider error. Hangup releases the microphone and audio UI.
- SDK recording is disabled; scripts select warning-level logs explicitly.
  Debug logs can contain transcripts, so do not enable them for personal calls.
- The UI holds at most 100 message items from the current call.
  This is an internal provider experiment with no customer wallet writes.

At `/dashboard/voice-spike`, send text first or use the phone button to start
a call. Set `XAI_API_KEY` in the web app for text replies, and set
`VOICE_SPIKE_LOCAL_SUPABASE_URL=http://127.0.0.1:55321` when the browser uses a
Tailnet Supabase URL. Keep the web and worker on the same isolated Supabase
project. A reload reattaches to an active chat reply. The thread contains chat
and call turns, and calls still use the five-minute demo limit.

Character selection, checked memory extraction, and customer credit settlement
are pending. Use synthetic conversations on the isolated database.

## Provider compatibility

| Component          | Version/model                       | Evidence                                                      |
| ------------------ | ----------------------------------- | ------------------------------------------------------------- |
| Agents and plugins | `1.10.0`                            | Node 24 Linux host boot and real call                         |
| Native RTC         | `1.2.2`                             | WebRTC send/receive on Linux x64                              |
| STT                | `grok-voice-transcribe-2.0`         | Explicit WebSocket model pin, contract test, real spoken turn |
| LLM                | `xai/grok-4.20-0309-non-reasoning`  | TanStack AI direct xAI stream                                 |
| TTS                | `inworld-tts-2`, Ashley, `BALANCED` | Real streamed audio and transcripts                           |

The scoped pnpm patch for `@livekit/agents-plugin-xai@1.10.0` adds its missing
model option and query parameter in source, ESM, CJS, and declarations. The
connection test intercepts the actual adapter's WebSocket constructor.
The JS Inworld plugin does not expose Python's five-reply/1,500-character
`synthesisContext.previousRequests`; contextual delivery parity is pending.

## Browser transport findings

The web app pins `livekit-client` 2.24.1, including the Python call page at
`/dashboard/call`. In the internal demo, Firefox captures the microphone before
starting WebRTC and publishes that track only after the JS agent handshake.
Without capture permission, Firefox can limit ICE to the network interface
that loaded the page. A Tailnet interface may have no route to public STUN or
TURN servers. See [Mozilla's WebRTC report](https://bugzilla.mozilla.org/show_bug.cgi?id=2091495).

Firefox also uses `rtcConfig.bundlePolicy = "max-bundle"` to share an ICE/DTLS
transport across the initial media sections. Firefox 153 on Linux failed ICE
with SDK defaults. Separate send and receive peer connections also failed on
the Tailnet, even with TURN/TLS forced. The microphone-first configuration
passes live Inworld playback, typed replies, mute/unmute, and hangup in Linux
Firefox 153 and Chromium over the Tailnet. The automated calls use synthetic
microphones. Firefox 160 on macOS still needs a device test. The user confirmed
typing and speaking in Safari.

On 2026-11-18, the user confirmed a successful phone call with the default
Ashley voice through the Tailscale demo and said it sounded the same.
This followed verification that the running Next.js token route accepts an
empty POST for the default voice. The phone test confirms call setup and
audible playback. Browser version and call duration were unrecorded.

Startup allows 60 seconds for SDK fallback attempts and runtime discovery.
A longer deadline alone does not resolve the default-path Firefox failure.
The fix uses a public connection option; it needs no SDK downgrade, fork,
forced reconnect, hardcoded TURN endpoint, or browser preference change.

Before merging the SDK upgrade, verify a real Python-flow call through
`/dashboard/call` in Chrome and Safari: microphone capture, greeting playback,
mute/unmute, and hangup. The JS demo results do not cover that flow. The
Firefox capture and bundling options apply only to the demo. Firefox
connectivity in the Python flow remains unverified.

Required browser targets are Chrome, Firefox, desktop Safari, and iOS Safari.
Linux WebKit is an automated engine check, not Safari certification. Real Mac
and iPhone/iPad tests must verify capture permissions, audio playback, typing,
mute/unmute, hangup, and network recovery before browser support is accepted.

## Verification

```sh
pnpm --filter @sexyvoice/voice-agent test
pnpm --filter @sexyvoice/web test run tests/voice-spike tests/components/call/livekit-spike.test.tsx
pnpm type-check
pnpm fixall
```

### Live browser matrix

This explicit Playwright configuration uses real providers and an allowlisted
local account. It does not mock the token route or start the web/agent servers.
Save an authenticated Playwright storage state for the local account as
`apps/web/.auth/voice-spike.json` (ignored; restrict it to your user). Point the
existing `PLAYWRIGHT_BASE_URL` at the HTTPS demo origin and run:

```sh
PLAYWRIGHT_BASE_URL=https://YOUR-DEMO-HOST pnpm --filter @sexyvoice/web exec playwright test --config=e2e/voice-spike.live.config.ts
```

Projects are `chromium`, `firefox`, `webkit-desktop`, and `webkit-mobile`.
Use `--project=<name>` for one browser. Runs are serial, with no retries, and
disable traces, video, and screenshots. Chromium and Firefox use synthetic
microphones. WebKit media support and permission automation vary by platform;
run those projects on macOS as well as the physical Safari checks. A failed
call stays a failing test rather than being replaced with mocked media.

A 2026-11-16 browser test used an authenticated disposable local Supabase user,
a synthetic microphone track, and real LiveKit/xAI/Grok/Inworld connections.
A typed blue-bicycle fact was recalled in a spoken reply. Playing the utterance
while muted produced no transcript; unmuting accepted fresh speech. The test
also exercised missing microphone, a 390px viewport, hangup, and the five-minute
cutoff. A separate native participant received 798 audio frames from a typed
turn and acknowledged server mute.

These results establish the local browser/provider path. Physical microphone
quality, iOS audio permission/unlock, constrained networks, deployed worker
images, provider invoice reconciliation, and 30/60-minute calls remain unverified.
The [spike plan](../../plans/2026-11-16-livekit-agents-js-spike.md) owns those
experiments and the production decision gates. Python baseline inspected:
`23cac3548c49c7aeeeb1f59ac57da761908bdf34`.
