# Supabase tracing

## Decision

Use Sentry Next.js 10.71.0 with Supabase JS 2.116.0 and SSR 0.12.7.
Sentry 10.45.0 cannot disable operation-data capture. Version 10.71.0 provides
explicit privacy controls and handles Supabase's `Headers` instances correctly.
The repository's two-day release-age policy blocks 10.75.0; keep that policy.

All four web client factories call the shared `instrumentSupabase` helper with
`sendOperationData: false`. Auth wrapping is per instance; database wrapping uses
shared prototypes. Keep the 10% trace sample rate and existing production gates.

Sentry alone owns propagation in Node and browsers. Browser targets preserve
same-origin requests and add only the configured Supabase origin. Supabase's
OpenTelemetry propagation is unnecessary here. Combining it with automatic HTTP
instrumentation gives `traceparent` and `sentry-trace` different parent span IDs.
Sentry supplies OpenTelemetry transitively; no direct dependency is needed.

Keep HTTP child spans. Suppressing all REST HTTP requests hides cold RPC and HEAD
requests that have no database span. Sentry's RPC database instrumentation is
order-dependent and does not provide reliable RPC operation metadata.

Shared privacy hooks redact Supabase integration telemetry and matching HTTP
telemetry. They preserve table/schema identifiers, URL paths, operation, timing,
status, and trace correlation. Automatic errors keep approved codes but lose
free-form messages, stacks, and extra contexts. This deliberately trades some
debugging detail for protection against database/auth error messages containing
user content. Manual errors, console logs, Replay, and arbitrary scope data are
outside this policy.

## Runtime boundary

There are no Edge routes in the web app. Next.js 16 Proxy uses Node. Sentry's
WinterCG integration through 10.75.0 omits W3C headers despite its configuration
flag. Edge privacy hooks and Supabase spans remain enabled; adding an Edge route
requires reassessing W3C propagation. Do not add custom injection machinery for
an unused runtime.

## Verification

Real-SDK tests use native fetch against a temporary loopback HTTP responder and
an in-memory Sentry transport. They cover matching W3C/Sentry parent IDs, sampled
and unsampled requests, table operations, upsert header handling, cold RPC, HEAD,
Auth, Storage, and telemetry redaction. No production database or Sentry traffic
is needed. Unit tests cover exact-origin targeting, all factory adapters, runtime
configuration, and root/child telemetry sanitization.

`pnpm fixall`, `pnpm type-check`, and `pnpm test -- --run --maxWorkers=2` pass.
The web suite has 1,394 passing tests and 19 existing skips; the scripts suite
also passes. `git diff --check` and changed Markdown formatting pass.

The web app's `next build --experimental-build-mode compile` passes with
`VERCEL_ENV=preview`, Next.js 16.3.4, and Node 24.9.0.
This validates compilation, not a complete production build or hosted ingestion.
Sentry warns that experimental build mode is not fully supported. Existing
warnings include an unused docs route parameter and Contentlayer's missing
`baseUrl` setting; neither blocks checks.

Deployment verification must check browser CORS and match a request's trace ID
with Sentry and Supabase Gateway logs; local tests do not prove hosted ingestion.

## References

- [Supabase client tracing](https://supabase.com/docs/guides/observability/client-side-tracing.md)
- [Supabase Sentry integration](https://supabase.com/docs/guides/observability/sentry-monitoring.md)
- [Sentry Supabase implementation](https://github.com/getsentry/sentry-javascript/blob/10.71.0/packages/core/src/integrations/supabase.ts)
- [Operational guidance](../../../../docs/devops.md#supabase-tracing)
