# Sentry Issue Tracker — Q1 2026

> Weekly review of unresolved Sentry issues for the `sexyvoice-ai` project.
> Run: `sentry-cli issues list --project sexyvoice-ai --org sexyvoiceai --max-rows=10 --status=unresolved`

---

## Week of 2026-02-24

### Summary

| Short ID | Level | Title | Status | Filed |
|---|---|---|---|---|
| [SEXYVOICE-AI-3E](#sexyvoice-ai-3e--write-epipe-fatal) | 🔴 fatal | Error: write EPIPE | 🔧 Fix proposed | 2026-02-24 |
| [SEXYVOICE-AI-4W](#sexyvoice-ai-4w--voice-generation-failed-please-retry) | 🔴 error | Error: Voice generation failed, please retry | 🔧 Fix proposed | 2026-02-24 |
| [SEXYVOICE-AI-4F](#sexyvoice-ai-4f--google-generative-ai-500) | 🔴 error | ApiError: Google Generative AI internal 500 | 🔧 Fix proposed | 2026-02-24 |
| [SEXYVOICE-AI-4X](#sexyvoice-ai-4x--typeerror-cannot-read-properties-of-undefined-reading-length) | 🔴 error | TypeError: Cannot read properties of undefined (reading 'length') | ✅ Fixed | 2026-02-24 |
| [SEXYVOICE-AI-4Z](#sexyvoice-ai-4z--aborterror-this-operation-was-aborted-sending-request) | 🔴 error | Error: exception AbortError: This operation was aborted | ✅ Fixed | 2026-02-24 |
| [SEXYVOICE-AI-5X](#sexyvoice-ai-5x--notallowederror-ios-audio-autoplay) | 🔴 error | NotAllowedError: audio play denied (iOS) | ✅ Fixed | 2026-02-24 |
| [SEXYVOICE-AI-4M](#sexyvoice-ai-4m--aborterror-play-interrupted-by-pause) | 🔴 error | AbortError: play() interrupted by pause() | ✅ Fixed | 2026-02-24 |
| [SEXYVOICE-AI-4T](#sexyvoice-ai-4t--typeerror-load-failed-ios-safari) | 🔴 error | TypeError: Load failed (iOS Safari) | 🔍 Monitoring | 2026-02-24 |

---

## Issues

---

### SEXYVOICE-AI-3E — write EPIPE (fatal)

**Sentry ID:** `69142659`
**Level:** 🔴 FATAL
**Route:** `POST /api/generate-voice`
**File:** `app/api/generate-voice/route.ts`
**Mechanism:** `auto.node.onuncaughtexception` — **unhandled**, crashes the Lambda
**User:** `cbab6d29-079f-4884-9f1a-e0b01af3e0d7` (Android, Brave 145)
**Last seen:** 2026-02-24T07:10:12Z

#### Root Cause

The user waited ~5 minutes while the server was calling `gemini-2.5-pro-preview-tts`. The Google TTS fetch failed with `TypeError: fetch failed sending request` (a network-level failure, not an AbortError). Because the error is not recognised as an `AbortError`, the code falls into the retry path (flash model). By the time the retry completes, the client has already disconnected. When Node.js tries to write the HTTP response to a closed TCP socket it throws `write EPIPE` — an **uncaught exception** that crashes the Vercel Lambda.

#### Timeline

```
07:04:53  Redis pipeline checked (cache miss)
07:09:53  Google TTS fetch fails — "TypeError: fetch failed sending request"
07:10:12  write EPIPE — client already gone, Lambda crashes
```

#### Related issue

This is the same user/server/timestamp as **SEXYVOICE-AI-4Z**. The AbortError (4Z) and the EPIPE (3E) are two sides of the same request: the Google SDK wraps the native `AbortError` into a generic `Error`, bypassing the existing `error.name === 'AbortError'` guard, so the code tries to retry and then respond to a dead socket.

#### Fix Proposed

1. **Check `request.signal.aborted` in the catch block** before attempting to send any response. This avoids writing to a dead socket:

   ```app/api/generate-voice/route.ts
   } catch (error) {
     // Client disconnected — do not attempt to write to a closed socket
     if (request.signal.aborted) {
       return new Response(null, { status: 499 });
     }
     ...
   }
   ```

2. **Broaden the AbortError guard** (see SEXYVOICE-AI-4Z fix) so the inner retry is never reached when the request was aborted.

3. **Downgrade EPIPE in Sentry** — if the EPIPE persists (e.g. race between abort signal and socket close), add it to `ignoreErrors` in `sentry.server.config.ts` since it's not actionable and should not be `fatal`.

#### Status: 🔧 Fix proposed — implement alongside SEXYVOICE-AI-4Z

---

### SEXYVOICE-AI-4W — Voice generation failed, please retry

**Sentry ID:** `86296844`
**Level:** 🔴 error
**Route:** `POST /api/generate-voice`
**File:** `app/api/generate-voice/route.ts`
**Handled:** yes
**User:** `4a360d1d-f4a6-4aaf-a4db-62d06ac1f80f` (Windows, Chrome 145)
**Last seen:** 2026-02-24T10:27:36Z

#### Root Cause

The Google Gemini TTS HTTP call returned **200 OK**, but the response contained no audio data or had a non-`STOP` finish reason (e.g. `MAX_TOKENS`, `SAFETY`, or empty `inlineData`). The route correctly throws `getErrorMessage('OTHER_GEMINI_BLOCK', 'voice-generation')` in this case. However, when the error is captured to Sentry via the outer catch block, only `{ text, voice, errorData }` is attached — **`finishReason` and `blockReason` are not included** — so it is impossible to distinguish _why_ Gemini returned 200 but no audio.

#### Breadcrumb trail

```
10:26:57  GET voices (Supabase) → 200
10:26:57  GET credits (Supabase) → 200
10:26:57  GET credit_transactions (Supabase) → 200
10:26:57  POST Redis pipeline → 200 (cache miss)
10:27:36  POST gemini-2.5-pro-preview-tts → 200  ← succeeds at HTTP level
             └── but finishReason ≠ STOP or data/mimeType missing → error thrown
```

#### Fix Proposed

Attach `finishReason` and `blockReason` to the Sentry `captureException` context when the `OTHER_GEMINI_BLOCK` error is thrown, so future occurrences are diagnosable:

```app/api/generate-voice/route.ts
// before the throw, add captureException directly so context is rich:
captureException(
  new Error('Gemini 200 but no audio data'),
  {
    extra: {
      finishReason,
      blockReason,
      hasData: !!data,
      mimeType,
      model: modelUsed,
      isProhibitedContent,
      text: text.slice(0, 200),
      voice,
    },
    user: { id: user.id },
  },
);
throw new Error(
  isProhibitedContent
    ? getErrorMessage('PROHIBITED_CONTENT', 'voice-generation')
    : getErrorMessage('OTHER_GEMINI_BLOCK', 'voice-generation'),
  { cause: isProhibitedContent ? 'PROHIBITED_CONTENT' : 'OTHER_GEMINI_BLOCK' },
);
```

This will give visibility into whether `MAX_TOKENS`, `SAFETY`, or something else is blocking output, so we can decide whether to retry, increase token limits, or adjust safety settings.

#### Status: 🔧 Fix proposed — add richer Sentry context

---

### SEXYVOICE-AI-4F — Google Generative AI 500

**Sentry ID:** `85880503`
**Level:** 🔴 error
**Route:** `POST /api/generate-voice`
**File:** `app/api/generate-voice/route.ts`
**Handled:** yes
**User:** `33d2adc3-6fc2-4ebd-9636-3c231ed49a72` (Windows, Brave 145)
**Last seen:** 2026-02-24T09:30:39Z

#### Root Cause

Both `gemini-2.5-pro-preview-tts` and the flash fallback `gemini-2.5-flash-preview-tts` returned HTTP 500 from Google's API. The retry logic is correct but the flash fallback is **outside the inner try-catch**, so when it also fails, the error propagates to the outer catch as an unhandled `ApiError`. This is a transient upstream Google outage — not a bug in the application — yet it creates noise in Sentry.

#### Breadcrumb trail

```
09:30:11  GET credit_transactions (Supabase) → 200
09:30:11  POST Redis pipeline → 200 (cache miss)
09:30:37  POST gemini-2.5-pro-preview-tts → 500  ← Google internal error
09:30:37  console.warn ApiError logged
09:30:39  POST gemini-2.5-flash-preview-tts → 500  ← fallback also fails
```

#### Fix Proposed

1. **Wrap the flash fallback** in its own try-catch so we can add context and return a clean 503:

   ```app/api/generate-voice/route.ts
   try {
     modelUsed = 'gemini-2.5-flash-preview-tts';
     genAIResponse = await ai.models.generateContent({ model: modelUsed, ... });
   } catch (flashError) {
     logger.error('Both Gemini models failed', {
       originalModel: 'gemini-2.5-pro-preview-tts',
       fallbackModel: modelUsed,
       error: flashError instanceof Error ? flashError.message : String(flashError),
     });
     return NextResponse.json(
       { error: 'Voice generation service is temporarily unavailable. Please try again in a moment.' },
       { status: 503 },
     );
   }
   ```

2. **Filter transient Google 500s from Sentry alerts** — these are not actionable. Can add a `beforeSend` filter or tag them with `google_upstream_error: true` and exclude from alert rules.

#### Status: 🔧 Fix proposed — wrap flash fallback, filter from Sentry noise

---

### SEXYVOICE-AI-4X — TypeError: Cannot read properties of undefined (reading 'length')

**Sentry ID:** `86297588`
**Level:** 🔴 error
**Route:** `POST /api/clone-voice`
**Files:** `app/api/clone-voice/route.ts`, `lib/audio-converter.ts`
**Handled:** yes
**User:** `32cecd3c-61ce-446d-874f-5a54cc8f32f1` (Android, Brave 145)
**Last seen:** 2026-02-24T08:41:02Z

#### Root Cause

A user uploaded a **WhatsApp voice message** (`PTT-20250724-WA0004.opus`, `audio/ogg`, 22 371 bytes) with locale `es`. The file was routed through `convertToWav()` → `decodeOggOpus()`. The decoder returned successfully (no exception thrown) but with an **empty `channelData` array** (`[]`). The call then reached `interleaveChannels(channelData)`:

```lib/audio-converter.ts
function interleaveChannels(channelData: Float32Array[]): Float32Array {
  const numChannels = channelData.length; // 0 — skips the numChannels === 1 guard
  if (numChannels === 1) { return channelData[0]; }

  const length = channelData[0].length; // 💥 channelData[0] is undefined → TypeError
  ...
}
```

WhatsApp `.opus` files use a non-standard OGG framing that the `ogg-opus-decoder` parses without throwing but produces 0 decoded channels. The existing Opus→Vorbis fallback is only triggered on a `catch`, never on empty output.

#### Stack trace (from breadcrumb)

```
TypeError: Cannot read properties of undefined (reading 'length')
  at interleaveChannels (lib/audio-converter.ts)     ← channelData[0] is undefined
  at convertToWav (lib/audio-converter.ts)
  at processAudioFile (app/api/clone-voice/route.ts)
  at POST (app/api/clone-voice/route.ts)
```

#### Fix Applied ✅

Two changes in `lib/audio-converter.ts`:

1. Guard `interleaveChannels` against empty input:

   ```lib/audio-converter.ts
   function interleaveChannels(channelData: Float32Array[]): Float32Array {
     const numChannels = channelData.length;
     if (numChannels === 0) {
       throw new Error('Decoded audio contains no channels');
     }
     if (numChannels === 1) {
       return channelData[0];
     }
     ...
   }
   ```

2. After `decodeOggOpus`, validate before returning — if `channelData` is empty, fall through to the Vorbis decoder:

   ```lib/audio-converter.ts
   case 'ogg':
   case 'opus': {
     let opusResult: DecodedAudio | null = null;
     try {
       opusResult = await decodeOggOpus(audioData);
     } catch (_opusError) {
       // fall through to Vorbis
     }
     if (!opusResult || opusResult.channelData.length === 0 || opusResult.samplesDecoded === 0) {
       decoded = await decodeOggVorbis(audioData);
     } else {
       decoded = opusResult;
     }
     break;
   }
   ```

See commit for full diff.

#### Status: ✅ Fixed

---

### SEXYVOICE-AI-4Z — AbortError: This operation was aborted sending request

**Sentry ID:** `86340926`
**Level:** 🔴 error
**Route:** `POST /api/generate-voice`
**File:** `app/api/generate-voice/route.ts`
**Handled:** yes
**User:** `cbab6d29-079f-4884-9f1a-e0b01af3e0d7` (Android, Brave 145)
**Last seen:** 2026-02-24T07:10:12Z

#### Root Cause

Same user and Lambda invocation as **SEXYVOICE-AI-3E**. When the client disconnects, `request.signal` fires, `abortController.abort()` is called, and the Google AI SDK's fetch is cancelled. However, the SDK wraps the native `AbortError` into a generic `Error` with a message like `"exception AbortError: This operation was aborted"` — the `error.name` stays `"Error"`, not `"AbortError"`. The existing guard:

```app/api/generate-voice/route.ts
if (error instanceof Error && error.name === 'AbortError') { ... }
```

…never matches, so the error falls through into the retry path and eventually reaches Sentry.

#### Fix Applied ✅

Broaden the abort detection to also match on message content, covering SDK-wrapped aborts:

```app/api/generate-voice/route.ts
function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'AbortError' ||
    error.message.toLowerCase().includes('aborted') ||
    error.message.toLowerCase().includes('abort error')
  );
}
```

Replace all `error.name === 'AbortError'` checks in the route with `isAbortError(error)`, and add the `request.signal.aborted` check in the outer catch (see SEXYVOICE-AI-3E).

#### Status: ✅ Fixed

---

### SEXYVOICE-AI-5X — NotAllowedError: iOS audio autoplay

**Sentry ID:** `97213047`
**Level:** 🔴 error
**Page:** `/en/dashboard/clone` (iPhone, Chrome Mobile iOS 145, iOS 26.3.0)
**File:** `components/audio-player-with-context.tsx` → `audio-provider.tsx`
**Mechanism:** `auto.browser.global_handlers.onunhandledrejection` — **unhandled**
**Last seen:** 2026-02-24T05:30:18Z

#### Root Cause

After a successful clone-voice API call, the audio URL is passed to `setUrlAndPlay()` in `AudioProvider`, which calls `new Audio(url).play()`. On iOS, audio autoplay after an async operation (the clone API taking ~1 s) is blocked because the user gesture context is lost by the time `play()` is called. The result is a `NotAllowedError`.

The `setUrlAndPlay` function **does** catch this:

```app/[lang]/(dashboard)/dashboard/clone/audio-provider.tsx
playPromise.catch((error) => {
  if (error.name !== 'AbortError') {
    console.error('Audio play error:', error);  // logged but not re-thrown
  }
});
```

However the `play()` function (used when the user explicitly clicks play on an already-loaded URL) does **not** handle the returned Promise at all:

```app/[lang]/(dashboard)/dashboard/clone/audio-provider.tsx
const play = () => {
  if (url) {
    audioRef.current?.play(); // ← Promise return value discarded → unhandled rejection
    setIsPlaying(true);
  }
};
```

The unhandled promise rejection bubbles up as a global error, which Sentry captures.

#### Fix Applied ✅

Handle the Promise returned by `play()` in `AudioProvider`, reset `isPlaying` state on failure, and silence `NotAllowedError` (expected on iOS) while still logging unexpected errors:

```app/[lang]/(dashboard)/dashboard/clone/audio-provider.tsx
const play = () => {
  if (url && audioRef.current) {
    const promise = audioRef.current.play();
    setIsPlaying(true);
    if (promise !== undefined) {
      promise.catch((error: unknown) => {
        if (error instanceof Error && error.name === 'NotAllowedError') {
          // iOS blocks autoplay without a direct user gesture — reset state silently
          setIsPlaying(false);
        } else if (!(error instanceof Error && error.name === 'AbortError')) {
          console.error('Audio play error:', error);
          setIsPlaying(false);
        }
      });
    }
  }
};
```

#### Status: ✅ Fixed

---

### SEXYVOICE-AI-4M — AbortError: play() interrupted by pause()

**Sentry ID:** `86120517`
**Level:** 🔴 error
**Page:** `/en` (landing page, Opera 127, Windows ≥10)
**File:** `components/audio-player-with-context.tsx` → `audio-provider.tsx`
**Mechanism:** `auto.browser.global_handlers.onunhandledrejection` — **unhandled**
**Last seen:** 2026-02-23T19:24:50Z

#### Root Cause

The user clicked the **Pause** button while `play()` was still resolving its Promise (the browser hadn't yet started actual playback). This is a classic HTML5 audio race condition: the browser throws `AbortError: The play() request was interrupted by a call to pause()` and since the Promise returned by `audioRef.current.play()` is discarded (same unhandled Promise as SEXYVOICE-AI-5X), it surfaces as an unhandled rejection.

#### Breadcrumb trail

```
19:24:26  RSC fetch (navigated away to /signup, returned)
19:24:28  ui.click on [aria-label="Pause"] button
             └── play() Promise still pending → pause() called → AbortError (unhandled)
```

#### Fix Applied ✅

The same `play()` Promise handling fix from SEXYVOICE-AI-5X covers this case — `AbortError` is already silenced in `setUrlAndPlay`, and the fix to `play()` in `audio-provider.tsx` silences it there too:

```app/[lang]/(dashboard)/dashboard/clone/audio-provider.tsx
promise.catch((error: unknown) => {
  // AbortError is expected when pause() is called before play() resolves
  if (error instanceof Error && error.name === 'AbortError') return;
  ...
});
```

This is the same single-line fix as 5X — both are resolved by fixing `play()` in `audio-provider.tsx`.

**Note:** The landing page also uses an audio player (voice demo). Check whether that player uses `AudioProvider` or a separate implementation — if separate, apply the same Promise guard there too.

#### Status: ✅ Fixed (covered by SEXYVOICE-AI-5X fix)

---

### SEXYVOICE-AI-4T — TypeError: Load failed (iOS Safari)

**Sentry ID:** `86225547`
**Level:** 🔴 error
**Page:** `/en/dashboard/credits` (iPhone, Mobile Safari 16.6.1, iOS 16.7.14)
**Mechanism:** `auto.browser.global_handlers.onunhandledrejection` — **unhandled**
**Last seen:** 2026-02-23T18:40:48Z

#### Root Cause

`"Load failed"` is Mobile Safari's generic error for any `fetch()` / resource load that fails at the network level — it provides no additional detail. The user navigated from `/dashboard/call?preset=...` to `/dashboard/credits` on iOS 16 (old Safari, no iOS 17+ improvements). The failure occurred immediately after navigation, which points to one of:

1. **A Next.js RSC prefetch** that failed (network blip on mobile)
2. **An audio element** still playing from the call page trying to load a resource after the context changed
3. **An expired Supabase session cookie** causing a 401 that Safari surfaces as a load error
4. **iOS 16 Safari compatibility** — older Safari versions are stricter about fetch with credentials/CORS in certain contexts

#### Breadcrumb trail

```
18:40:46  GET /dashboard/credits?_rsc=tsiir → 200
18:40:46  ui.click on credits link (gradient "Buy credits" link)
18:40:47  GET /dashboard/credits?_rsc=1rgth → 200 (×2)
18:40:48  navigation from /dashboard/call?preset=... → /dashboard/credits
             └── "Load failed" (no URL captured, unhandled rejection)
```

The missing URL in the failed fetch suggests it may be a resource loaded by JavaScript after navigation (e.g. audio file, Stripe.js, or a dynamic import) rather than a page fetch.

#### Fix Proposed

Without more information it is hard to produce a targeted fix. Next steps:

1. **Add a global `unhandledrejection` handler** that logs the failing URL/resource to Sentry with more context, so future occurrences are diagnosable.
2. **Check if Stripe.js or another 3rd-party script** is being loaded on `/dashboard/credits` — these can fail on older iOS and the error surfaces as `Load failed`.
3. **Verify the `AudioProvider` cleanup** — ensure audio is fully stopped and `src` is cleared on navigation (the `useEffect` cleanup in `audio-provider.tsx` should handle this, but verify it runs before the new page's fetches begin).
4. **Monitor frequency** — if this is a one-off network blip on iOS 16 (EOL as of mid-2025), may not warrant a fix.

#### Status: 🔍 Monitoring — needs more data before a targeted fix

---

## Changelog

| Date | Action |
|---|---|
| 2026-02-24 | Initial triage of 8 issues from week of Feb 24 |
| 2026-02-24 | Fixed SEXYVOICE-AI-4X (`interleaveChannels` empty channelData guard) |
| 2026-02-24 | Fixed SEXYVOICE-AI-4Z (broadened AbortError detection in generate-voice) |
| 2026-02-24 | Fixed SEXYVOICE-AI-5X + 4M (unhandled `play()` Promise in audio-provider) |
| 2026-02-24 | Proposed fix for SEXYVOICE-AI-3E (EPIPE — check `request.signal.aborted` before responding) |
| 2026-02-24 | Proposed fix for SEXYVOICE-AI-4W (richer Sentry context for Gemini 200/no-data) |
| 2026-02-24 | Proposed fix for SEXYVOICE-AI-4F (wrap flash fallback, filter Google 500s from Sentry) |
| 2026-02-24 | Monitoring SEXYVOICE-AI-4T (iOS Safari "Load failed" — insufficient data) |
| 2026-02-24 | Updated `tests/generate-voice.test.ts`: rewrote vacuous abort test to assert 499; added test for SDK-wrapped AbortError (SEXYVOICE-AI-4Z); added test for 503 both-models-failed (SEXYVOICE-AI-4F); re-threw `googleapis` errors from flash catch so quota test remains green |
