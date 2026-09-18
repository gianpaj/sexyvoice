# Supabase tracing compatibility

## Findings

- Installed Supabase JS is 2.116.0, SSR is 0.12.7, and Sentry Next.js is 10.45.0.
- Supabase meets the tracing requirement. Version 2.112.0 and later requires
  `@supabase/supabase-js/tracing` for SDK OpenTelemetry propagation.
- OpenTelemetry API 1.9.0 is present transitively in the lockfile.
- Sentry 10.45.0 supports Supabase instrumentation but records query filters and
  plain-object mutation bodies without the guide's operation-data controls.
  Its `instrumentSupabaseClient` declaration accepts only one argument.
- Sentry 10.71.0 supports `sendOperationData: false` and fixes operation detection
  with Supabase's `Headers` instances. Published 10.75.0 also contains these fixes.
- Existing browser, server, and edge configurations sample 10% of traces.
  Server and edge reporting are enabled only in production.
- Four factories need instrumentation: `client.ts`, `server.ts`, `admin.ts`, and
  `middleware-client.ts` under `apps/web/lib/supabase/`. Auth wrapping is per
  instance; database wrapping uses shared prototypes.

## Decision awaiting approval

Upgrade Sentry before enabling instrumentation. Use explicit
`sendOperationData: false` consistently, preserve sampling, and restrict browser
trace propagation to the configured Supabase origin plus existing same-origin
behavior. Use Sentry's browser propagation and the Supabase tracing runtime with
Sentry's OpenTelemetry provider on Node. Verify edge propagation separately.

Do not enable operation-data capture or build a custom replacement for SDK
redaction on 10.45.0. Automatic Supabase error messages can still contain user
content; agree on dropping or sanitizing those events before enabling capture.
HTTP breadcrumbs and spans are separate collection paths and need review.

## Evidence and validation

Sources: [client tracing](https://supabase.com/docs/guides/observability/client-side-tracing.md),
[Sentry integration](https://supabase.com/docs/guides/observability/sentry-monitoring.md),
and [Sentry source](https://github.com/getsentry/sentry-javascript/blob/10.75.0/packages/core/src/integrations/supabase.ts).
An isolated probe with installed SDKs, mocked fetch, and a no-op transport
confirmed filter/body disclosure despite attempted privacy flags. No database
requests or telemetry uploads were made. Application code is unchanged.
