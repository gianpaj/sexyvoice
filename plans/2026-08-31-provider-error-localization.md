# Provider error localization plan

## Goal

Return one structured provider-unavailable error from cloning and voice
generation, keep an English server fallback, and let first-party React clients
translate the message through `next-intl`.

The user-facing template is:

```text
{provider} is temporarily unavailable. Please retry.
```

Supported provider values are `Grok`, `Gemini`, `Replicate`, and `Mistral`.

## Scope

- Consolidate `GEMINI_PROVIDER_UNAVAILABLE` and provider-specific failure text
  under `PROVIDER_UNAVAILABLE`.
- Cover clone, dashboard JSON generation, dashboard Gemini streaming, and the
  external speech API.
- Localize first-party React errors in English, Spanish, German, Danish,
  Italian, and French.
- Preserve credit refunds, logging, status codes, and Sentry behavior.
- Leave unrelated error codes and messages unchanged.

## Error contract

Use `PROVIDER_UNAVAILABLE` as the internal server error code. Provider identity
travels as structured data instead of being encoded in the code or message.

```ts
{
  errorCode: 'PROVIDER_UNAVAILABLE',
  details: { provider: 'Grok' },
  error: 'Grok is temporarily unavailable. Please retry.'
}
```

`POST /api/clone-voice` keeps its existing `code` field for compatibility, but
uses `PROVIDER_UNAVAILABLE` as its value. The dashboard generation route keeps
`errorCode`. Client helpers accept the code as an argument, so this field-name
difference does not spread into translation logic.

The external API keeps its public `provider_unavailable` code and English
message. It does not localize responses.

## Shared provider metadata

Extend `apps/web/lib/provider-errors.ts` with:

- `ProviderId = 'gemini' | 'grok' | 'mistral' | 'replicate'`.
- `ProviderDisplayName = 'Gemini' | 'Grok' | 'Mistral' | 'Replicate'`.
- A formatter that validates the provider ID and capitalizes its first letter.
- A typed `{ provider: ProviderDisplayName }` details object.

Routes keep lowercase provider IDs for branching and logs. They convert the ID
only when building a response. xAI failures map to the product name `grok`
before formatting.

## Canonical English fallback

Add this key to `apps/web/messages/en.json`:

```json
{
  "errorCodes": {
    "PROVIDER_UNAVAILABLE": "{provider} is temporarily unavailable. Please retry."
  }
}
```

Add a server-only helper under `apps/web/lib/api/` that reads this English
template and substitutes the validated display name. Server routes use this
helper for fallback messages. This removes provider-unavailable prose from
`apps/web/lib/utils.ts` without importing the full locale catalog into client
bundles.

Remove `GEMINI_PROVIDER_UNAVAILABLE`. Gemini, Grok, Replicate, and Mistral use
the same error code, status lookup, and English fallback formatter.

## React translation flow

Add a small client-safe resolver under `apps/web/lib/api/`. It receives an
`errorCodes` translator, an error code, details, and a server fallback. It
returns the localized message when the key and required provider exist. It
returns the English fallback for missing, malformed, or unknown data.

Update `apps/web/components/audio-generator.tsx` to:

- Create `useTranslations('errorCodes')` alongside the existing `generate`
  translator.
- Translate provider failures returned by the JSON endpoint.
- Extend SSE error events with `errorCode` and `details` and run them through
  the same resolver.
- Preserve local `generate` keys such as `gproLimitExceeded`.

Update the clone client to:

- Create an `errorCodes` translator alongside the `clone` translator.
- Resolve global server codes first.
- Fall back to existing `clone.errors.*` keys for clone-specific validation.
- Use the server message only when no known translation exists.

## Locale strings

Add `errorCodes.PROVIDER_UNAVAILABLE` to every locale:

| Locale | Translation |
| --- | --- |
| `en` | `{provider} is temporarily unavailable. Please retry.` |
| `es` | `{provider} no está disponible temporalmente. Inténtalo de nuevo.` |
| `de` | `{provider} ist vorübergehend nicht verfügbar. Bitte versuche es erneut.` |
| `da` | `{provider} er midlertidigt utilgængelig. Prøv igen.` |
| `it` | `{provider} non è temporaneamente disponibile. Riprova.` |
| `fr` | `{provider} est temporairement indisponible. Réessayez.` |

Provider brand names remain unchanged in every locale.

## Server changes

1. Mistral and Replicate clone failures return `PROVIDER_UNAVAILABLE` with the
   matching provider details.
2. Grok and Replicate dashboard failures attach `errorCode` and details to
   `APIErrorResponse`.
3. Gemini dashboard JSON and SSE failures use the shared code and details.
4. External speech responses keep `provider_unavailable` and build their
   English message from the canonical template.
5. Expected provider failures continue to refund reserved credits once, emit
   structured logs, and skip Sentry.

## Tests

- Unit-test provider ID validation, capitalization, and English fallback
  formatting for all four providers.
- Test the client resolver with a translated message, unknown code, missing
  provider, and server fallback.
- Add React tests for localized JSON provider failures in `AudioGenerator`.
- Update the parked Gemini SSE test to assert structured translation data.
- Test clone client resolution for Mistral and Replicate provider details.
- Update route tests to assert status `503`, the shared code, provider details,
  English fallback, one credit refund, structured logging, and no Sentry call.
- Keep external API tests on the public lowercase code and English message.

## Verification

Run:

```bash
pnpm check-translations
pnpm --filter @sexyvoice/web exec vitest run \
  tests/clone-voice.test.ts \
  tests/generate-voice.test.ts \
  tests/api-v1-speech.test.ts \
  tests/v1-speech.test.ts \
  tests/components/audio-generator.test.tsx
pnpm fixall
pnpm type-check
```

## Compatibility and non-goals

- Keep English fallback fields for non-React clients, proxies, and diagnostics.
- Do not localize the external API from browser cookies or request headers.
- Do not change retry policy, credit pricing, provider classification, or
  observability rules.
- Do not migrate unrelated server error strings in this change.
