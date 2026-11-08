# Shared TTS generation core

Both generation routes use `lib/tts/gemini.ts` and `lib/tts/replicate.ts`.
Routes retain authentication, billing, refunds, storage, caching, telemetry,
and response formatting.

`gemini-prompt.ts` owns effective-model selection, styled prompts, contents,
and voice configuration. Keeping separate model/prompt implementations was
rejected because estimates and generation must use the same request.
`gemini-response.ts` owns response outcomes, including safety blocks and
`OTHER` without audio. The shared core extracts audio and uses those outcomes.

Gemini 3.8 keeps speech metadata, extended voice IDs, temperature, and its
single-attempt behavior. A 2.5 fallback cannot serve extended 3.8 voices.
Free `gpro31` voices select 3.1 and can fall back to Flash; `gpro` and `gpro31`
share the PR's free-generation cap. Streaming stays in the dashboard route.

The external API passes request cancellation to Gemini and Replicate. Abort
errors reach the route's refund path and return 499 without Sentry capture.
Main's provider-unavailable responses, credit reconciliation, guest generation,
and cancellation telemetry remain in the route orchestration.

The voice picker uses main's `voice-picker.tsx` and keyboard event types.
Vitest retains main's configuration with the PR's TTS and speech coverage paths.
CI configuration matches main.

Verification: `pnpm fixall`, `pnpm lint`, and `pnpm type-check` pass.
The full test run passed 1,635 web tests and 72 script tests, with 18 skips.
It failed 49 Redis-backed tests because CI mode had no localhost Redis service;
one UI timeout passed on a two-worker retry. The TTS core, generation routes,
Gemini 3.8, and response classification tests pass. The serialized build compiled
both apps and completed the docs build; web page-data collection requires the
missing `STRIPE_SECRET_KEY`. No CI configuration or dependency changes are needed.
