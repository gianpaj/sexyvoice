# Email confirmation integration

Email links open a browser-bound confirmation form at `/auth/confirm`. A
same-origin, CSRF-protected POST verifies the token hash with a nonpersistent
Supabase client. The user supplies the intended email and account-switch
consent, and the verified session email must match before cookies are installed.
GET requests never verify a token or change an authenticated session.
Purpose-signed pending state expires after ten minutes and stays in an HttpOnly
cookie, bounded below the browser cookie limit. Sessionless email-change results
acknowledge confirmation without installing a browser session.

OAuth code exchanges use `/auth/callback`. Both flows share safe redirects and
the signed `sv_auth_callback_ok` completion marker.

The marker checks live in `apps/web/lib/supabase/proxy.ts`. Keep claims
verification, profile restoration, response cache headers, and the strict legacy
PKCE verifier match from the main branch. Restoring `middleware.ts` would bypass
that session handling. OAuth replay tests retain coverage for leftover per-flow
verifier cookies.

Session installation passes a response-header collector to the SSR client.
Successful redirects preserve those headers. Signup provisioning and analytics
failures are reported without blocking a confirmed user's redirect, because the
one-time token has already been consumed. The user comes from the independently
verified session, with no fallback to the browser's existing identity.

Clean form responses use the same-origin referrer policy so native POST requests
carry their Origin. Token-bearing redirects use no-referrer to strip link secrets
before rendering the form.

Deploying templates before the route can create links to a missing endpoint.
The deployment instructions in `docs/devops.md` require pausing email generation,
deploying route support, and then switching templates. Rollback must retain route
support while issued links remain valid. This change does not edit hosted
Supabase configuration or apply database migrations.

Validation covers confirmation redirects, provisioning failures, cache headers,
marker signatures, OAuth replay behavior, dashboard claims, and profile repair.
