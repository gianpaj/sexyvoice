# Internal Gemini audio streaming plan

## Goal

Add `stream: true` support to the internal `POST /api/generate-voice` endpoint for Gemini TTS. The dashboard should request streaming by default when a single Gemini generation has more than 300 characters. The user should hear audio as Gemini streams it, and the existing download button should still download the final persisted WAV file.

## Precondition

Before implementing audio streaming, remove the dashboard's `useNewModel` toggle flow and replace it with the planned selectable voice/model option flow. Streaming should not add new `useNewModel` behavior or tests. By the time this work starts, the frontend and backend should pass an explicit selected Gemini model or voice option instead of a `useNewModel` boolean.

## Scope

In scope:

- Internal dashboard endpoint: `apps/web/app/api/generate-voice/route.ts`.
- Gemini TTS only.
- Single-audio generation only.
- Frontend stream playback in `apps/web/components/audio-generator.tsx`.
- Existing final URL, R2 upload, Redis cache, credit deduction, usage logging, and download behavior.
- Backend tests in `apps/web/tests/generate-voice.test.ts`.
- Testing Library coverage for `AudioGenerator`.

Out of scope for the first pass:

- External API v1 streaming.
- Grok or Replicate streaming.
- Split-mode streaming per segment.
- Re-streaming cached R2 audio.
- Downloading from an in-memory streamed blob.

## Streaming response contract

Use server-sent-event-style frames instead of returning raw audio bytes directly. This lets the backend stream audio chunks early and still send the final persisted URL after upload.

Response headers:

```ts
{
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
}
```

Audio chunk event:

```txt
event: audio
data: {"data":"<base64 pcm chunk>","mimeType":"audio/L16;rate=24000"}
```

Completion event:

```txt
event: done
data: {"url":"https://files.sexyvoice.ai/generated-audio/...wav","creditsUsed":26,"creditsRemaining":123}
```

Error event after streaming has started:

```txt
event: error
data: {"error":"Something went wrong"}
```

Validation, authentication, quota, and credit errors that occur before streaming starts should keep the existing JSON error response behavior and HTTP status codes.

## Cache behavior

Use this v1 behavior:

```txt
Cache hit -> send done event only
```

If Redis has a cached URL and the request asks for `stream: true`, return an SSE response with only a `done` event:

```txt
event: done
data: {"url":"<cached-url>","creditsUsed":0,"creditsRemaining":<currentAmount>,"cached":true}
```

Do not fetch the cached WAV from R2 and proxy it through the endpoint. The frontend can set `audioURL` from the `done` event and play the cached file through the normal player.

## Backend plan

### 1. Parse `stream`

Read the request body field:

```ts
const stream = body.stream === true;
```

Only honor streaming for Gemini voices:

```ts
const shouldStream = stream && isGeminiVoice;
```

Ignore `stream: true` for Grok and Replicate so existing JSON behavior remains stable.

### 2. Keep validation before streaming

Run the existing pre-generation checks before creating a streaming response:

- Empty body.
- Required `text` and `voice`.
- Authenticated user.
- Voice lookup.
- Provider detection.
- Paid/free checks.
- Character limit.
- Credit availability.
- Final styled text.
- Effective model selection.
- Hash, filename, and cache lookup.

These failures should return normal JSON responses. Do not send SSE until generation is ready to start.

### 3. Refactor Gemini helpers first

Avoid expanding the already-large route inline. Add small helpers in the route file or a nearby module, such as `apps/web/app/api/generate-voice/gemini-tts.ts`.

Useful helpers:

```ts
buildGeminiTtsConfig({ voice, seed, abortSignal });
extractGeminiInlineAudio(response);
extractGeminiStreamAudioChunk(chunk);
convertAudioChunksToWav(chunks, mimeType);
createSseEvent(event, payload);
```

`convertAudioChunksToWav()` should match the validated script behavior:

- Concatenate streamed PCM chunks.
- Parse MIME types like `audio/L16;rate=24000`.
- Add a WAV header.
- Avoid double-wrapping if Gemini ever returns actual WAV chunks.

### 4. Add Gemini stream generation path

In the Gemini branch, route streaming requests to a dedicated function:

```ts
if (shouldStream) {
  return streamGeminiTtsResponse({ ... });
}
```

`streamGeminiTtsResponse()` should:

1. Call `ai.models.generateContentStream()` with the same TTS config shape as non-stream generation.
2. Iterate chunks.
3. For each inline audio part:
   - enqueue an `audio` SSE event,
   - collect the audio bytes for final WAV upload,
   - remember the MIME type.
4. Track usage metadata if Gemini provides it on stream chunks.
5. On completion:
   - validate that at least one audio chunk was received,
   - convert chunks to WAV,
   - upload the WAV to R2,
   - write the URL to Redis,
   - reduce credits,
   - save the audio file,
   - insert a usage event,
   - send the PostHog event,
   - enqueue the `done` SSE event,
   - close the stream.

### 5. Fallback behavior

For normal JSON generation, keep the current fallback behavior.

For streaming generation:

- If `generateContentStream()` fails before any audio chunk is sent, fallback to `gemini-2.5-flash-preview-tts`.
- If it fails after audio has started, emit an `error` SSE event and close the stream.

Do not switch models mid-stream after audio has started. That would mix models inside one audio file.

### 6. Billing and persistence

Only charge credits after a successful final upload.

Save the same durable records as non-stream generation:

- `reduceCredits()`.
- `saveAudioFile()`.
- `insertUsageEvent()`.
- `sendPosthogEvent()`.

Include `stream: true` in saved usage metadata and usage-event metadata.

If stream usage metadata includes `totalTokenCount`, calculate credits from tokens. Otherwise, fall back to the existing estimate.

### 7. Abort behavior

Connect the request signal to the Gemini abort controller.

On abort:

- stop reading Gemini chunks,
- stop enqueueing SSE events,
- do not upload,
- do not reduce credits,
- do not save audio or usage records,
- close the stream if it is still open.

## Frontend plan

### 1. Add stream threshold

In `apps/web/components/audio-generator.tsx`, add a threshold:

```ts
const STREAM_TEXT_THRESHOLD = 300;
```

Use streaming only when all conditions are true:

- selected voice is Gemini,
- not split mode,
- text length is greater than 300 characters.

### 2. Keep split mode on JSON path

Split mode should continue to call the existing JSON generation path per segment. Do not stream segments in the first pass.

### 3. Split request helpers

Replace the single JSON-only `requestGenerateVoice()` assumption with two helpers:

```ts
requestGenerateVoiceJson(...): Promise<string>
requestGenerateVoiceStream(...): Promise<string>
```

Both should resolve to the final R2 URL. The stream helper should play chunks while waiting for the final `done` event.

### 4. Add stream payload

For eligible requests, send:

```ts
{
  text,
  voice,
  styleVariant,
  language,
  stream: true,
}
```

Short Gemini text, non-Gemini text, and split-mode segments should omit `stream`.

### 5. Parse SSE events

Add a client helper that:

1. Reads `response.body` with `getReader()`.
2. Decodes chunks with `TextDecoder`.
3. Parses SSE event blocks.
4. Handles `audio`, `done`, and `error` events.
5. Resolves with the final URL from the `done` event.

### 6. Play streamed PCM with `AudioContext`

For each `audio` event:

- base64-decode the chunk,
- parse the sample rate from `mimeType`,
- convert signed 16-bit PCM to `Float32Array`,
- schedule it with `AudioContext`.

Use a queue-style scheduler:

```ts
const audioContext = new AudioContext({ sampleRate });
let nextStartTime = audioContext.currentTime;

function schedulePcmChunk(samples: Float32Array) {
  const audioBuffer = audioContext.createBuffer(1, samples.length, sampleRate);
  audioBuffer.copyToChannel(samples, 0);

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);

  const startAt = Math.max(audioContext.currentTime, nextStartTime);
  source.start(startAt);
  nextStartTime = startAt + audioBuffer.duration;
}
```

Track created sources so cancel can stop them.

### 7. State and cleanup

Add refs/state:

```ts
const streamingAudioContextRef = useRef<AudioContext | null>(null);
const streamingSourcesRef = useRef<AudioBufferSourceNode[]>([]);
const [isStreamingAudio, setIsStreamingAudio] = useState(false);
```

On cancel:

- abort the request,
- stop scheduled sources,
- close the audio context,
- clear refs,
- reset generating state.

### 8. UI behavior

While streaming:

- keep the generate button in its generating state,
- keep the cancel button available,
- play audio chunks immediately,
- wait to show the normal player and download button until the final URL arrives.

After the `done` event:

```ts
setAudioURL(finalUrl);
```

The existing player and download button can then work from the final R2 WAV URL.

## Backend tests

Update `apps/web/tests/setup.ts` so the Google mock includes `generateContentStream` by default.

Add tests to `apps/web/tests/generate-voice.test.ts`.

### Streams Gemini audio when requested

Request with:

```ts
{ text: 'Hello world', voice: 'kore', stream: true }
```

Assert:

- response `content-type` contains `text/event-stream`,
- `generateContentStream` was called,
- `generateContent` was not called,
- response body contains `event: audio`,
- response body contains `event: done`,
- response body contains the final R2 URL,
- upload, credit reduction, audio save, and usage logging happened.

### Cache hit sends done only

Seed Redis with a cached URL, request `stream: true`, and assert:

- response is SSE,
- body contains `event: done`,
- body contains the cached URL,
- body does not contain `event: audio`,
- Gemini streaming was not called,
- credits were not reduced.

### Non-Gemini ignores stream

Send `stream: true` for Grok or Replicate and assert the existing JSON contract still works.

### Selected Gemini model is used

After the `useNewModel` flow is removed, assert the new explicit model or selected voice option chooses the correct Gemini model for streaming.

### Fallback before first chunk

Mock the first stream call to throw before yielding chunks, then mock the flash fallback stream to succeed. Assert the response completes and saves the fallback model.

### Failure after stream starts

Mock a stream that yields one audio chunk and then throws. Assert the response contains an `error` event and no credits are reduced.

### No audio chunks

Mock a stream that completes without inline audio. Assert the response contains an `error` event and no durable billing records are written.

## Frontend tests

Add Testing Library coverage in `apps/web/tests/components/audio-generator.test.tsx`.

### Long Gemini text sends `stream: true`

Render with a Gemini voice, enter 301 characters, click Generate, and assert the request body includes:

```ts
stream: true;
```

### Short Gemini text does not stream

Enter 300 or fewer characters and assert `stream` is omitted.

### Long non-Gemini text does not stream

Use a Grok or Replicate voice with more than 300 characters and assert `stream` is omitted.

### Streaming schedules audio and sets final URL

Mock `fetch()` with an SSE response:

```txt
event: audio
data: {"data":"<base64 pcm>","mimeType":"audio/L16;rate=24000"}

event: done
data: {"url":"https://files.sexyvoice.ai/generated-audio/kore.wav","creditsUsed":26,"creditsRemaining":1000}
```

Mock `AudioContext` and assert:

- `AudioContext` was created,
- an audio source was scheduled,
- success toast was shown,
- the final player receives the R2 URL.

The `AudioPlayerWithContext` test mock may need to render the URL for assertion:

```tsx
AudioPlayerWithContext: ({ url }) => <div data-testid="audio-player" data-url={url} />;
```

### Download uses final R2 URL

After the streaming `done` event, click the existing download button and assert `downloadUrl()` receives the final R2 URL.

### Stream error shows toast

Mock an SSE `error` event and assert the error toast uses the streamed error message.

### Cancel aborts stream playback

Start a slow stream, click Cancel, and assert:

- the fetch signal is aborted,
- scheduled audio sources are stopped,
- the audio context is closed,
- generating state resets.

## Implementation phases

### Phase 1: Backend streaming

- Add `stream` parsing.
- Add SSE helpers.
- Add Gemini stream generation helper.
- Add backend tests.
- Keep frontend on the current JSON path until backend tests pass.

### Phase 2: Frontend stream playback

- Add the 300-character threshold.
- Add the SSE parser.
- Add PCM playback through `AudioContext`.
- Keep split mode and non-Gemini generation on the JSON path.
- Add Testing Library tests.

### Phase 3: Observability and polish

Add structured logs for:

- stream requested,
- stream started,
- first audio chunk received,
- stream completed,
- cache hit done-only response,
- stream aborted,
- stream failed before first chunk,
- stream failed after first chunk.

Include `stream: true` in audio-file usage metadata and usage-event metadata.

## Validation

Run focused tests first:

```bash
pnpm --filter @sexyvoice/web test -- apps/web/tests/generate-voice.test.ts
pnpm --filter @sexyvoice/web test -- apps/web/tests/components/audio-generator.test.tsx
```

Then run required checks:

```bash
pnpm fixall
pnpm type-check
```
