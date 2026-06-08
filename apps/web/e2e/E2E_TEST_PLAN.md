# E2E Test Implementation — Dashboard Pages

> **Status**: ✅ Implemented
> **Last Updated**: 2026-05-10
> **Scope**: `apps/web/e2e/*`
> **Current Result**: 99 tests total — 98 passing, 1 intentionally skipped

---

## Overview

This document reflects the **actual Playwright E2E implementation** in `apps/web/e2e`.
It is no longer a forward-looking plan.

The current suite covers the main dashboard surfaces with a mix of:

- shared authenticated setup via `auth/auth.setup.ts`
- page-object models in `e2e/pages/`
- targeted HTTP mocking for selected flows
- real server-rendered pages where practical
- safe test-environment guards for destructive or billable flows

### How the suite runs

- Playwright config lives in `apps/web/playwright.config.ts`
- E2E tests run from `apps/web` via `pnpm run test:e2e`
- CI builds the app first, then Playwright starts `next start`
- local runs can reuse an already-running server on the configured Playwright port
- authenticated tests reuse `.auth/user.json`, created by `e2e/auth/auth.setup.ts`

---

## Coverage Summary

| Area | Route | Spec | POM | Mocking | Tests |
|---|---|---|---|---|---:|
| Generate | `/en/dashboard/generate` | `generate-dashboard.spec.ts` | `pages/generate.page.ts` | `mocks/google-ai.mock.ts` | 14 *(1 skipped)* |
| Call | `/en/dashboard/call` | `call-dashboard.spec.ts` | `pages/call.page.ts` | inline `page.route()` mocks | 11 |
| Clone | `/en/dashboard/clone` | `clone-dashboard.spec.ts` | `pages/clone.page.ts` | none currently required | 17 |
| Credits | `/en/dashboard/credits` | `credits-dashboard.spec.ts` | `pages/credits.page.ts` | no route mock; safe env-driven checkout failure path | 16 |
| History | `/en/dashboard/history` | `history-dashboard.spec.ts` | `pages/history.page.ts` | none currently required | 12 |
| Usage | `/en/dashboard/usage` | `usage-dashboard.spec.ts` | `pages/usage.page.ts` | `mocks/usage.mock.ts` | 14 |
| Profile | `/en/dashboard/profile` | `profile-dashboard.spec.ts` | `pages/profile.page.ts` | one narrow auth-route passthrough in mismatch test | 13 |
| Email auth | `/en/signup`, `/auth/confirm` | `auth-email.spec.ts` | none | mocked browser-side Supabase signup request | 2 |

---

## Shared Test Infrastructure

### Authentication

**File**: `e2e/auth/auth.setup.ts`

Implemented behavior:

- logs in with `PLAYWRIGHT_TEST_USER_EMAIL` and `PLAYWRIGHT_TEST_USER_PASSWORD`
- saves auth state to `.auth/user.json`
- all authenticated specs depend on this setup project
- unauthenticated specs override `storageState` with empty cookies/origins
- server-side `/auth/confirm` token verification remains covered by Vitest route
  tests because Playwright route mocks cannot intercept Next server outbound
  fetches

### Page Object Models

Implemented page objects:

- `pages/generate.page.ts`
- `pages/call.page.ts`
- `pages/clone.page.ts`
- `pages/credits.page.ts`
- `pages/history.page.ts`
- `pages/profile.page.ts`
- `pages/usage.page.ts`

Each page object encapsulates:

- stable locators
- `goto()` navigation helpers
- user actions
- semantic assertion helpers

### Mock Helpers

Implemented mock/helper files:

- `mocks/google-ai.mock.ts` — used by generate tests
- `mocks/usage.mock.ts` — used by usage tests
- `mocks/call.mock.ts` — helper file exists, but current call spec uses inline route handlers
- `mocks/clone.mock.ts` — helper file exists, but current clone spec is UI-focused and does not currently import it

---

## Implemented Coverage by Page

## 1. Generate Dashboard

**Route**: `/en/dashboard/generate`
**Spec**: `e2e/generate-dashboard.spec.ts`
**POM**: `e2e/pages/generate.page.ts`
**Mocks**: `e2e/mocks/google-ai.mock.ts`

### Covered scenarios

#### Authenticated

- page renders heading, voice selector, textarea, and generate button
- successful audio generation with mocked `/api/generate-voice`
- Grok TTS flow with a featured Grok voice
- disabled state when text is empty
- character count display
- Gemini credit estimation flow
- API error handling
- canceling an in-flight generation
- Gemini style input visibility and submission
- multiple sequential generations in one session

#### Error Scenarios

- insufficient credits error from mocked `/api/generate-voice`
- network timeout / aborted generation flow

#### Unauthenticated

- redirect to login

### Current mocking behavior

`google-ai.mock.ts` currently mocks:

- `POST /api/generate-voice`
- `POST /api/estimate-credits`
- `POST /api/generate-text`

Notes:

- Gemini estimation returns a fixed mock response
- Grok estimation is provider-aware and uses `estimateGrokCredits(text)`
- `/api/generate-text` mock matches the current `streamProtocol: 'text'` client behavior

### Intentional gap

One test is intentionally skipped:

- `should show warning when text exceeds character limit`

Reason:

- it is currently too slow because it types a very large payload

---

## 2. Call Dashboard

**Route**: `/en/dashboard/call`
**Spec**: `e2e/call-dashboard.spec.ts`
**POM**: `e2e/pages/call.page.ts`

### Covered scenarios

#### Authenticated

- page renders correctly
- language selector is visible
- language selector exposes multiple options
- connect button is visible
- notice text is visible
- configuration form is present
- character/preset content area is present
- connect button is enabled

#### Mobile

- credits section is visible on a mobile viewport

#### Unauthenticated

- redirect to login

### Current mocking behavior

The call spec currently uses inline route handlers, not the helper mock file.
It mocks:

- `POST /api/call-token`
- character image requests
- relevant `_next/image` requests for character assets

### Intentional scope

- tests do **not** establish a real LiveKit connection
- tests validate UI structure and interaction affordances only

---

## 3. Clone Dashboard

**Route**: `/en/dashboard/clone`
**Spec**: `e2e/clone-dashboard.spec.ts`
**POM**: `e2e/pages/clone.page.ts`

### Covered scenarios

#### Authenticated

- page renders correctly
- upload and preview tabs are visible
- upload dropzone is visible
- language selector is visible
- language selector test id is present
- legal consent checkbox is visible
- legal consent is unchecked by default
- sample audio accordion items are present
- generate button is disabled with incomplete form state
- preview tab is disabled before generation
- text input and character count are visible

#### Unauthenticated

- redirect to login

### Current implementation notes

This spec is intentionally UI-focused.
It currently does **not** submit a real clone request and does **not** exercise the preview success state.

The existing `mocks/clone.mock.ts` helper file is available for future expansion, but the current spec does not import it.

---

## 4. Credits Dashboard

**Route**: `/en/dashboard/credits`
**Spec**: `e2e/credits-dashboard.spec.ts`
**POM**: `e2e/pages/credits.page.ts`

### Covered scenarios

#### Authenticated

- page renders top-up section, history section, and Stripe portal link
- three package cards are visible
- package prices are visible
- package credits text is visible
- buy buttons are visible
- history section is visible
- history table or empty state is shown
- Stripe Customer Portal link has correct href and target

#### Top-up Status Alerts

- success alert via query param
- success alert with credits amount
- canceled alert via query param
- error alert via query param
- dismiss success alert
- no alert without query params

#### Checkout Flow

- clicking a buy button results in either:
  - a checkout redirect attempt, or
  - an inline checkout error

#### Unauthenticated

- redirect to login

### Current checkout safety model

In the E2E environment, Stripe top-up price IDs are intentionally omitted.
Because of that, checkout fails before a real Stripe Checkout Session can be created.

This means the checkout test validates the UI flow safely without performing a billable action.

### Current implementation notes

- no browser route interception is used for server actions
- the test verifies a checkout-related outcome instead of assuming a specific transport path

---

## 5. History Dashboard

**Route**: `/en/dashboard/history`
**Spec**: `e2e/history-dashboard.spec.ts`
**POM**: `e2e/pages/history.page.ts`

### Covered scenarios

#### Authenticated

- page heading and table render
- table headers render
- rows or empty state are handled correctly
- filter input is visible
- filtering by text works
- columns dropdown is visible
- column visibility toggling works
- pagination controls are visible
- audio file count is visible
- per-row download button is checked when data rows exist
- per-row action menu button is checked when data rows exist

#### Unauthenticated

- redirect to login

### Current implementation notes

This spec mostly uses real server-rendered history data for the test user.
It is resilient to both:

- populated history
- empty-state history (`No history yet`)

Some assertions are conditional so the suite remains stable regardless of current fixture data volume.

---

## 6. Usage Dashboard

**Route**: `/en/dashboard/usage`
**Spec**: `e2e/usage-dashboard.spec.ts`
**POM**: `e2e/pages/usage.page.ts`
**Mocks**: `e2e/mocks/usage.mock.ts`

### Covered scenarios

#### Authenticated

- page heading renders
- monthly summary card renders
- all-time summary card renders
- usage table headers render
- source-type filter is visible
- filtering updates the URL
- page-size selector is visible
- changing page size updates the URL
- pagination controls are visible
- rows or empty state render correctly

#### Mocked Data Scenarios

- normal mocked data rendering
- empty-state mocked response
- API error state

#### Unauthenticated

- redirect to login

### Current mocking behavior

`usage.mock.ts` mirrors the paginated `/api/usage-events` contract and supports:

- `page`
- `pageSize`
- `sourceType`
- `includeSummary`

It conditionally includes `monthlySummary` and `allTimeSummary` only when requested.

### Current implementation notes

- summary cards are rendered server-side on initial load
- table data is mocked client-side through `/api/usage-events`
- this gives the suite deterministic table behavior while still validating page-level rendering

---

## 7. Profile Dashboard

**Route**: `/en/dashboard/profile`
**Spec**: `e2e/profile-dashboard.spec.ts`
**POM**: `e2e/pages/profile.page.ts`

### Covered scenarios

#### Authenticated

- page renders security and danger-zone sections
- email input is visible and disabled
- password fields are visible
- update password button is visible and enabled
- mismatched-password flow is handled without mutating the account
- danger zone is visible
- delete-account button is visible
- destructive styling/text is present
- delete confirmation dialog opens
- delete confirmation dialog closes on cancel
- deletion is **not** completed in tests
- password inputs are type `password`
- password inputs are marked `required`

#### Unauthenticated

- redirect to login

### Safety guarantees

- tests never confirm account deletion
- the dialog is opened and verified, then always canceled

---

## Actual File Structure

```text
apps/web/e2e/
├── auth/
│   └── auth.setup.ts
├── mocks/
│   ├── call.mock.ts
│   ├── clone.mock.ts
│   ├── google-ai.mock.ts
│   └── usage.mock.ts
├── pages/
│   ├── call.page.ts
│   ├── clone.page.ts
│   ├── credits.page.ts
│   ├── generate.page.ts
│   ├── history.page.ts
│   ├── profile.page.ts
│   └── usage.page.ts
├── auth-email.spec.ts
├── call-dashboard.spec.ts
├── clone-dashboard.spec.ts
├── credits-dashboard.spec.ts
├── generate-dashboard.spec.ts
├── history-dashboard.spec.ts
├── profile-dashboard.spec.ts
├── usage-dashboard.spec.ts
└── E2E_TEST_PLAN.md
```

---

## Current Test Philosophy

### Prefer UI-level verification over deep transport coupling

Examples:

- credits checkout verifies redirect-or-error outcome instead of assuming a specific server-action network path
- call tests validate UI and mocked token responses without making a real LiveKit connection
- history tests tolerate either real rows or an empty-state row

### Keep destructive or billable actions safe

Examples:

- no real account deletion
- no real Stripe checkout session in the E2E environment
- no real voice-call connection

### Use mocks where determinism matters most

Currently that means:

- generate APIs
- usage table API
- call token API

And it intentionally does **not** mean mocking every dashboard page.

---

## Known Gaps / Future Improvements

1. **Generate character-limit test**
   - currently skipped for performance reasons
   - could be re-enabled with a faster text-injection strategy

2. **Clone success flow**
   - current coverage focuses on static UI and validation state
   - could be extended to mock clone submission and preview state

3. **Call interaction depth**
   - current coverage verifies page state and mocked token wiring
   - does not assert a full in-call lifecycle

4. **History fixture determinism**
   - current suite tolerates variable real data
   - a future mock-backed mode could make row-level assertions stricter

5. **Credits redirect-path validation**
   - current test safely validates attempted checkout behavior
   - a dedicated Stripe test-mode integration environment could cover successful redirect behavior more deeply if needed

---

## Maintenance Notes

When updating dashboard UI or flows, update the following together:

- the relevant spec file
- the matching page object
- any helper mocks used by that spec
- this document if scope or behavior meaningfully changes

Treat this file as the source of truth for **implemented E2E coverage**, not proposed coverage.
