# Call screenshot fixtures

## Decision

Use the existing server-only `lib/e2e-mocks.ts` fixtures and `isE2E()` gate
for call dashboard rendering. Keep character rows shaped like query responses
so tests exercise the production row-to-preset mapper. Preserve authentication.
The public character snapshot lives in `lib/e2e-mocks-shared.ts`, re-exported
by `lib/e2e-mocks.ts`, so Playwright can derive expectations from the same rows.

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

## Coverage limits

Accept fixture-backed call screenshots as UI regression coverage, not live
Supabase integration coverage. The Vitest live-mode cases mock query functions;
they verify branching and mapping, not SELECT joins or deployed RLS policies.
Type checks validate against generated schema types, not the live database.
A separate integration test would be needed to cover those database contracts.

The screenshot fixture represents a free user without custom characters.
Paid-user controls and custom-character voice selection are outside this suite.
The voice catalog keeps server props deterministic but does not exercise those
controls. Adding paid-user screenshots is a separate test-coverage task.

## Verification

- `pnpm fixall` and `pnpm type-check` passed.
- Vitest: 91 files passed, 1,311 tests passed, 19 skipped.
- Call Playwright suite: 12 passed, including auth setup and both screenshots.
- Local Playwright used installed Google Chrome because bundled Chromium was
  unavailable. The temporary Next.js dev server used `E2E_TEST_MODE=true`.
- No Argos upload, baseline approval, or database mutation was performed by
  the implementation. Playwright used the existing test-user login flow.
