# OAuth 2.0 Authorization Code + PKCE Implementation Plan

## Objective

Implement a real OAuth 2.0 authorization server for the SexyVoice external API
using the Authorization Code flow with PKCE so agents, CLIs, and third-party
apps can connect user accounts without receiving long-lived dashboard API keys.

This plan should preserve the current API key model for direct developer usage
while adding standards-based delegated access for:

- AI agents
- third-party SaaS integrations
- workflow tools
- first-party CLI login
- future "Connect SexyVoice" integrations

This plan is based on the current repo state, where:

- external API routes under `apps/web/app/api/v1/*` currently authenticate only
  with Bearer API keys via `validateApiKey()`
- the first-party CLI login flow is a custom browser-assisted API key exchange
  built around:
  - `apps/web/app/[lang]/cli/login/page.tsx`
  - `apps/web/app/[lang]/cli/login/cli-login-client.tsx`
  - `apps/web/app/api/cli-login-sessions/route.ts`
  - `apps/web/app/api/cli-login-sessions/redeem/route.ts`
  - `apps/web/lib/api/cli-login.ts`
- the current CLI exchange flow only allows `http://localhost` and
  `http://127.0.0.1` callback URLs

## Why this work matters

Today the external API is authenticated with Bearer API keys created in the
dashboard. That works well for direct backend integrations, but it is not a
standard delegated authorization flow.

In the current repo, the external API routes for billing, models, speech, and
voices all read the `authorization` header and validate it with
`validateApiKey()`, then update usage with `updateApiKeyLastUsed()`. That means
the current public API contract is API-key-only.

OAuth 2.0 with PKCE will allow clients to:

- discover auth metadata programmatically
- redirect users to SexyVoice for consent
- receive short-lived access tokens instead of raw API keys
- refresh access without storing permanent credentials
- request limited scopes
- revoke access per client or session

This is the correct foundation for publishing:

- `/.well-known/oauth-authorization-server`
- optionally `/.well-known/openid-configuration`

without advertising nonexistent endpoints.

## Non-goals

This phase should not attempt to solve everything at once.

Non-goals for the first implementation:

- dynamic client registration
- full OpenID Connect identity support
- social login / external identity provider federation
- broad dashboard redesign
- replacing existing API key auth
- supporting every OAuth grant type
- multi-tenant enterprise SSO

## Recommended scope for v1

Implement the smallest useful standards-based OAuth server with:

- `authorization_code` grant
- PKCE required for public clients
- `refresh_token` support
- static or database-backed OAuth clients
- consent screen for third-party access
- access token validation in `/api/v1/*`
- discovery metadata
- JWKS publishing only if signed access tokens are used

For v1, keep the scope intentionally narrow:

- OAuth 2.0 first
- OIDC later if there is a concrete need
- preserve API key auth for existing users and docs
- migrate the first-party CLI after the server contract is stable

## High-level architecture

### Existing auth modes

Keep the current API key flow for:

- direct backend integrations
- existing customers
- simple curl / server-side usage
- internal compatibility

### New auth mode

Add OAuth bearer token support for:

- agents
- CLIs
- browser-based integrations
- third-party apps acting on behalf of a user

### Recommended long-term model

Support both:

1. API keys
2. OAuth access tokens

This avoids breaking current users while enabling standards-based integrations.

## Phase 1: Define the OAuth domain model

### Goal

Introduce the core concepts and persistence model needed for OAuth.

### Work

1. Define OAuth entities and relationships:
   - OAuth clients
   - authorization requests / grants
   - authorization codes
   - refresh tokens
   - access tokens or token signing strategy
   - consent records
   - token revocations
2. Decide whether access tokens are:
   - opaque database-backed tokens, or
   - signed JWTs
3. Define supported client types:
   - public clients
   - confidential clients
4. Define redirect URI policy:
   - exact match only
   - localhost support for CLI/dev flows
5. Define scope model for the current API

### Recommended scopes

Start with OAuth scopes that map directly to current endpoints:

- `tts.generate`
- `voices.read`
- `models.read`
- `billing.read`

Important: these are new OAuth scopes. They do not need to match the current API
key permission shape exactly.

The current repo uses API key permissions stored as JSON with a default scope of
`voice:generate` on `api_keys.permissions`. OAuth scopes should be treated as a
separate authorization model, even if some internal permission checks are later
shared.

Optional future scopes:

- `api_keys.read`
- `api_keys.write`
- `voices.clone`
- `voices.manage`

### Deliverable

A documented OAuth data model and scope model that maps cleanly to the existing
external API.

## Phase 2: Add database schema and server-side primitives

### Goal

Create the persistence layer and reusable helpers before building routes.

### Work

1. Add migrations for OAuth tables. Based on the current Supabase schema in
   `apps/web/lib/supabase/types.d.ts`, there are no existing OAuth tables yet,
   so this work will require new `public.*` tables rather than extending an
   existing OAuth model.
2. Keep the v1 schema intentionally lean.
3. Add these core tables for v1:
   - `oauth_clients`
   - `oauth_authorization_codes`
   - `oauth_refresh_tokens`
4. If opaque access tokens are chosen, also add:
   - `oauth_access_tokens`
5. Do not add these in v1 unless a concrete need appears during implementation:
   - `oauth_client_redirect_uris`
   - `oauth_consents`
   - `oauth_signing_keys`
6. Add indexes and expiration cleanup strategy
7. Enable RLS where appropriate
8. Add admin-only access patterns for token issuance and validation
9. Add helper modules under `apps/web/lib/api/` for:
   - PKCE verification
   - scope parsing and validation
   - redirect URI validation
   - client authentication
   - token generation / hashing / signing
   - token revocation checks

### Lean v1 table shapes

These are the recommended new Supabase tables for the first OAuth
implementation.

#### `public.oauth_clients`

Purpose:

- stores registered OAuth clients
- distinguishes first-party and third-party clients
- supports public and confidential clients
- stores redirect URIs directly on the client row to avoid an extra v1 table

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `client_id text not null unique`
- `client_secret_hash text null`
- `name text not null`
- `description text null`
- `is_first_party boolean not null default false`
- `is_confidential boolean not null default false`
- `redirect_uris jsonb not null default '[]'::jsonb`
- `allowed_scopes jsonb not null default '[]'::jsonb`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default timezone('utc'::text, now())`
- `updated_at timestamptz not null default timezone('utc'::text, now())`
- `disabled_at timestamptz null`

Notes:

- public clients should have `client_secret_hash = null`
- confidential clients should store only a hash, never the raw secret
- `redirect_uris` is intentionally embedded in v1 to avoid a separate
  `oauth_client_redirect_uris` table
- exact redirect URI matching should still be enforced in application logic
- localhost callback URIs for the CLI should remain constrained to
  `http://localhost` and `http://127.0.0.1`, matching the current
  `cli_login.ts` behavior

#### `public.oauth_authorization_codes`

Purpose:

- stores short-lived one-time authorization codes
- binds the code to client, user, redirect URI, PKCE challenge, and scopes

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `code_hash text not null unique`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `oauth_client_id uuid not null references public.oauth_clients(id) on delete cascade`
- `redirect_uri text not null`
- `code_challenge text not null`
- `code_challenge_method text not null`
- `scopes jsonb not null default '[]'::jsonb`
- `expires_at timestamptz not null`
- `used_at timestamptz null`
- `created_at timestamptz not null default timezone('utc'::text, now())`

Suggested indexes:

- index on `user_id`
- index on `oauth_client_id`
- index on `expires_at`

Notes:

- store only a hash of the authorization code
- `used_at` is required for one-time-use enforcement
- `code_challenge_method` can be text in v1 even if only `S256` is supported

#### `public.oauth_refresh_tokens`

Purpose:

- stores long-lived refresh tokens
- supports rotation, revocation, and reuse detection

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `token_hash text not null unique`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `oauth_client_id uuid not null references public.oauth_clients(id) on delete cascade`
- `scopes jsonb not null default '[]'::jsonb`
- `expires_at timestamptz not null`
- `last_used_at timestamptz null`
- `revoked_at timestamptz null`
- `replaced_by_token_id uuid null references public.oauth_refresh_tokens(id) on delete set null`
- `created_at timestamptz not null default timezone('utc'::text, now())`

Suggested indexes:

- index on `user_id`
- index on `oauth_client_id`
- index on `expires_at`
- index on `replaced_by_token_id`

Notes:

- store only a hash of the refresh token
- `replaced_by_token_id` supports rotation chains
- refresh token reuse detection should be built around revoked/replaced token use

#### Optional `public.oauth_access_tokens`

Purpose:

- stores short-lived access tokens if opaque bearer tokens are chosen
- allows server-side lookup, expiry checks, and revocation without JWTs

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `token_hash text not null unique`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `oauth_client_id uuid not null references public.oauth_clients(id) on delete cascade`
- `scopes jsonb not null default '[]'::jsonb`
- `expires_at timestamptz not null`
- `revoked_at timestamptz null`
- `created_at timestamptz not null default timezone('utc'::text, now())`

Suggested indexes:

- index on `user_id`
- index on `oauth_client_id`
- index on `expires_at`

Notes:

- add this table only if access tokens are opaque and must be looked up on each
  API request
- if JWT access tokens are chosen, this table is not needed in v1

### Why these should be new tables instead of extending existing ones

The current Supabase schema already has:

- `public.api_keys` for long-lived user-created API keys
- `public.cli_login_sessions` for the custom CLI exchange flow

Those tables should remain separate from OAuth because they model different
credentials and lifecycles:

- API keys are durable user-managed secrets
- CLI login sessions are short-lived browser-assisted exchange records
- OAuth authorization codes, access tokens, and refresh tokens are delegated
  auth artifacts with different expiry, rotation, and revocation semantics

When designing these tables, follow the same general database discipline already
used elsewhere in the repo:

- service-role access for privileged issuance and validation paths
- RLS enabled on new tables
- hashed secrets/tokens at rest where possible
- explicit expiration fields and cleanup paths

### Design notes

- Authorization codes must be short-lived and one-time use
- Refresh tokens should be hashed at rest
- Authorization codes should also be stored as hashes rather than raw values
- Access tokens should expire quickly whether they are opaque or JWT-based
- Redirect URIs must be exact-match validated
- Public clients must require PKCE with `S256`
- Confidential clients may use `client_secret_basic` or `client_secret_post`
- Avoid storing raw long-lived secrets when hashing is sufficient
- Keep localhost callback support aligned with the current CLI constraints unless
  there is an intentional product change:
  - `http://localhost`
  - `http://127.0.0.1`
- Keep OAuth tables separate from `api_keys` and `cli_login_sessions` rather
  than trying to overload those existing tables
- Prefer JSONB columns for scopes/metadata to stay consistent with the current
  Supabase schema style already used in `api_keys.permissions` and other tables
- Defer connected-app consent persistence to a later phase unless it becomes
  necessary for the first implementation

### Deliverable

Lean v1 database schema and reusable OAuth primitives ready for route
implementation.

## Phase 3: Implement the authorization endpoint

### Goal

Build the browser-facing authorization flow.

### Endpoint

- `GET /api/v1/oauth/authorize`
- optionally `POST /api/v1/oauth/authorize` for consent submission

### Work

1. Validate request parameters:
   - `response_type=code`
   - `client_id`
   - `redirect_uri`
   - `scope`
   - `state`
   - `code_challenge`
   - `code_challenge_method`
2. Require authenticated SexyVoice user session
3. If user is not logged in:
   - redirect to login
   - return to authorization flow after login
4. Reuse the current localized browser-login pattern where practical
5. Show consent UI for third-party clients
6. Optionally skip consent for:
   - first-party clients
   - previously approved scopes
7. Create authorization code record
8. Redirect back to client with:
   - `code`
   - `state`

The current CLI browser flow already has a localized page at
`app/[lang]/cli/login/page.tsx` that validates callback parameters and redirects
unauthenticated users through the normal login page. The OAuth authorize flow
should follow the same general session and localization patterns rather than
introducing a completely separate auth UX.

### Security requirements

- exact redirect URI matching
- PKCE required for public clients
- short authorization code TTL
- one-time code use
- clear error redirects per OAuth spec

### Deliverable

A working authorization endpoint that issues authorization codes after login and
consent.

## Phase 4: Implement the token endpoint

### Goal

Exchange authorization codes for tokens and support refresh.

### Endpoint

- `POST /api/v1/oauth/token`

### Supported grants for v1

- `authorization_code`
- `refresh_token`

### Work

1. Validate token requests
2. Authenticate confidential clients when required
3. Verify authorization code:
   - exists
   - not expired
   - not used
   - matches client
   - matches redirect URI
4. Verify PKCE code verifier
5. Issue:
   - access token
   - refresh token
   - token type
   - expires_in
   - scope
6. Mark authorization code as consumed
7. Implement refresh token rotation
8. Revoke old refresh token on rotation
9. Return OAuth-compliant error responses

### Token format decision

#### Option A: Opaque access tokens

Pros:

- simpler revocation semantics
- easier server-side invalidation
- closer to the current server-side credential validation model already used by
  the external API

Cons:

- every API request requires database lookup
- requires an additional `oauth_access_tokens` table in the lean v1 schema

#### Option B: JWT access tokens

Pros:

- easier stateless validation
- better interoperability for some ecosystems
- keeps the lean v1 schema smaller because no `oauth_access_tokens` table is
  required

Cons:

- more signing-key management complexity
- revocation is harder unless short-lived
- JWKS/key-management work may still be needed even if it is not fully
  database-backed

### Recommendation

For SexyVoice v1, choose explicitly between these two lean paths:

- **Opaque access tokens** if implementation speed and revocation simplicity are
  the priority, accepting one extra table: `oauth_access_tokens`
- **JWT access tokens** if minimizing table count and maximizing ecosystem
  compatibility are the priority

If JWTs are chosen, keep access tokens short-lived and use refresh token
rotation.

Given the current repo state, opaque tokens are likely the lower-risk first
implementation because the existing external API already validates credentials
server-side on every request and does not yet have any JWT/JWKS infrastructure
for the external API. JWTs are still a valid choice, but they should be adopted
deliberately rather than assumed.

### Deliverable

A token endpoint that supports authorization code exchange and refresh token
rotation.

## Phase 5: Publish discovery metadata and JWKS

### Goal

Expose standards-based metadata only after the real endpoints exist.

### Endpoints

- `/.well-known/oauth-authorization-server`
- optionally `/.well-known/openid-configuration`
- `/api/v1/oauth/jwks` if JWT signing is used

### Work

1. Publish real metadata for:
   - `issuer`
   - `authorization_endpoint`
   - `token_endpoint`
   - `jwks_uri` if applicable
   - `grant_types_supported`
   - `response_types_supported`
   - `code_challenge_methods_supported`
   - `token_endpoint_auth_methods_supported`
   - `scopes_supported`
2. Ensure metadata reflects actual supported behavior
3. If JWTs are used, publish active public keys via JWKS
4. Add cache headers appropriate for metadata and JWKS rotation

The repo already contains `.well-known` route patterns, including
`app/.well-known/api-catalog/route.ts`, so the OAuth discovery routes should
follow the same route placement and cache-header conventions where appropriate.

### OIDC note

If full OIDC is not implemented yet, do not overclaim support. Only publish
OpenID metadata if the required OIDC behavior is actually present or if the
document is intentionally limited and accurate.

### Deliverable

Accurate discovery metadata backed by real OAuth endpoints.

## Phase 6: Accept OAuth bearer tokens in the external API

### Goal

Allow existing `/api/v1/*` routes to authenticate either API keys or OAuth
access tokens.

### Work

1. Refactor auth validation into a shared abstraction
2. Support:
   - API key validation
   - OAuth bearer token validation
3. Resolve authenticated principal into a common internal shape, for example:
   - user id
   - auth method
   - scopes / permissions
   - client id if OAuth
4. Enforce scope checks per endpoint
5. Preserve rate limiting and logging behavior
6. Update error responses to distinguish:
   - invalid token
   - insufficient scope
   - expired token

This refactor should be grounded in the current external API route patterns:

- routes currently read `authorization` directly
- routes currently call `validateApiKey()`
- routes currently apply rate limiting before business logic
- routes currently return structured errors through
  `externalApiErrorResponse()`
- some routes, especially speech, also log outcomes through `createLogger()`
- routes currently call `updateApiKeyLastUsed()` for API key auth and will need
  equivalent but separate handling for OAuth tokens

### Suggested scope mapping

- `POST /api/v1/speech` → `tts.generate`
- `GET /api/v1/voices` → `voices.read`
- `GET /api/v1/models` → `models.read`
- `GET /api/v1/billing` → `billing.read`

### Deliverable

External API routes accept OAuth access tokens without breaking API key users.

## Phase 7: Rework the CLI login flow to use OAuth + PKCE

### Goal

Migrate the first-party CLI from custom API-key exchange to standards-based
OAuth.

### Current state

The current CLI login flow creates a new API key and returns it to the CLI via a
custom browser-assisted exchange.

More specifically, the current repo implements this flow with:

- a localized browser page at `app/[lang]/cli/login/page.tsx`
- a client UI at `app/[lang]/cli/login/cli-login-client.tsx`
- session creation at `app/api/cli-login-sessions/route.ts`
- one-time redemption at `app/api/cli-login-sessions/redeem/route.ts`
- helper logic in `lib/api/cli-login.ts`

The current flow:

- accepts only `http://localhost` and `http://127.0.0.1` callback URLs
- creates a replacement or new API key
- stores an encrypted API key in `cli_login_sessions`
- redirects back to localhost with `exchange_token` and `state`
- redeems the exchange token exactly once
- deactivates the old API key after successful redemption when replacing a key

### Target state

The CLI should:

1. generate PKCE verifier/challenge
2. open browser to `/api/v1/oauth/authorize`
3. listen on localhost callback
4. receive authorization code
5. exchange code at `/api/v1/oauth/token`
6. store refresh token and access token metadata locally
7. refresh access as needed

### Work

1. Add a first-party OAuth client for the CLI
2. Allow localhost redirect URIs for the CLI client
3. Update `sexyvoice-cli` login flow to use PKCE
4. Reuse the current browser-based localhost UX where practical
5. Decide whether the CLI stores:
   - refresh token only, or
   - refresh token plus current access token
6. Keep the old CLI login flow temporarily during migration
7. Add a deprecation plan for the custom API-key exchange flow

### Deliverable

`sexyvoice login` uses OAuth Authorization Code + PKCE instead of minting a raw
API key.

## Phase 8: Build consent, client management, and dashboard UX

### Goal

Provide the minimum product surface needed to manage OAuth clients and grants.

### Work

1. Add consent screen UI showing:
   - client name
   - requested scopes
   - publisher / ownership info
   - redirect target context
2. Add dashboard UI for users to:
   - view connected apps
   - revoke app access
3. Add internal/admin UI or seed flow for managing OAuth clients
4. Distinguish first-party vs third-party clients
5. Add audit logging for:
   - consent granted
   - consent revoked
   - token refresh failures
   - suspicious redirect mismatches

The current CLI login page already gives users a browser UI to choose an
existing API key or create a new one. The OAuth consent UI should replace that
decision point for OAuth clients rather than layering a second confusing browser
step on top of it.

### Deliverable

Users can understand and manage which apps have access to their SexyVoice
account.

## Phase 9: Documentation and ecosystem updates

### Goal

Document the new auth model clearly for developers, agents, and CLI users.

### Work

1. Update API docs in `apps/docs`:
   - auth overview
   - OAuth quickstart
   - PKCE example
   - scopes
   - token refresh
   - revocation behavior
2. Keep API key docs for direct backend use
3. Add CLI login docs describing OAuth-based login
4. Update OpenAPI docs where relevant
5. Add examples for:
   - curl
   - TypeScript
   - Python
   - CLI
6. Document discovery endpoints and expected usage by agents

### Deliverable

Developers and agent platforms can integrate without reverse-engineering the
flow.

## Phase 10: Security hardening and operational readiness

### Goal

Make the implementation safe to run in production.

### Work

1. Add rate limiting for:
   - authorization endpoint
   - token endpoint
2. Add replay protections and one-time code enforcement
3. Add refresh token rotation and reuse detection
4. Add signing key rotation plan if JWTs are used
5. Add monitoring and alerts for:
   - token issuance failures
   - invalid client auth spikes
   - redirect URI mismatch spikes
   - refresh token reuse
6. Add cleanup jobs for expired:
   - authorization codes
   - refresh tokens
   - revoked grants
7. Review all error messages for information leakage
8. Review consent and redirect flows for phishing resistance

### Deliverable

OAuth implementation is production-safe and observable.

## Suggested file and module areas

### Likely new route handlers

- `apps/web/app/api/v1/oauth/authorize/route.ts`
- `apps/web/app/api/v1/oauth/token/route.ts`
- `apps/web/app/api/v1/oauth/jwks/route.ts` if JWT access tokens are used
- `apps/web/app/.well-known/oauth-authorization-server/route.ts`
- optionally `apps/web/app/.well-known/openid-configuration/route.ts`

Likely related existing routes to refactor or retire later:

- `apps/web/app/api/cli-login-sessions/route.ts`
- `apps/web/app/api/cli-login-sessions/redeem/route.ts`
- `apps/web/app/[lang]/cli/login/page.tsx`
- `apps/web/app/[lang]/cli/login/cli-login-client.tsx`

### Likely new library modules

- `apps/web/lib/api/oauth-clients.ts`
- `apps/web/lib/api/oauth-scopes.ts`
- `apps/web/lib/api/oauth-authorize.ts`
- `apps/web/lib/api/oauth-token.ts`
- `apps/web/lib/api/oauth-pkce.ts`
- `apps/web/lib/api/oauth-discovery.ts`
- `apps/web/lib/api/oauth-auth.ts`
- `apps/web/lib/api/oauth-jwks.ts` only if JWT access tokens are used

Likely existing modules to study and align with:

- `apps/web/lib/api/auth.ts`
- `apps/web/lib/api/external-errors.ts`
- `apps/web/lib/api/logger.ts`
- `apps/web/lib/api/rate-limit.ts`
- `apps/web/lib/api/responses.ts`
- `apps/web/lib/api/cli-login.ts`

### Likely dashboard / UI areas

- consent page under `apps/web/app/[lang]/...`
- connected apps settings page
- internal client management UI if needed

### Likely database migrations

Core lean v1 tables:

- `public.oauth_clients`
- `public.oauth_authorization_codes`
- `public.oauth_refresh_tokens`

Conditional v1 table:

- `public.oauth_access_tokens` if opaque access tokens are used

Deferred unless later phases require them:

- `public.oauth_client_redirect_uris`
- `public.oauth_consents`
- `public.oauth_signing_keys`

Likely existing schema to reference for patterns:

- `public.api_keys`
- `public.cli_login_sessions`

Migration notes:

- after adding the SQL migrations, regenerate `apps/web/lib/supabase/types.d.ts`
  so the new OAuth tables are reflected in the typed `Database` definition
- follow the same migration discipline already used in the repo:
  - timestamped migration filenames
  - RLS enabled on new tables
  - foreign keys to `auth.users(id)` where user ownership is required
  - indexes for expiry and lookup-heavy columns

## Migration strategy

### Step 1

Ship OAuth alongside API keys.

### Step 2

Update the CLI to use OAuth + PKCE.

### Step 3

Document OAuth as the preferred auth method for agents and third-party apps.

### Step 4

Keep API keys as the preferred auth method for direct backend/server-to-server
usage unless a future product decision changes that.

### Step 5

Deprecate the custom CLI API-key exchange flow only after the OAuth CLI flow is
stable.

## Open decisions

These decisions should be resolved before implementation starts:

1. **Opaque tokens vs JWT access tokens**
2. **Whether to implement OIDC in v1 or OAuth-only**
3. **How OAuth clients are registered**
   - static config
   - admin-created records
   - self-serve later
4. **Whether first-party clients skip consent**
5. **How granular scopes should be initially**
6. **Whether billing access should require separate elevated consent**
7. **How localhost redirect URIs are constrained for CLI/dev clients**
8. **Whether token introspection and revocation endpoints are needed in v1**

## Recommended decisions for v1

To keep scope realistic, the recommended v1 choices are:

- Authorization Code + PKCE only
- refresh tokens enabled
- lean schema with:
  - `oauth_clients`
  - `oauth_authorization_codes`
  - `oauth_refresh_tokens`
- add `oauth_access_tokens` only if opaque access tokens are chosen
- defer `oauth_client_redirect_uris` and `oauth_consents` unless they become
  necessary during implementation
- OAuth-only first, OIDC later if needed
- exact redirect URI matching
- static or admin-managed client registration
- first-party CLI client allowed
- localhost redirect support limited to the same hosts already allowed by the
  current CLI flow unless intentionally expanded
- minimal OAuth scopes mapped to current endpoints
- API keys remain supported
- discovery metadata published only after endpoints are real

## Verification

### Targeted tests

- authorize endpoint rejects invalid redirect URI
- authorize endpoint requires PKCE for public clients
- authorize endpoint returns code and state on success
- token endpoint rejects invalid code verifier
- token endpoint rejects reused authorization code
- token endpoint rotates refresh tokens correctly
- API routes accept valid OAuth access tokens
- API routes reject missing required scopes
- discovery metadata matches actual endpoint behavior
- CLI localhost callback flow works end-to-end

### Regression checks

- existing API key auth still works for all current `/api/v1/*` routes
- rate limiting still applies correctly
- request logging still includes useful auth context
- billing and speech endpoints preserve current behavior for API key users
- the existing CLI login flow continues to work during the migration window
  until it is intentionally deprecated

### Commands

- `pnpm test -- <targeted test files>`
- `pnpm type-check`
- `pnpm fixall`

## Rollout notes

- do not publish discovery metadata until the real OAuth endpoints exist
- do not advertise OIDC unless the implementation is actually compliant enough
- keep API key auth stable during rollout
- migrate the CLI only after OAuth token issuance is production-ready
- prefer honest partial support over overclaiming standards compliance

## Success criteria

This plan is complete when SexyVoice can support the following flow:

1. an agent or CLI discovers SexyVoice OAuth metadata
2. the user is redirected to SexyVoice and logs in
3. the user approves requested scopes
4. the client exchanges an authorization code with PKCE
5. the client receives an access token and refresh token
6. the client calls `/api/v1/*` with the access token
7. SexyVoice enforces scopes and can revoke access per client

At that point SexyVoice will support a real standards-based delegated auth flow
for agents and third-party integrations while preserving API keys for direct
developer usage.
