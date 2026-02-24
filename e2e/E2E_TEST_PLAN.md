# E2E Test Plan — Remaining Dashboard Pages

> **Status**: ✅ Complete
> **Last Updated**: 2025-07-14
> **Author**: Claude
> **Existing Coverage**: `/dashboard/generate` (✅ `generate-dashboard.spec.ts`)

---

## Overview

This document outlines the plan for adding Playwright E2E tests to cover the remaining 6 dashboard pages. Each page will follow the same patterns established in the existing `generate-dashboard.spec.ts`:

- **Page Object Model** (POM) files in `e2e/pages/`
- **Spec files** in `e2e/`
- **Mock helpers** in `e2e/mocks/` (where needed)
- API mocking via Playwright `page.route()` to intercept server calls
- Shared authentication via `.auth/user.json` (from `auth.setup.ts`)

### Pages to Cover

| # | Page | Route | Spec File | Priority | Status |
|---|------|-------|-----------|----------|--------|
| 1 | Call | `/dashboard/call` | `call-dashboard.spec.ts` | High | ✅ Done |
| 2 | Clone | `/dashboard/clone` | `clone-dashboard.spec.ts` | High | ✅ Done |
| 3 | Credits | `/dashboard/credits` | `credits-dashboard.spec.ts` | Medium | ✅ Done |
| 4 | History | `/dashboard/history` | `history-dashboard.spec.ts` | Medium | ✅ Done |
| 5 | Usage | `/dashboard/usage` | `usage-dashboard.spec.ts` | Medium | ✅ Done |
| 6 | Profile | `/dashboard/profile` | `profile-dashboard.spec.ts` | Low | ✅ Done |

---

## 1. Call Dashboard (`/dashboard/call`)

**File**: `e2e/call-dashboard.spec.ts`
**POM**: `e2e/pages/call.page.ts`
**Mocks**: `e2e/mocks/call.mock.ts`

### What the page does
- Displays a character selection form (`ConfigurationForm`)
- Shows credits section (mobile only)
- Shows a `Chat` component (LiveKit-based real-time voice)
- Shows legal/usage notice text
- Loads call voices and presets from the DB

### Test Cases

#### Authenticated
| Test | Description |
|------|-------------|
| `should display the call page correctly` | Verify page loads with configuration form, character presets, and notice text visible |
| `should display character preset cards` | Verify at least one preset/character card is visible |
| `should show connect button` | Verify the connect/call button is present |
| `should display credits section on mobile` | Use mobile viewport; verify credits section is visible |
| `should hide credits section on desktop` | Default viewport; verify credits section is hidden or in sidebar only |

#### Unauthenticated
| Test | Description |
|------|-------------|
| `should redirect to login when not authenticated` | Access `/en/dashboard/call` without auth → redirect to `/login` |

### Mocking Strategy
- Mock `/api/call-token` to return a mock LiveKit token (prevent real LiveKit connections)
- No need to actually connect to LiveKit; test UI presence only
- Character presets are loaded server-side, so they come from the real DB (no mock needed for basic tests)

---

## 2. Clone Dashboard (`/dashboard/clone`)

**File**: `e2e/clone-dashboard.spec.ts`
**POM**: `e2e/pages/clone.page.ts`
**Mocks**: `e2e/mocks/clone.mock.ts`

### What the page does
- Shows a voice cloning form with tabs: file upload and microphone recording
- Displays sample audio cards (accordion) with "source audio" and "example output"
- Has a language selector for the cloned voice
- Text input for voice name
- Legal consent checkbox
- Generate/Clone button
- Shows credits section (mobile)

### Test Cases

#### Authenticated
| Test | Description |
|------|-------------|
| `should display the clone page correctly` | Verify heading, language selector, and text input are visible |
| `should show sample audio cards` | Verify at least one sample audio accordion item is present |
| `should expand sample audio accordion` | Click a sample → verify source audio and example output sections appear |
| `should display language selector with options` | Open language selector → verify multiple languages available |
| `should show legal consent checkbox` | Verify the consent checkbox is visible and unchecked by default |
| `should disable generate button when no audio is provided` | Without uploading/recording audio → button is disabled |
| `should disable generate button without consent` | Upload audio but don't check consent → button stays disabled |
| `should handle clone API error gracefully` | Mock `/api/clone-voice` to return 500 → verify error toast |
| `should show insufficient credits message` | Mock credits to be low → verify appropriate message |

#### Unauthenticated
| Test | Description |
|------|-------------|
| `should redirect to login when not authenticated` | Access `/en/dashboard/clone` without auth → redirect |

### Mocking Strategy
- Mock `/api/clone-voice` for successful clone and error scenarios
- The file upload dropzone and mic recording will be tested at UI level (no actual audio processing)

---

## 3. Credits Dashboard (`/dashboard/credits`)

**File**: `e2e/credits-dashboard.spec.ts`
**POM**: `e2e/pages/credits.page.ts`
**Mocks**: `e2e/mocks/credits.mock.ts`

### What the page does
- Shows top-up status alerts (success/canceled/error from URL search params)
- Displays "Stripe Customer Portal" link
- Shows 3 credit top-up packages (Starter, Standard, Pro) with buy buttons
- Shows credit transaction history in a table (date, description, type, amount)
- Optionally shows Stripe pricing table for subscriptions

### Test Cases

#### Authenticated
| Test | Description |
|------|-------------|
| `should display the credits page correctly` | Verify top-up section title, description, and Stripe portal link |
| `should display three credit packages` | Verify Starter, Standard, and Pro cards are visible |
| `should display package prices` | Verify each card shows a dollar amount |
| `should show buy credits buttons` | Verify each package has a buy button |
| `should display credit history section` | Verify the history heading is visible |
| `should display transaction history table or empty state` | Verify table headers OR empty state message |
| `should show Stripe Customer Portal link` | Verify the external link to Stripe portal exists and has correct href |
| `should show success alert with query param` | Navigate with `?success=true&creditsAmount=500` → verify success alert |
| `should show canceled alert with query param` | Navigate with `?canceled=true` → verify canceled alert |
| `should show error alert with query param` | Navigate with `?error=true` → verify error alert |
| `should dismiss success alert` | Show success alert → click dismiss → alert disappears |

#### Unauthenticated
| Test | Description |
|------|-------------|
| `should redirect to login when not authenticated` | Access `/en/dashboard/credits` without auth → redirect |

### Mocking Strategy
- Mock Stripe checkout session creation (intercept the form action/server action)
- Credit history comes from the real DB (the test user should have some transactions)
- TopupStatus is client-side and driven by URL search params — no mocking needed

---

## 4. History Dashboard (`/dashboard/history`)

**File**: `e2e/history-dashboard.spec.ts`
**POM**: `e2e/pages/history.page.ts`
**Mocks**: `e2e/mocks/history.mock.ts`

### What the page does
- Shows a heading "History" (localized)
- Data table with columns: File Name, Voice, Text, Created At, Preview, Download, Actions
- Search/filter by text content
- Column visibility toggle dropdown
- Pagination (Previous/Next)
- Delete action per row (with confirmation)
- Audio preview player per row
- Download button per row

### Test Cases

#### Authenticated
| Test | Description |
|------|-------------|
| `should display the history page correctly` | Verify heading and table structure are visible |
| `should display table headers` | Verify column headers: File Name, Voice, Text, Created At, Preview, Download |
| `should show audio files or empty state` | Verify either data rows or "No results" message |
| `should filter audio files by text` | Type in filter input → verify filtered results or count update |
| `should show column visibility dropdown` | Click Columns button → verify dropdown with checkboxes |
| `should toggle column visibility` | Uncheck a column → verify it disappears from the table |
| `should show pagination controls` | Verify Previous/Next buttons exist |
| `should display audio file count` | Verify "X audio files" text is visible |

#### Unauthenticated
| Test | Description |
|------|-------------|
| `should redirect to login when not authenticated` | Access `/en/dashboard/history` without auth → redirect |

### Mocking Strategy
- Mock the Supabase query for audio files via API interception if needed
- Alternatively, rely on real DB data (test user may have generated files from generate tests)
- For delete tests, mock the delete API to prevent actual data deletion

---

## 5. Usage Dashboard (`/dashboard/usage`)

**File**: `e2e/usage-dashboard.spec.ts`
**POM**: `e2e/pages/usage.page.ts`
**Mocks**: `e2e/mocks/usage.mock.ts`

### What the page does
- Displays heading "Usage Statistics" (localized)
- Two summary cards: Monthly summary and All-time summary
  - Each shows total credits, total operations, and breakdown by source type (TTS, Voice Cloning, Live Call, Audio Processing)
- Data table with columns: Source Type, Quantity, Credits Used, Date, Details
- Source type filter dropdown (All, TTS, Voice Cloning, Live Call, Audio Processing)
- Page size selector (10, 20, 50)
- Server-side pagination with page numbers
- Expandable details cell showing voice name and text preview

### Test Cases

#### Authenticated
| Test | Description |
|------|-------------|
| `should display the usage page correctly` | Verify heading and summary cards are visible |
| `should display monthly summary card` | Verify monthly card shows current month name, total credits, and operations |
| `should display all-time summary card` | Verify all-time card is visible with totals |
| `should display usage data table` | Verify table with column headers is visible |
| `should show source type filter` | Verify filter dropdown with type options exists |
| `should filter by source type` | Select "TTS" filter → verify URL updates with `?sourceType=tts` |
| `should show page size selector` | Verify page size dropdown with 10/20/50 options |
| `should change page size` | Select different page size → verify URL updates |
| `should display pagination controls` | Verify Previous/Next buttons and page info text |
| `should show empty state when no data` | If no usage data → verify empty message |

#### Mocked Data
| Test | Description |
|------|-------------|
| `should display usage events from API` | Mock `/api/usage-events` → verify rows rendered |
| `should handle API error gracefully` | Mock `/api/usage-events` to return 500 → verify error message |

#### Unauthenticated
| Test | Description |
|------|-------------|
| `should redirect to login when not authenticated` | Access `/en/dashboard/usage` without auth → redirect |

### Mocking Strategy
- Mock `/api/usage-events` to return predictable paginated data
- Summary cards are server-rendered (from real DB), so they won't need mocking for basic tests
- For error scenarios, mock the API to return errors

---

## 6. Profile Dashboard (`/dashboard/profile`)

**File**: `e2e/profile-dashboard.spec.ts`
**POM**: `e2e/pages/profile.page.ts`

### What the page does
- Security card with:
  - Disabled email field (shows current email)
  - Current Password, New Password, Confirm Password fields
  - "Update Password" button
- Danger Zone card with:
  - Warning alert about account deletion
  - "Delete Account" button → opens confirmation dialog
  - Confirmation dialog with cancel/continue buttons

### Test Cases

#### Authenticated
| Test | Description |
|------|-------------|
| `should display the profile page correctly` | Verify Security and Danger Zone cards are visible |
| `should display email address (disabled)` | Verify email input is visible and disabled |
| `should display password change form` | Verify Current Password, New Password, Confirm Password fields |
| `should show update password button` | Verify "Update Password" button exists |
| `should disable update button while loading` | Submit form → verify button shows loading state |
| `should show error when passwords do not match` | Enter mismatched passwords → submit → verify error toast |
| `should display danger zone section` | Verify danger zone card with warning alert |
| `should show delete account button` | Verify "Delete Account" button exists with destructive styling |
| `should open delete confirmation dialog` | Click Delete Account → verify confirmation dialog appears |
| `should close delete confirmation dialog on cancel` | Open dialog → click Cancel → dialog closes |
| `should NOT actually delete account in test` | Verify the delete flow opens dialog but do NOT click Continue |

#### Unauthenticated
| Test | Description |
|------|-------------|
| `should redirect to login when not authenticated` | Access `/en/dashboard/profile` without auth → redirect |

### Mocking Strategy
- Mock `supabase.auth.updateUser` response via route interception for password change
- **NEVER** proceed with actual account deletion in tests
- No external API mocking needed

---

## File Structure (After Implementation)

```
e2e/
├── auth/
│   └── auth.setup.ts                 # Existing
├── mocks/
│   ├── google-ai.mock.ts             # Existing
│   ├── call.mock.ts                  # NEW
│   ├── clone.mock.ts                 # NEW
│   ├── credits.mock.ts               # NEW
│   ├── history.mock.ts               # NEW
│   └── usage.mock.ts                 # NEW
├── pages/
│   ├── generate.page.ts              # Existing
│   ├── call.page.ts                  # NEW
│   ├── clone.page.ts                 # NEW
│   ├── credits.page.ts               # NEW
│   ├── history.page.ts               # NEW
│   ├── usage.page.ts                 # NEW
│   └── profile.page.ts              # NEW
├── generate-dashboard.spec.ts        # Existing
├── call-dashboard.spec.ts            # NEW
├── clone-dashboard.spec.ts           # NEW
├── credits-dashboard.spec.ts         # NEW
├── history-dashboard.spec.ts         # NEW
├── usage-dashboard.spec.ts           # NEW
├── profile-dashboard.spec.ts         # NEW
└── E2E_TEST_PLAN.md                  # THIS FILE
```

---

## Implementation Order (Completed)

1. ✅ **Profile** (simplest page, pure form/UI testing, no API mocks)
2. ✅ **Credits** (medium complexity, URL param-driven alerts, package cards)
3. ✅ **History** (data table with filters, pagination)
4. ✅ **Usage** (data table with API-driven data, summary cards)
5. ✅ **Clone** (file upload, microphone, language selection — complex UI)
6. ✅ **Call** (LiveKit integration — most complex, focused on UI presence only)

---

## Conventions & Guidelines

### Page Object Model Pattern
Every page object should:
- Accept `Page` in its constructor
- Expose `Locator` properties for key UI elements
- Provide a `goto()` method using `waitUntil: 'domcontentloaded'`
- Provide action methods (`click*`, `enter*`, `select*`)
- Provide assertion methods (`expect*`)

### Mocking Pattern
- Use `page.route('**/api/<endpoint>', handler)` for API mocking
- Always `page.unroute('**/*')` in `afterEach` to prevent test interference
- Mock handlers should log calls with `console.log('[MOCK] ...')` for debugging

### Authentication
- All authenticated tests use `storageState: '.auth/user.json'` (via Playwright config)
- Unauthenticated tests override with `test.use({ storageState: { cookies: [], origins: [] } })`

### Assertions
- Use `toBeVisible()` for element presence
- Use `toHaveURL()` for navigation verification
- Use `toContainText()` for content verification
- Prefer accessible selectors: `getByRole`, `getByLabel`, `getByText`
- Use `getByTestId` only when no accessible alternative exists

### Timeouts
- Page navigation: 15000ms
- Element visibility: 5000ms (default)
- Toast notifications: 15000ms (they may be delayed)
- Auth redirect: 10000ms

---

## Risks & Considerations

1. **Database state dependency**: Tests rely on the test user having certain data (credits, audio files, usage events). If the test DB is empty, some tests will only verify the empty state.
2. **Stripe integration**: Credits page involves Stripe. We mock checkout session creation to avoid real charges.
3. **LiveKit**: Call page uses LiveKit WebRTC. We test UI only, not actual connections.
4. **Microphone access**: Clone page mic recording will be skipped or mocked (browser permissions).
5. **File uploads**: Clone page file upload can be tested via Playwright's `setInputFiles()` API.
6. **Server Components**: Several pages are server-rendered (credits, usage, history). Their initial data comes from the DB, not client-side API calls. We focus on testing the rendered output.
7. **Account deletion**: Profile page delete test MUST NOT complete the deletion flow.
