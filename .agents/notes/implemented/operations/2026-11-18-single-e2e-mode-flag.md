# Agent Note: One E2E mode flag

Status: implemented — Playwright sets one flag for the build and test server.

## Problem

Browser Sentry can report Playwright errors to production if CI enables the
server's E2E mode and omits the browser build flag. On WebKit, the build also
needs to omit the CSP directive that upgrades local HTTP requests to HTTPS.

## Decision

The Playwright job sets `E2E_TEST_MODE` for the build and server. The shared
`isE2E()` gate excludes Vercel production. Next.js uses that gate for the CSP
and inlines a Sentry-enabled boolean into the browser bundle.

## Alternatives considered

- Maintain separate flags for CI's build and runtime. This allows browser and
  server telemetry to disagree if either setting is omitted.
- Read a public E2E flag in browser and server code. Next.js freezes public
  values at build time, while the server must check E2E mode at runtime.

## Consequences

Set the flag before building any bundle that Playwright will serve. Turbo
includes it in the build cache key. See the [deployment guide](../../../../docs/devops.md#monitoring-analytics-and-support).
