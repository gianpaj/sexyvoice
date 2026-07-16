# Homepage TTS Demo Widget — Design

**Date:** 2026-03-25
**Status:** Implemented

## Overview

A free TTS demo widget on the homepage lets anonymous visitors generate audio with no login required. Visitors get 3 free generations, tracked via cookie + IP rate limiting, with ALTCHA proof-of-work required before each generation to reduce abuse.

The implementation uses a local server integration in Next.js:

- the browser loads the `altcha` web component
- the widget fetches fresh challenges from `GET /api/altcha/challenge`
- the server generates challenges locally using `altcha-lib`
- the TTS route verifies ALTCHA payloads locally using the same `ALTCHA_HMAC_KEY`

This avoids any dependency on ALTCHA Sentinel for the homepage demo flow.

## Goals

- Convert anonymous visitors to sign-ups by letting them experience voice quality firsthand
- Keep costs low (`gemini-2.5-flash-preview-tts`, 200 char limit)
- Prevent abuse without image puzzles
- Keep the integration simple and self-hosted
- Make replay attacks harder by rejecting reused ALTCHA payloads server-side

## Architecture

### New / Updated Files

```text
components/altcha-widget.tsx        — SSR-safe ALTCHA web component wrapper
components/homepage-tts-demo.tsx    — Demo widget (client component)
app/api/altcha/challenge/route.ts   — Local ALTCHA challenge generator
app/api/demo-tts/route.ts           — Dedicated API route for anonymous TTS
```

## Data Flow

```text
1
. Homepage loads
   → widget reads localStorage for remaining count (optimistic UI)
   → ALTCHA widget is mounted client-side only

2. ALTCHA widget needs a challenge
   → GET /api/altcha/challenge
   → server calls createChallenge({ hmacKey, maxnumber, expires })
   → returns fresh challenge JSON with no-store headers

3. Visitor selects voice + preset or types text (≤ 200 chars)

4. Visitor completes ALTCHA
   → widget emits verified event
   → client stores ev.detail.payload in component state

5. Visitor clicks Generate
   → POST /api/demo-tts { text, voiceId, altchaPayload }

6. /api/demo-tts
   a. Validate request fields
      → 400 missing_fields if text / voiceId / altchaPayload missing
      → 400 text_too_long if > 200 chars
   b. Verify ALTCHA locally with verifySolution(payload, ALTCHA_HMAC_KEY)
      → 400 invalid_captcha if fails
   c. Reject replayed ALTCHA payloads using Redis fingerprint key
      demo:altcha:{sha256(payload)}
      → 400 invalid_captcha if payload already used
   d. Read/set demo_session_id cookie (UUID, httpOnly, 30d)
   e. Check Upstash Redis:
        demo:cookie:{uuid}  max 3 per 24h
        demo:ip:{ip}        max 15 per 24h
      → 429 limit_reached if either exceeded
   f. Validate voiceId exists (model='gpro', is_public=true)
      → 400 invalid_voice if not found
   g. Call Gemini 2.5 Flash TTS with selected voice
   h. Convert/upload audio to R2, get URL
   i. Return { audioUrl, remaining }

7. Client receives response
   → update localStorage count
   → show audio player
   → clear stored ALTCHA payload
   → reset ALTCHA widget for next generation

8. At remaining = 0
   → widget area is dimmed and blocked from further interaction
```

## Component Design

### `<AltchaWidget>`

An SSR-safe wrapper around the `altcha` custom element.

Implementation details:

- dynamically imports `altcha` inside `useEffect()` so it never runs during SSR
- renders the custom element only after client-side load completes
-
 listens for:
  - `verified` to capture `detail.payload`
  - `statechange` to clear payload when state becomes `expired`
- exposes a `reset()` method via `useImperativeHandle()`

Representative behavior:

```tsx
'use client';

useEffect(() => {
  import('altcha').then(() => setLoaded(true));
}, []);

useEffect(() => {
  const widget = containerRef.current?.querySelector('altcha-widget');
  if (!widget) return;

  function handleVerified(ev: Event) {
    const payload = (ev as CustomEvent<{ payload: string }>).detail?.payload;
    if (payload) onVerified(payload);
  }

  function handleStateChange(ev: Event) {
    const state = (ev as CustomEvent<{ state: string }>).detail?.state;
    if (state === 'expired') onExpired?.();
  }

  widget.addEventListener('verified', handleVerified);
  widget.addEventListener('statechange', handleStateChange);

  return () => {
    widget.removeEventListener('verified', handleVerified);
    widget.removeEventListener('statechange', handleStateChange);
  };
}, [loaded, onVerified, onExpired]);
```

### `<HomepageTTSDemo>`

Client component with these practical states:

| State | Description |
|-------|-------------|
| `idle` | Voice selector, presets, textarea, ALTCHA, Generate button |
| `loading` | Button shows spinner while request is in flight |
| `playing` | Audio player visible after successful generation |
| `exhausted` | Container dimmed and disabled when remaining generations reaches 0 |

### Current UX behavior

- `remaining` starts from `localStorage` using `demo_tts_remaining`
- voice list is passed from the server-rendered homepage
- selected ALTCHA payload is stored in React state
- clicking `Generate` without a verified payload shows:
  - `Please wait for the security check to complete.`
- failed verification shows:
  - `Security check failed. Please try again.`
- successful generation:
  - updates `remaining`
  - stores new value in `localStorage`
  - shows returned audio URL in the player
  - resets ALTCHA so the next request requires a fresh solve

### Presets

1. `Welcome to SexyVoice — where your words come alive.`
2. `The quick brown fox jumps over the lazy dog.`
3. `Type anything you want and hear it in seconds.`
4. `Artificial intelligence is transforming how we communicate.`
5. `Hello world! This is what your voice could sound like.`

### Text input

- freeform textarea
- 200 character max
- live character counter
- preset selection fills the textarea, but text remains editable

## API Design

### `GET /api/altcha/challenge`

Generates a fresh ALTCHA challenge locally.

**Implementation:**

- uses `createChallenge()` from `altcha-lib`
- uses `ALTCHA_HMAC_KEY`
- challenge is short-lived
- response is explicitly uncached

**Current server constants:**

- `DEFAULT_MAX_NUMBER = 50_000`
- `DEFAULT_EXPIRES_IN_MS = 5 * 60 * 1000`

**Error behavior:**

- `500 { error: "ALTCHA_HMAC_KEY is not configured" }` if missing
- `500 { error: "Failed to generate Altcha challenge" }` if challenge creation throws

### `POST /api/demo-tts`

```text
Method:  POST
Body:    { text: string, voiceId: string, altchaPayload: string }
Cookie:  demo_session_id (set if missing, httpOnly, SameSite=Lax, 30d)

Success 200:  { audioUrl: string, remaining: number }
Rate limit:   429 { error: "limit_reached", remaining: 0 }
Bad request:  400 { error: "missing_fields" | "invalid_captcha" | "invalid_voice" | "text_too_long" }
Server error: 500 { error: "generation_failed" }
```

## Rate Limiting

| Key | Limit | Window | Purpose |
|-----|-------|--------|---------|
| `demo:cookie:{uuid}` | 3 | 24h | Per-browser limit |
| `demo:ip:{ip}` | 15 | 24h | Shared IP buffer |
| `demo:altcha:{sha256(payload)}` | 1 | 10m | Replay protection for solved ALTCHA payloads |

Notes:

- cookie and IP limits are checked before generation
- replay protection is separate from user quota
- ALTCHA replay keys are stored only long enough to cover challenge lifetime / short-term abuse

## ALTCHA Integration

### Packages

- `altcha` — web component for the browser
- `altcha-lib` — local challenge generation and verification on the server

### Client

```tsx
<altcha-widget challengeurl="/api/altcha/challenge" />
```

Behavior:

- runs in the browser only
- fetches fresh challenge JSON from the local Next.js route
- emits a `verified` event with a Base64-encoded payload
- can be reset after each successful submission

### Server challenge generation

```ts
const challenge = await createChallenge({
  hmacKey: process.env.ALTCHA_HMAC_KEY,
  maxnumber: 50_000,
  expires: new Date(Date.now() + 5 * 60 * 1000),
});
```

### Server verification

```ts
const verified = await verifySolution(payload, process.env.ALTCHA_HMAC_KEY);
```

### Replay protection

A valid ALTCHA payload is fingerprinted with SHA-256 and stored in Redis for a short window. If the same payload is submitted again, it is rejected as `invalid_captcha`.

## Environment Variables

```bash
NEXT_PUBLIC_ALTCHA_CHALLENGE_URL=/api/altcha/challenge
ALTCHA_HMAC_KEY=your_generated_secret_here
```

Generate the HMAC key with:

```bash
openssl rand -base64 32
```

### Requirements

- `ALTCHA_HMAC_KEY` must be identical anywhere the app:
  - generates challenges
  - verifies payloads
- the key must remain server-side only
- `NEXT_PUBLIC_ALTCHA_CHALLENGE_URL` can remain the local route path

## TTS Provider

- **Model:** Gemini 2.5 Flash Preview TTS (`gemini-2.5-flash-preview-tts`)
- **Voices:** all `is_public = true` and `model = 'gpro'` voices from the database, ordered by `sort_order`
- **Text limit:** 200 characters, enforced client and server side
- **No credit deduction:** demo generations bypass the authenticated credit system
- **Audio storage:** existing R2 upload pipeline

## Security Notes

### What this design protects against

- basic scripted abuse through free anonymous access
- repeated generation without solving proof-of-work
- direct replay of the same valid ALTCHA payload
- repeated use from a single browser
- light abuse from a single IP / NAT pool

### What it does not fully protect against

- determined attackers rotating IPs and browsers
- advanced automated traffic at scale
- high-sophistication abuse patterns requiring adaptive defense

### Escalation options

If abuse increases later:

- reduce `demo:ip` limit
- reduce `DEMO_LIMIT`
- reduce text length
- increase ALTCHA challenge difficulty
- add a secondary fallback
 captcha for suspicious traffic
- add stronger behavioral heuristics or bot scoring

## Notes on Implementation Changes from Original Design

The original approved plan assumed Sentinel-based verification and an auto-background solve model. The implemented version differs in these key ways:

1. **No Sentinel dependency**
   - challenge generation and verification are fully local via `altcha-lib`

2. **Event-based payload capture**
   - the client does not rely on reading `widget.value` through a React ref
   - instead it listens for the ALTCHA `verified` event and stores `detail.payload`

3. **Strict HMAC requirement**
   - the final implementation expects `ALTCHA_HMAC_KEY`
   - challenge generation fails if it is missing
   - verification fails if it is missing

4. **Redis-backed replay protection**
   - added to complement `verifySolution()`

5. **Homepage route default**
   - homepage now uses the local challenge route directly:
     `/api/altcha/challenge`

## Future Escape Hatches

- **Abuse via VPN / rotating IPs:** lower IP limit or add secondary challenge
- **Abuse via cookie clearing:** IP limit remains the backstop
- **Cost spike:** reduce character limit or total free generations
- **Conversion optimization:** raise free count, improve exhausted-state CTA, or add signup prompt after playback
