# Generate voice route on Effect

## Goal

Rewrite `apps/web/app/api/generate-voice/route.ts` on Effect 4 so the request
pipeline reads top to bottom, credit reservations refund themselves, and every
failure is a typed value that one table maps to an HTTP response. Keep the HTTP
contract, the Sentry calls, and the tests in `apps/web/tests/generate-voice.test.ts`
unchanged. Add structured logs and per-stage timings when `NODE_ENV` is
`development`.

Then move `apps/web/app/api/v1/speech/route.ts` onto the same modules. The
external API keeps its response contract, its Axiom logging and its OpenAPI
schema, and stops carrying its own copy of the credit and provider logic.

## Prerequisite

Implementation waits until `automation/fix-sentry-9z-gemini-safety` is merged
into `main`. That branch changes Gemini safety-block classification in
`lib/tts/gemini-response.ts`, edits both routes, and adds tests to
`generate-voice.test.ts` and `api-v1-speech.test.ts`. Before Phase 0, rebase
this branch on `main`, re-check the line references and test counts in this
plan, and build `GeminiBlocked` on the merged classifier rather than the one
described here. Provider status alignment across routes (503 and
`PROVIDER_UNAVAILABLE` for transient failures) came from #550, commit
310c2c5c, and is already on `main`.

## What the route looks like today

`route.ts` is 1706 lines. `POST` runs from line 267 to line 1245.

- Twelve `let` variables sit at the top of `POST` (`text`, `voiceId`,
  `voiceName`, `user`, `userHasPaid`, `modelUsed`, `reservedCredits`, ...) so
  the `catch` block at line 1093 can read them. That catch is a 150-line
  classifier. It rebuilds what happened from `error.cause`,
  `voiceGenerationErrorCode`, `parseGoogleApiError`, `isAbortError` and
  `request.signal.aborted`, and the order of the checks matters.
- Errors are stringly typed. Provider failures become
  `Object.assign(new Error(msg, { cause }), { provider, voiceGenerationErrorCode })`
  (lines 105 to 116, 902 to 907, 944 to 948). Gemini blocks become
  `new Error(msg, { cause: 'PROHIBITED_CONTENT' })`. Nothing checks these
  shapes at compile time.
- The credit reservation is manual bookkeeping. `reduceCredits`, then
  `reservedCredits = estimate` (line 587). Success reconciles and sets
  `reservedCredits = 0`. The catch refunds when `reservedCredits > 0 && user`.
  The streaming helper repeats this with a `completed` flag and a `finally`.
  Every new early return has to remember the refund.
- `streamGeminiTtsResponse` (lines 1249 to 1671) is a 420-line immediately invoked async function (the `(async () => { ... })()` block at line 1293) with
  nine mutable flags. It duplicates the JSON path's model selection, pro to
  flash fallback, block classification, upload, cache write, billing
  reconcile, `saveAudioFile`, `insertUsageEvent` and PostHog call.
- `refundReservedCredits` and `reconcileReservedCredits` (lines 142 to 259)
  exist again in `app/api/v1/speech/route.ts` (lines 191 to 300) with Axiom
  logging instead of Sentry.
- Observability is about forty hand-built `{ extra, user }` objects plus
  `console.warn`, `console.info`, `console.error` and one `console.dir` gated
  on `NODE_ENV === 'development'` (line 805). Nothing measures how long the
  provider call, the upload or the reconcile took.

Most of the last fifteen commits that touched the file fix error
classification, billing or streaming. That churn is what the rewrite targets.

## What must not change

The test file is the contract (59 passing, 16 parked behind the streaming
hotfix). It mocks at module boundaries and asserts on
Sentry calls, so the rewrite keeps both.

- Module mocks in `tests/setup.ts`: `@/lib/supabase/queries`,
  `@/lib/supabase/server`, `@upstash/redis` (`Redis.fromEnv`), `@google/genai`
  (`GoogleGenAI` class, factory swapped per test), `replicate` (default
  class), `@/lib/storage/upload`, `@/lib/posthog`, `next/server` (`after` runs
  inline), `@sentry/nextjs`. New code calls these same modules.
  `new GoogleGenAI(...)` and `new Replicate()` stay per request, because
  `setMockGoogleGenAIFactory` swaps the factory between tests and a client
  built once at module load would miss it.
- 46 assertions on `Sentry.logger.{info,warn,error}` and
  `Sentry.captureException`. They check exact message strings (for example
  `'gemini-2.5-pro-preview-tts failed, retrying with gemini-2.5-flash-preview-tts'`),
  `extra` through `objectContaining`, and `user` by exact equality. Every
  message and payload stays. Which errors reach `captureException` and which
  do not is part of the contract.
- Response bodies and status codes, including the two odd ones:
  `NextResponse.json({ errorCode: 'gproLimitExceeded' }, { status: 403 })` and
  the empty `499` when the client has already gone.
- The error object passed to `captureException` for non-transient Replicate
  and Grok failures still exposes `cause`, `message` and
  `voiceGenerationErrorCode` (assertion at test line 680).
- Cache hash input, R2 filename, Redis key, credit math, `after()` for
  persistence, `maxDuration = 600`, SSE frame format, the
  `GEMINI_STREAMING_ENABLED` gate.

## Target design

### Files

```sh
apps/web/lib/effect/runtime.ts              ManagedRuntime, dev and prod observability layers
apps/web/lib/effect/telemetry.ts            Sentry bridge: logInfo, logWarn, logError, capture as Effects
apps/web/lib/tts/credit-reservation.ts      reserve, reconcile, refund as a scoped resource
apps/web/lib/tts/providers/errors.ts        provider-level tagged errors shared by both routes
apps/web/lib/tts/providers/gemini.ts        generate and generateStream with fallback and block classification
apps/web/lib/tts/providers/grok.ts          generateXaiTts wrapper
apps/web/lib/tts/providers/replicate.ts     replicate.run wrapper
apps/web/app/api/generate-voice/
  route.ts        HTTP edge: parse body, run program, map Exit to Response (about 120 lines)
  request.ts      body Schema, normalization, limits, cache key
  errors.ts       route-level tagged errors and errorToResponse
  generate.ts     the JSON pipeline and the after() persistence step
  stream.ts       the SSE pipeline
  gemini-tts.ts   unchanged
apps/web/app/api/v1/speech/
  route.ts        HTTP edge: auth, rate limit, run program, map Exit, updateApiKeyLastUsed
  errors.ts       route-level tagged errors mapped to createApiError bodies and Axiom codes
  speech.ts       the pipeline
```

Credit reservation and the provider wrappers live under `lib/tts/` because
both routes use them. Route-specific pieces (request parsing, error to
response mapping, the pipeline) stay next to their `route.ts`, which matches
the existing `gemini-tts.ts`. Add `lib/tts/providers/*.ts` and
`lib/tts/credit-reservation.ts` to the coverage include in
`vitest.config.mts`.

### No Context.Service layers for providers or queries

Effect's guide recommends services for everything. This plan does not follow
it. The test doubles already live at the module boundary through `vi.mock`,
and a Layer would be a second seam nobody uses. Providers, queries and storage
are plain `Effect.fn` functions that call the existing modules.
`credit-reservation.ts` takes its query functions as an argument object so
`v1/speech` can pass the `*Admin` variants. The only Layer is observability,
built once in `runtime.ts`. Revisit when a real second implementation shows up.

### Errors

One tagged error per outcome. Provider-level errors live in
`lib/tts/providers/errors.ts` and are shared with `v1/speech`; route-level
ones live in `errors.ts` next to the route. `errorToResponse` is a
`Match.exhaustive` over the union, so an error without a response fails
`tsc`.

| Error                                                                                    | Status                     | Body                                                                                                        | Sentry capture                                                |
| ---------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `InvalidRequest { message }`                                                             | 400                        | `Request body is empty`, `Invalid JSON in request body`, `Missing required parameters`, the length messages | no                                                            |
| `Unauthenticated`                                                                        | 401                        | `User not found`                                                                                            | no                                                            |
| `VoiceNotFound`                                                                          | 404                        | `Voice not found`                                                                                           | yes, as today                                                 |
| `StreamingDisabled`                                                                      | 409                        | current message                                                                                             | no                                                            |
| `GproLimitExceeded`                                                                      | 403                        | `{ errorCode: 'gproLimitExceeded' }`                                                                        | no                                                            |
| `InsufficientCredits`                                                                    | 402                        | `Insufficient credits`                                                                                      | no                                                            |
| interrupted exit (client abort through `request.signal`)                                 | 499                        | empty                                                                                                       | no                                                            |
| `ProviderAborted` (SDK-wrapped AbortError)                                               | 499                        | `Request aborted`                                                                                           | no                                                            |
| `GeminiBlocked { code }` for `PROHIBITED_CONTENT`, `NO_AUDIO_DATA`, `OTHER_GEMINI_BLOCK` | `getErrorStatusCode(code)` | `getErrorMessage(code)`                                                                                     | only `OTHER_GEMINI_BLOCK` from an unrecognised response shape |
| `GeminiQuotaExceeded`                                                                    | 429                        | free or paid quota message                                                                                  | no                                                            |
| `GeminiInvalidArgument { tooLong }`                                                      | 400 or 422                 | too-long or `OTHER_GEMINI_BLOCK` message                                                                    | no                                                            |
| `ProviderUnavailable { provider, cause }`                                                | 503                        | `providerUnavailableResponse`                                                                               | no                                                            |
| `ProviderFailed { provider, voiceGenerationErrorCode, cause }`                           | 500                        | `getErrorMessage(code)`                                                                                     | yes                                                           |
| defect (anything else)                                                                   | 500                        | `Failed to generate voice`                                                                                  | yes                                                           |

`ProviderFailed` keeps the property names `cause` and
`voiceGenerationErrorCode` plus a `message` getter so the existing
`objectContaining` assertion holds.

Google API classification (quota, transient, invalid argument, too long) moves
out of the route's `catch` and into the `catch` of `Effect.tryPromise` in
`gemini.ts`. The pro to flash fallback then reads as
`generate(pro).pipe(Effect.catchIf(isRetryable, () => generate(flash)))`, and
the final error is already typed when it leaves the provider.

### Credits as a scoped resource

```ts
// lib/tts/credit-reservation.ts
export const reserveCredits = Effect.fn("reserveCredits")(function* (
  ops: CreditOps, // { reduceCredits, reduceCreditsUpTo, restoreCredits }
  { amount, context, userId }: ReserveInput,
) {
  yield* ops.reduceCredits({ amount, userId }).pipe(Effect.mapError(toInsufficientCreditsOrDefect));
  const settled = yield* Ref.make(false);
  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      if (yield* Ref.get(settled)) return;
      // logs and captures on failure, never throws
      yield* refund(ops, { amount, context, userId });
    }),
  );
  return {
    reconcile: (actualCredits: number) =>
      reconcile(ops, { actualCredits, amount, context, userId }).pipe(
        Effect.tap(() => Ref.set(settled, true)),
      ),
  };
});
```

The program runs inside `Effect.scoped`. If anything after the reservation
fails, is interrupted by a client abort, or dies, the finalizer refunds once.
`reconcile` marks the reservation settled so a later failure (PostHog,
persistence) cannot refund twice. The `reservedCredits = 0` lines disappear.

### Providers

Each provider exposes one `Effect.fn` that takes a provider request (text,
voice name, model, generation config) and returns
`{ audioBuffer, contentType, modelUsed, usage, predictionId? }`. They fail
with the provider-level errors in `lib/tts/providers/errors.ts`:
`ProviderAborted`, `ProviderUnavailable { provider, cause }`,
`ProviderFailed { provider, voiceGenerationErrorCode, cause }`,
`GeminiBlocked { code, response }`, `GeminiQuotaExceeded` and
`GeminiInvalidArgument { tooLong }`. Each route maps these to its own
responses and logs, so the provider modules do no route-specific logging or
Sentry capture.

- `gemini.ts` has `generate` and `generateStream`. Both call
  `Effect.tryPromise({ try: (signal) => ai.models.generateContent({ ...config, abortSignal: signal }), catch: classifyGeminiError })`.
  Effect owns the AbortSignal, so a client abort interrupts the fiber and
  cancels the provider call. `classifyGeminiTtsResponse` stays where it is.
  The pro to flash fallback lives here once:
  `generate(primary).pipe(Effect.catchIf(isRetryable, (error) => onFallback(error).pipe(Effect.andThen(generate(flash)))))`.
  `onFallback` is an optional effect from the caller. The dashboard passes
  one that emits its existing Sentry warn line; `v1/speech` passes nothing.
  The result carries `fallbackFrom` so the dashboard can log its success
  line with the same payload as today.
- `grok.ts` wraps `generateXaiTts`. Transient failures map to
  `ProviderUnavailable('grok')`, others to `ProviderFailed('XAI_TTS_ERROR')`
  with the raw error as `cause`.
- `replicate.ts` wraps `replicate.run` the same way and keeps the
  `onProgress` capture of the prediction for `predictionId` and metrics.

The dashboard's `captureException` calls stay in `generate.ts` next to the
response mapping. For a non-transient Grok failure that means two captures,
as today: the raw cause with user context, then the `ProviderFailed` object
from the generic path.

### The JSON pipeline

```ts
// generate.ts
export const generateVoice = Effect.fn("generateVoice")(
  function* (input: GenerateVoiceRequest) {
    const user = yield* requireUser();
    const voice = yield* loadVoice(input.voiceId);
    // limits, style prompt, effective model, hash, filename, estimate
    const plan = yield* planRequest(input, voice, user);
    yield* Effect.annotateLogsScoped({
      model: plan.effectiveModel,
      provider: plan.provider,
      userId: user.id,
      voice: voice.name,
    });
    const cached = yield* cacheLookup(plan.filename);
    if (cached) return yield* cachedResponse(cached, plan);
    const credits = yield* reserveCredits(dashboardCreditOps, {
      amount: plan.estimate,
      context: "generate_voice",
      userId: user.id,
    });
    const audio = yield* generateWithProvider(plan);
    const url = yield* upload(plan.filename, audio);
    yield* cacheStore(plan.filename, url);
    const creditsDebited = yield* credits.reconcile(actualCredits(plan, audio));
    // after(() => runtime.runPromise(persist(...)))
    yield* schedulePersistence({ audio, creditsDebited, plan, url, user });
    return {
      creditsRemaining: plan.currentAmount - creditsDebited,
      creditsUsed: creditsDebited,
      url,
    };
  },
  Effect.scoped,
  Effect.withLogSpan("generate-voice"),
);
```

`route.ts` does three things. It decodes the body with the Schema. It runs
`runtime.runPromiseExit(generateVoice(input), { signal: request.signal })`. It
maps the `Exit` through `errorToResponse`, where `Exit.hasInterrupts` is the
empty 499.

### Streaming

`stream.ts` replaces the immediately invoked async function (IIFE).
`Stream.fromAsyncIterable(ai.models.generateContentStream(...), classifyGeminiError)`
feeds a `Stream.runFoldEffect` whose accumulator is an immutable
`{ chunks, mimeType, usage, finishReason, blockReason }` record. Each audio
chunk is written to the SSE writer inside the fold. The fallback rule stays:
retry on flash only if no audio has been written and the error is not a
policy or terminal block. Persistence, reconcile and the `done` event reuse the
`generate.ts` helpers, which removes the duplicated block. `Effect.ensuring`
closes the writer. The route returns the `Response` at once and starts the
fiber with `runtime.runFork(program, { signal: request.signal })`.

The streaming tests are parked (`describe.skip('Streaming - Gemini SSE')`)
because of the hotfix flag. Verification for this phase runs them locally with
`GEMINI_STREAMING_ENABLED` mocked to `true`.

### Observability

`telemetry.ts` is the only module that talks to Sentry:

```ts
export const logWarn = (message: string, ctx: SentryContext) =>
  Effect.sync(() => Sentry.logger.warn(message, ctx)).pipe(
    Effect.andThen(Effect.logWarning(message, ctx.extra)),
  );
```

Production is unchanged. Sentry receives the same calls, and the Effect logger
set is empty so nothing prints twice.

In development (`process.env.NODE_ENV === 'development'`) `runtime.ts`
provides:

- `Logger.layer([Logger.consolePretty()])` with `References.MinimumLogLevel`
  set to `Debug`.
- Request-scoped annotations from `Effect.annotateLogsScoped` (user, voice,
  model, provider, stream). Every line in the request carries them without a
  hand-built `extra`.
- `Effect.withLogSpan` on the request and on each stage (`reserveCredits`,
  `gemini.generate`, `upload`, `reconcile`), so a log line reads
  `generate-voice=812ms gemini.generate=640ms ... Gemini voice generation succeeded`.
- `Effect.fn('name')` spans on every stage. No exporter in this plan. Adding
  `DevTools.layerWebSocketGlobal()` from `effect/unstable/devtools` (the
  Effect DevTools VS Code extension) or `@effect/opentelemetry` into Sentry's
  OpenTelemetry provider is a one-line follow-up.

The `console.dir` at line 805 becomes `Effect.logDebug('Gemini response', response)`,
which prints in development and is dropped elsewhere.

### Body parsing

`request.ts` decodes with a `Schema.Struct` of optional fields, then
normalizes: seed only when a safe non-negative integer, temperature clamped to
0..2, speed through `normalizeXaiTtsSpeed`, paid-only knobs dropped for free
users. A body with wrong types, for example `text: 123`, returns 400
`Invalid request body` instead of drifting into a 500 later. No test sends such
a body. This is the one intentional behaviour change. The
`Missing required parameters` and JSON messages stay.

## Phases

Each phase is one PR and ends with `pnpm fixall`, `pnpm type-check`,
`pnpm --filter @sexyvoice/web test -- tests/generate-voice.test.ts`, then
`pnpm test`.

### Phase 0: dependency and runtime

- Bump the `effect` catalog entry in `pnpm-workspace.yaml` to `4.0.0-rc.112`
  and change `apps/web/package.json` to `"effect": "catalog:"`, so `scripts`
  and `web` share one version.
- Add `lib/effect/runtime.ts` and `lib/effect/telemetry.ts`.
- Confirm the native `tsc` preview and Turbopack handle Effect 4 imports with
  `pnpm type-check` and `pnpm --filter @sexyvoice/web build`. Measure the
  server bundle with `pnpm --filter @sexyvoice/web analyze`.

### Phase 1: errors, request schema, credit reservation

- `errors.ts`, `request.ts`, `lib/tts/credit-reservation.ts`. No route change.
- New tests under `tests/generate-voice/`:
  - `credit-reservation.test.ts`: refund on failure, refund on interrupt, no
    refund after reconcile, reconcile down, reconcile up with partial debit,
    a failed refund is logged and captured but does not throw.
  - `request.test.ts`: seed gating, clamps, limits per tier, hash input
    stability against the current values.
  - `errors.test.ts`: every error maps to the status and body in the table,
    an interrupted exit maps to the empty 499, `ProviderFailed` satisfies the
    `objectContaining` shape used at test line 680.
  - `telemetry.test.ts`: `logWarn` produces exactly one
    `Sentry.logger.warn(message, ctx)` call.
- Plain vitest with `Effect.runPromiseExit`. `@effect/vitest` is not needed.

### Phase 2: providers and the JSON path

- `lib/tts/providers/{errors,gemini,grok,replicate}.ts` and
  `app/api/generate-voice/generate.ts`.
- `route.ts` switches the JSON path to `generateVoice`. The old
  `streamGeminiTtsResponse` stays and is called from the new route for the
  stream branch, so streaming code does not move in this PR.
- Delete the old `POST` body, `refundReservedCredits`,
  `reconcileReservedCredits`, `createProviderUnavailableError` and
  `providerUnavailableResponse` from `route.ts`.
- `generate-voice.test.ts` passes without edits. Watch the abort test at line
  2239: the signal is aborted before `POST` runs and the test only checks for
  status 499, so an immediately interrupted exit is fine as long as
  `errorToResponse` handles it.
- Add a short `lib/effect` section to `ARCHITECTURE.md`.

### Phase 3: streaming

- `stream.ts` becomes the SSE implementation and the route calls it for the
  stream branch. Streaming itself stays, still gated by
  `GEMINI_STREAMING_ENABLED` and the 409 for stale clients. Delete the old
  `streamGeminiTtsResponse` helper once the parked tests pass against
  `stream.ts`, so there is one implementation of the path.
- Run the parked streaming tests with the flag mocked on. They pass without
  edits. They stay parked in the committed file until the hotfix is lifted.

### Phase 4: `v1/speech` on the same modules

`app/api/v1/speech/route.ts` is 1024 lines with the same shape. `POST` runs
from line 148 to line 1022. It has a per-request copy of
`refundReservedCredits` and `reconcileReservedCredits` (lines 191 to 315)
that logs to Axiom instead of Sentry, seven `let` variables for generation
state, a pro to flash fallback with its own classifier
(`getGeminiProviderFailure`, lines 85 to 125), fourteen `log()` plus
`respond()` pairs, and a `catch` that decides between policy, JSON and server
errors.

What must not change:

- The external contract. Every response goes through `createApiError` and
  `jsonWithRateLimitHeaders`, keeps its `code`, `type`, `param` and status,
  and carries the rate-limit and `request-id` headers. No change to
  `apps/docs/content/` or the OpenAPI output is needed, and none is made.
- `VoiceGenerationRequestSchema` stays zod because it feeds OpenAPI
  generation. The route keeps `safeParse` and `zodErrorToApiError`; Effect
  wraps the failure in an `InvalidRequest { body }` error instead of
  replacing the schema.
- Auth and rate limiting stay as the first early returns in `route.ts`, using
  `validateApiKey()` and `consumeRateLimit()` as the external API rules
  require. `updateApiKeyLastUsed()` still runs after every authenticated
  request, as `Effect.ensuring` around the program instead of a `finally`.
- Axiom logging through `createLogger()`. `log()` stays awaited on error paths
  and fire-and-forget on the success path. It is created per request and
  passed into the pipeline as an argument.
- Fresh audio every time with no Redis, the `R2_SPEECH_API_BUCKET_NAME`
  bucket and `R2_SPEECH_API_PUBLIC_URL`, the `Date.now()` filename, the
  `Promise.all` of `saveAudioFileAdmin` and `getCreditsAdmin`,
  `insertUsageEvent` awaited before the response, `maxDuration = 800` and
  `runtime = 'nodejs'`.
- The 57 tests in `tests/api-v1-speech.test.ts` and `tests/v1-speech.test.ts`
  pass without edits. They mock `@/lib/api/auth` and `@/lib/api/rate-limit`
  on top of the shared `tests/setup.ts` mocks and assert on
  `captureException` calls, refunds and response bodies.

Work:

- `errors.ts` for the route: `StorageNotConfigured`, `InvalidJson`,
  `InvalidRequest { body }`, `VoiceNotFound { param, message }`,
  `ModelNotFound`, `InputTooLong`, `UnsupportedFormat` and
  `InsufficientCredits`, plus the provider errors from
  `lib/tts/providers/errors.ts`. `errorToResponse` returns
  `{ status, body, logFields }` so the Axiom `errorCode` and the response
  body come from one table.
- `speech.ts`: the pipeline as an `Effect.fn`, mirroring `generate.ts`
  without the cache step, with `reserveCredits` given the `*Admin` query
  functions. Persistence stays inline rather than in `after()`, as today.
- `route.ts` shrinks to auth, rate limit, `runtime.runPromiseExit` and the
  `Exit` mapping.
- Delete `getGeminiProviderFailure` and the two credit helpers.
  `resolveProviderName` stays; it only names the provider for pricing and
  logs.
- Verification: `pnpm --filter @sexyvoice/web test -- tests/api-v1-speech.test.ts tests/v1-speech.test.ts`,
  then the full suite.
- Write the Agent Note under `.agents/notes/implemented/api/` with the
  decisions from both routes and the verification output.

Behaviour to check against the tests rather than assume:

- The two routes classify a double Gemini failure differently today. The
  dashboard classifies only the flash error (its outer `catch` receives the
  rethrown flash error). `getGeminiProviderFailure` in v1 reads both: quota
  only from the flash error, but a transient outage from either attempt. The
  shared provider classifies the last attempt, which is the dashboard rule.
  The one case that changes for v1 is a transient pro failure followed by a
  non-transient flash failure: 503 today, 500 after, matching the dashboard.
  That is the better answer, because a non-transient flash rejection will not
  go away on retry. The test at line 995 uses two transient errors and still
  passes. Say so in the PR.
- `GeminiInvalidArgument` is a 500 `server_error` with a capture in this
  route today. Keep that mapping. A 400 `input_too_long` would be a contract
  change with a docs update, so it is a separate PR.
- Non-transient Replicate errors are rethrown and land in the generic 500
  with a capture that carries `apiKeyId`, `endpoint`, `requestId` and
  `userId`. Non-transient Grok errors capture with
  `{ codec, model, requestId, voice }` and return a 500 `server_error` with
  no second capture. Both stay.

## Risks

- Effect 4 is a release candidate. The names used in this plan were checked
  against `node_modules/effect/src` at rc.112: `Effect.fn`,
  `Effect.tryPromise`, `Effect.addFinalizer`, `Effect.catchIf`,
  `Effect.annotateLogsScoped`, `Effect.withLogSpan`, `Schema.TaggedError`,
  `Stream.fromAsyncIterable`, `Stream.runFoldEffect`, `ManagedRuntime.make`,
  `Logger.consolePretty`, `References.MinimumLogLevel`, `Exit.hasInterrupts`,
  `Match.exhaustive`. A later RC may rename some. Pinning the catalog contains
  this.
- The server function grows by the Effect core. `sideEffects: []` in the
  package lets Turbopack tree-shake. Phase 0 measures it.
- `objectContaining` on a tagged error instance relies on property lookup
  through the prototype. The Phase 1 `errors.test.ts` case catches a
  regression before the route switches.
- Interrupt wiring changes. Today Replicate receives `request.signal`, while
  Gemini and Grok receive a derived controller. After the rewrite all three get
  Effect's signal, which fires on fiber interruption. The client sees the same
  result. The difference is that the refund finalizer also runs on
  interruption, where today it depends on the provider throwing.

## Out of scope

- Per-provider timeouts or retries beyond the pro to flash fallback.
  `Effect.timeout` and `Schedule` make these one-liners later, but they change
  billing behaviour and need their own decision.
- Exporting Effect spans to Sentry in production.
- Any change to the external API contract, including mapping Gemini
  invalid-argument failures to `input_too_long`.
- Moving `clone-voice` or `estimate-credits` to Effect.
