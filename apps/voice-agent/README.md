# Internal JS browser call

A short LiveKit Agents JS call runs in this monorepo with xAI streaming STT,
Grok 4.20 through LiveKit inference, and streaming Inworld TTS. Next.js issues
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

Configure `apps/web/.env.local` with the normal Supabase settings and the same
`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and
`VOICE_SPIKE_USER_IDS`. Provider keys stay in the worker. The JS route ignores
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
A preview deployment needs this persistent worker running separately;
Vercel hosts the page and token request, not the agent's media connection.

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

- Authenticated, same-origin token requests; development/preview only.
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
- Every call starts with fresh context. The UI holds at most 100 message items.
  This is an internal provider experiment with no customer wallet writes.

This slice has no standalone text chat, saved character selection,
database history, cross-tab admission, memory extraction, usage settlement,
or resumable text streams. Use one synthetic conversation at a time.
It is not eligible for customer exposure or a Python cutover.

## Provider compatibility

| Component          | Version/model                       | Evidence                                                      |
| ------------------ | ----------------------------------- | ------------------------------------------------------------- |
| Agents and plugins | `1.10.0`                            | Node 24 Linux host boot and real call                         |
| Native RTC         | `1.2.2`                             | WebRTC send/receive on Linux x64                              |
| STT                | `grok-voice-transcribe-2.0`         | Explicit WebSocket model pin, contract test, real spoken turn |
| LLM                | `xai/grok-4.20-0309-non-reasoning`  | Real gateway reply                                            |
| TTS                | `inworld-tts-2`, Ashley, `BALANCED` | Real streamed audio and transcripts                           |

The scoped pnpm patch for `@livekit/agents-plugin-xai@1.10.0` adds its missing
model option and query parameter in source, ESM, CJS, and declarations. The
connection test intercepts the actual adapter's WebSocket constructor.
The JS Inworld plugin does not expose Python's five-reply/1,500-character
`synthesisContext.previousRequests`; contextual delivery parity is pending.

## Browser transport findings

The web app pins `livekit-client` 2.24.1, including the Python call page at
`/dashboard/call`. In the internal demo, Firefox receives
`rtcConfig.bundlePolicy = "max-bundle"` at connection time; Chrome, Safari,
and iOS Firefox keep SDK defaults. This policy creates one ICE/DTLS transport
for the SDK's initial media layout. See [WebRTC bundling](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/RTCPeerConnection#bundlepolicy).

On Linux Firefox 153, SDK defaults fail ICE with TURN error 701. The max-bundle
probe connects through a TLS relay and receives decoded audio samples. The
application passes two consecutive Firefox calls and two Chrome calls with
real Inworld playback, typed replies, microphone mute/unmute, and hangup.
Unit checks protect the browser-specific configuration. The repeated calls use
synthetic microphone tracks; recognizable speech through Firefox STT still needs
a device check. The user reports Safari typing and speaking work; Firefox 160
on macOS needs confirmation of this fix.

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
Firefox max-bundle option applies only to the demo; Python-flow Firefox
connectivity with default bundling is unverified.

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
images, provider cost measurements, and 30/60-minute calls remain unverified.
The [spike plan](../../plans/2026-11-16-livekit-agents-js-spike.md) owns those
experiments and the production decision gates. Python baseline inspected:
`23cac3548c49c7aeeeb1f59ac57da761908bdf34`.
