# Provider error localization

## State

Implemented according to
`plans/2026-08-31-provider-error-localization.md`.

## Decisions

- Keep provider IDs lowercase in route control flow and logs.
- Validate provider IDs at the response boundary and expose fixed brand names.
- Keep one canonical English fallback constant in the server helper and assert
  that `messages/en.json` matches it.
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
- `replicate@1.4.0` rejects `run()` when a prediction fails. Routes classify the
  rejection itself instead of accepting an impossible `{ error }` result shape.
- Grok classification wraps only `generateXaiTts()`. R2 upload failures remain
  platform errors and follow the generic Sentry path.
- Dashboard captures the original non-transient Grok error with codec, language,
  model, voice, text, and user context before returning its existing 500 error.
- The approved plan and this note remain separate. The plan defines scope; this
  note records the live mechanism and verification.
- The external API error-code documentation already describes
  `provider_unavailable`; these corrections do not change that contract.

## Verification

- `pnpm check-translations` passes.
- The seven focused provider, clone, dashboard generation, external speech, and
  React test files pass 247 tests with 20 parked tests skipped.
- `pnpm fixall` passes with five existing Sentry namespace-import warnings.
- `pnpm type-check` passes in every workspace package.
