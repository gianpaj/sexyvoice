# Save as new character

## Scope and evidence

An empty creation ID fails `/api/characters` validation with `Invalid UUID`.
The reported call failure has no confirmed cause. German calls completed
later; this fix does not claim to resolve a locale-specific call outage.

## Decision

`PresetSave` omits the ID for creation. `SaveCharacterPayload.id` is optional;
updates retain the existing character UUID. Server UUID validation stays strict.
Accepting empty IDs on the server would conceal the client contract mismatch
and weaken validation for all callers.

## Coverage and limits

The English and German browser scenarios failed on the empty-ID request
before the fix and pass with the ID omitted. They cover distinct copies,
localized instructions, selection, and updates that preserve the original.
Mocking and authentication boundaries are documented in the
[E2E guide](../../../../apps/web/e2e/E2E_TEST_PLAN.md#current-mocking-behavior).
API tests verify malformed IDs cannot write prompts or characters.
No production character writes or LiveKit calls are part of these checks.

## Verification

- `pnpm fixall` and `pnpm type-check` passed.
- Web Vitest: 98 files, 1,388 passed, 19 existing skips. Used
  `REDISMS_SYSTEM_BINARY=/opt/homebrew/bin/redis-server` for isolated Redis
  instances after the automatic binary download stalled.
- Call-dashboard Playwright: 15 passed using installed Chrome and an E2E-mode
  dev server. Authentication setup passed separately.
- A standalone TypeScript check for the changed E2E files passed.
