# Call screenshot fixtures

## Decision

Use the existing server-only `lib/e2e-mocks.ts` fixtures and `isE2E()` gate
for call dashboard rendering. Keep character rows shaped like query responses
so tests exercise the production row-to-preset mapper. Preserve authentication.

The fixtures cover public characters, call voices, credit transactions,
instruction config, and free-user status. Custom characters are empty.
Production database queries and Argos comparison settings are unchanged.

## Data provenance

Public characters and call voices were captured from the linked database with
read-only SELECT queries on 2026-09-18. The selected columns and joins match
`getPublicCallCharacters()` and `getCallVoices()`. The snapshot contains three
characters in `sort_order` and six voices ordered by `sort_order`, then name.
User IDs and prompt text were excluded. Credits and instruction config remain
synthetic. Tests do not refresh these snapshots from the database.

## Alternatives

- Browser route mocks cannot intercept the server-rendered character queries.
- Sorting live rows still permits names, descriptions, and membership to change.
- Masking the character UI would hide layout regressions.

Fixture edits can require a deliberate baseline approval. Runtime setup is
[in the E2E guide](../../../../apps/web/e2e/E2E_TEST_PLAN.md#current-mocking-behavior).

## Verification

- `pnpm fixall` and `pnpm type-check` passed.
- Vitest: 91 files passed, 1,311 tests passed, 19 skipped.
- Call Playwright suite: 12 passed, including auth setup and both screenshots.
- Local Playwright used installed Google Chrome because bundled Chromium was
  unavailable. The temporary Next.js dev server used `E2E_TEST_MODE=true`.
- No Argos upload, baseline approval, or database mutation was performed by
  the implementation. Playwright used the existing test-user login flow.
