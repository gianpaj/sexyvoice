# Email confirmation integration

Email links use `/auth/confirm` and Supabase `verifyOtp()` with a token hash.
OAuth code exchanges use `/auth/callback`. Both flows share safe redirects and
the signed `sv_auth_callback_ok` completion marker.

The marker checks live in `apps/web/lib/supabase/proxy.ts`. Keep claims
verification, profile restoration, response cache headers, and the strict legacy
PKCE verifier match from the main branch. Restoring `middleware.ts` would bypass
that session handling. OAuth replay tests retain coverage for leftover per-flow
verifier cookies.

OTP verification passes a response-header collector to the SSR client, and both
success and error redirects preserve those headers. Signup provisioning and
analytics failures are reported without blocking a confirmed user's redirect,
because the one-time token has already been consumed. The full-user fallback is
limited to signup provisioning, which needs the verified email address.

Deploying templates before the route can create links to a missing endpoint.
The deployment instructions in `docs/devops.md` require pausing email generation,
deploying route support, and then switching templates. Rollback must retain route
support while issued links remain valid. This change does not edit hosted
Supabase configuration or apply database migrations.

Validation covers confirmation redirects, provisioning failures, cache headers,
marker signatures, OAuth replay behavior, dashboard claims, and profile repair.
