---
name: e2e-ssr-data-mocking
description: Why Playwright page.route mocks fail for dashboard SSR data and how E2E determinism is achieved
metadata:
  type: project
---

In apps/web, dashboard pages (history, usage) fetch data **server-side** in the RSC and hydrate it (history dehydrates React Query state; usage summary cards are SSR-only with no client refetch). So Playwright `page.route('**/rest/v1/...')` / `**/api/usage-events*` stubs in `e2e/fixtures.ts` do NOT control what the screenshot shows — the live Supabase data leaks through and makes Argos screenshots non-deterministic.

**How to apply:** To make an RSC-rendered surface deterministic for e2e, branch the data fetch on `isE2E()` (from `lib/e2e-mode.ts` / `lib/e2e-mocks.ts`) and return server-side mock constants, mirroring the same shape the client fixtures return. This is the established pattern (already used in dashboard `layout.tsx`, `credits/page.tsx`, `actions/stripe.ts`). Mock data lives in `lib/e2e-mocks.ts` (marked `server-only`); the shared `E2E_USER_ID` is in `lib/e2e-mocks-shared.ts` because Playwright test files can't import server-only modules.

**Why:** client-side route stubs alone are insufficient whenever data is server-rendered; the env gate is `E2E_TEST_MODE==='true' && VERCEL_ENV!=='production'`.

Running the suite locally: there is NO webServer config outside CI, so start `next start --port 4369` (port from `apps/web/.env.e2e`) with `E2E_TEST_MODE=true TZ=UTC` yourself before `playwright test`. Run `playwright install chromium` if the browser is missing.
