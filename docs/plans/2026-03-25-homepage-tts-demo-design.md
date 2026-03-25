# Homepage TTS Demo Widget — Design

**Date:** 2026-03-25
**Status:** Approved

## Overview

A free TTS demo widget on the homepage that lets anonymous visitors generate audio with no login required. Visitors get 3 free generations, tracked via cookie + IP rate limiting, with Altcha proof-of-work captcha required before each generation to prevent abuse.

## Goals

- Convert anonymous visitors to sign-ups by letting them experience voice quality firsthand
- Keep costs low (Gemini 2.5 Flash, 200 char limit)
- Prevent abuse without punishing legitimate users (no image puzzles — Altcha is automatic)
- Easy to tune: rate limits and captcha difficulty are configurable without code changes

## Architecture

### New Files

```
components/altcha-widget.tsx        — SSR-safe Altcha web component wrapper
components/homepage-tts-demo.tsx    — Demo widget (client component)
app/api/demo-tts/route.ts           — Dedicated API route for anonymous TTS
```

### Data Flow

```
1. Homepage loads
   → widget reads localStorage for remaining count (optimistic UI)
   → Altcha widget auto-starts proof-of-work in background

2. Visitor selects voice + preset or types text (≤200 chars)

3. Visitor clicks Generate
   → read altcha.value (solved payload)
   → POST /api/demo-tts { text, voiceId, altchaPayload }

4. /api/demo-tts:
   a. Validate Altcha payload via sentinel (POST /v1/verify/signature)
      → 400 invalid_captcha if fails
   b. Read/set demo_session_id cookie (UUID, httpOnly, 30d)
   c. Check Upstash Redis:
        demo:cookie:{uuid}  max 3 per 24h
        demo:ip:{ip}        max 15 per 24h
      → 429 limit_reached if either exceeded
   d. Validate voiceId exists (model='gpro', is_public=true)
      → 400 invalid_voice if not found
   e. Call Gemini 2.5 Flash TTS with selected voice
   f. Upload audio to R2, get URL
   g. Increment both Redis counters
   h. Return { audioUrl, remaining }

5. Client receives response
   → update localStorage count
   → show audio player
   → reset Altcha widget for next generation

6. At remaining=0: dim widget, replace button with sign-up CTA
```

## Component Design

### `<AltchaWidget>`

SSR-safe wrapper around the `altcha` web component. Uses `useSyncExternalStore` to render only on the client (web components are not SSR-compatible).

```tsx
'use client'
import { useSyncExternalStore } from 'react';
import 'altcha';
import type {} from 'altcha/types/react';

export function AltchaWidget({ challengeUrl }: { challengeUrl: string }) {
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  return isClient
    ? <altcha-widget challengeurl={challengeUrl} />
    : <span>Loading...</span>;
}
```

### `<HomepageTTSDemo>`

Client component with four visual states:

| State | Description |
|-------|-------------|
| `idle` | Voice selector, presets, textarea, Altcha, Generate button |
| `loading` | Button shows spinner, inputs disabled |
| `playing` | Audio player visible, can generate again if remaining > 0 |
| `exhausted` | Widget dimmed, button replaced by "Sign up free →" CTA |

**Counter:** "X of 3 free generations remaining" — visible from first load, updates after each generation.

**Voice selector:** Fetches `GET /api/demo-voices` (or inline server prop) — voices where `model='gpro' AND is_public=true ORDER BY sort_order`.

**Presets (5 suggested):**
1. "Welcome to SexyVoice — where your words come alive."
2. "The quick brown fox jumps over the lazy dog."
3. "Type anything you want and hear it in seconds."
4. "Artificial intelligence is transforming how we communicate."
5. "Hello world! This is what your voice could sound like."

**Text input:** Freeform textarea, 200 char max with live counter. Selecting a preset populates the textarea (editable).

### `/api/demo-tts`

```
Method:  POST
Body:    { text: string, voiceId: string, altchaPayload: string }
Cookie:  demo_session_id (set if missing, httpOnly, SameSite=Lax, 30d)

Success 200:  { audioUrl: string, remaining: number }
Rate limit:   429 { error: "limit_reached", remaining: 0 }
Bad request:  400 { error: "invalid_captcha" | "invalid_voice" | "text_too_long" }
Server error: 500 { error: "generation_failed" }
```

## Rate Limiting

| Key | Limit | Window | Purpose |
|-----|-------|--------|---------|
| `demo:cookie:{uuid}` | 3 | 24h | Per-browser limit |
| `demo:ip:{ip}` | 15 | 24h | Shared IP buffer (offices, NAT) |

Both keys checked on every request. Either exhausted → 429.

Uses existing Upstash Redis instance (`@upstash/ratelimit`).

## Altcha Integration

**Package:** `altcha` (web component + types)

**Client:** `<altcha-widget challengeurl={NEXT_PUBLIC_ALTCHA_CHALLENGE_URL} />`
- Auto-solves proof-of-work in background (no user interaction for normal traffic)
- Adaptive difficulty via sentinel (harder for suspicious traffic)
- Resets after each submission (no replay attacks)

**Server verification:**
```ts
const res = await fetch(`${process.env.ALTCHA_SENTINEL_URL}/v1/verify/signature`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ payload: altchaPayload }),
});
const { verified } = await res.json();
```

**Env vars:**
```
NEXT_PUBLIC_ALTCHA_CHALLENGE_URL=http://your-sentinel-host/v1/altcha/challenge
ALTCHA_SENTINEL_URL=http://your-sentinel-host   # server-side only, never exposed
```

## TTS Provider

- **Model:** Gemini 2.5 Flash (`gpro` internally)
- **Voices:** All `is_public=true, model='gpro'` voices from DB, ordered by `sort_order`
- **Text limit:** 200 characters (enforced client + server)
- **No credit deduction:** Demo generations bypass the credit system entirely
- **Audio storage:** R2 (existing bucket), same pipeline as authenticated users

## Future Escape Hatches

- **Abuse via VPN/rotating IPs:** Lower `demo:ip` limit or add hCaptcha fallback after IP limit hit
- **Abuse via cookie clearing:** IP limit provides the backstop
- **Cost spike:** Reduce 200 char limit or reduce 3 → 2 generations
- **Increase conversion:** Raise limit to 5, add voice cloning teaser after exhaustion
