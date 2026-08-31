# Provider error localization

## State

Implemented according to
`plans/2026-08-31-provider-error-localization.md`.

## Decisions

- Keep provider IDs lowercase in route control flow and logs.
- Validate provider IDs at the response boundary and expose fixed brand names.
- Keep one English fallback template in `messages/en.json`.
- Keep the client resolver independent of React and `next-intl` so malformed
  payload behavior can be tested directly.
- Preserve the external API's public `provider_unavailable` code.
- Preserve clone response field compatibility by returning the shared code in
  `code`, while dashboard routes continue to use `errorCode`.

## Findings

- `APIErrorResponse` already accepts extra response fields, so dashboard JSON
  responses need no shared response refactor.
- Clone route errors already carry provider details. Their response boundary
  needs the shared code and display-name conversion.
- Gemini streaming failures are in-band SSE events on an established HTTP 200
  response. The event can carry the shared code and details, but cannot change
  the response status.
- `messages/en.json` defines the `next-intl` message schema for every locale.
- The external API retains its lowercase public code and logs its existing
  provider names, while formatting Grok and Gemini for the English response.
- Vitest needs a virtual `server-only` module because the package is available
  to Next.js builds but not the test runtime.
- Expected Grok provider warnings omit raw transcript text and retain provider,
  model, language, voice, and error metadata.
- Dashboard errors keep the existing `APIError` status suffix. Clone alerts keep
  their existing message-only presentation.
- Global provider codes resolve before feature-specific keys. Unknown dashboard
  codes still use `generate`, and clone validation still uses `clone.errors`.

## Verification

- `pnpm check-translations` passes.
- The seven focused provider, clone, dashboard generation, external speech, and
  React test files pass 242 tests with 20 parked tests skipped.
- `pnpm fixall` passes with five existing Sentry namespace-import warnings.
- `pnpm type-check` passes in every workspace package.
- `CI=1 pnpm test` passes all 51 script tests and 67 web test files. All 35 tests
  in `tests/stripe-webhook.test.ts` fail during Redis cleanup because the shared
  client is closed at `tests/utils/redis-test-utils.ts:97`. A standalone rerun
  fails at the same cleanup step.
