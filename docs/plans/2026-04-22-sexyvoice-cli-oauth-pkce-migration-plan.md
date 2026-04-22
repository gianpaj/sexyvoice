# SexyVoice CLI OAuth + PKCE Migration Plan

## Objective

Migrate `sexyvoice-cli` from the current custom browser-assisted API key login
flow to a real OAuth 2.0 Authorization Code flow with PKCE so the CLI can:

- authenticate without receiving a raw long-lived dashboard API key
- use short-lived access tokens
- refresh access without forcing repeated logins
- align with the planned SexyVoice OAuth server
- share the same standards-based auth model as agents and third-party apps

This plan assumes the server-side OAuth work in
`docs/plans/2026-04-22-oauth-authorization-code-pkce-implementation-plan.md`
will be implemented in parallel or first.

## Why this migration matters

The current CLI login flow is good for a first-party tool, but it is still a
custom credential handoff that ends with the CLI storing a SexyVoice API key
returned by the `/api/cli-login-sessions/redeem` exchange endpoint.

Migrating the CLI to OAuth + PKCE improves:

- security, because the CLI no longer stores a raw API key
- consistency, because the CLI uses the same auth model as future agents
- maintainability, because auth logic becomes standards-based
- user trust, because login becomes a familiar delegated authorization flow
- future extensibility, because scopes and revocation become client-aware

## Current state

Today `sexyvoice login` roughly works like this:

1. the CLI starts a localhost callback listener
2. the CLI opens the browser to the localized CLI login page
3. the user logs into SexyVoice in the browser if needed
4. the web app validates `callback_url` and `state`
5. the user either:
   - selects an existing active API key, or
   - creates a new CLI API key if they have paid access
6. `POST /api/cli-login-sessions` creates a short-lived login session
7. the browser is redirected back to localhost with:
   - `exchange_token`
   - `state`
8. the CLI calls `POST /api/cli-login-sessions/redeem`
9. the redeem endpoint returns:
   - `api_key_id`
   - `key`
10. the CLI stores the API key locally
11. future CLI requests use the API key directly

This is functional, but it is not OAuth and it does not use PKCE.

## Target state

After migration, `sexyvoice login` should work like this:

1. the CLI generates:
   - a PKCE code verifier
   - a PKCE code challenge
   - a random `state`
2. the CLI starts a localhost callback listener
3. the CLI opens the browser to the SexyVoice authorization endpoint
4. the user logs in and approves access
5. SexyVoice redirects back to localhost with:
   - `code`
   - `state`
6. the CLI verifies `state`
7. the CLI exchanges the authorization code and code verifier at the token
   endpoint
8. the CLI stores:
   - refresh token
   - access token metadata
   - token expiry
   - granted scopes
9. the CLI refreshes access tokens automatically when needed
10. CLI API calls use OAuth bearer access tokens

## Non-goals

This migration plan should not include:

- replacing all existing CLI command behavior
- redesigning unrelated CLI UX
- adding device code flow in v1
- supporting every OAuth grant type
- removing API key support from the server
- implementing OIDC-specific identity features in the CLI unless required later

## Recommended v1 scope

The CLI migration should support:

- Authorization Code + PKCE
- localhost callback redirect
- automatic token refresh
- logout / credential removal
- migration from old stored API key credentials
- clear user-facing auth errors
- backward-compatible rollout while the old login flow still exists
- preserving the current browser-based localhost UX where practical

## Phase 1: Audit the current CLI auth architecture

### Goal

Understand the current login, storage, and request pipeline before changing it.

### Work

1. Identify the current login command flow end-to-end
2. Identify where the CLI:
   - opens the browser
   - starts the localhost callback server
   - exchanges the callback payload
   - stores credentials
   - injects auth into API requests
3. Identify the current credential storage format
4. Identify all commands that assume an API key exists
5. Identify any tests that currently cover login or auth state
6. Identify any docs or help text that mention API key login behavior

### Deliverable

A clear map of the current CLI auth flow and all code paths that depend on it.

## Phase 2: Define the CLI OAuth client contract

### Goal

Lock down the exact OAuth behavior the CLI will rely on.

### Work

1. Define the CLI as a first-party public OAuth client
2. Preserve compatibility with the current localhost-only callback policy, which
   today accepts only `http:` URLs on `127.0.0.1` or `localhost`
3. Define allowed redirect URIs, likely:
   - `http://127.0.0.1:<port>/callback`
   - `http://localhost:<port>/callback`
4. Decide whether the CLI uses:
   - a fixed redirect path with dynamic port
   - a fixed port
   - a port range
5. Define the requested scopes for the CLI
6. Define token lifetime expectations:
   - access token TTL
   - refresh token TTL
   - refresh token rotation behavior
7. Define logout semantics:
   - local credential deletion only
   - optional server-side revocation later

### Recommended initial scopes

For the current CLI use case, start with the minimum needed OAuth scopes:

- `tts.generate`
- `voices.read`
- `models.read`
- optionally `billing.read` if the CLI exposes balance or usage commands

Note that this is a new OAuth scope model. The current API key flow stores
permissions as JSON and defaults new keys to `{"scopes":["voice:generate"]}`.

### Deliverable

A stable contract between `sexyvoice-cli` and the SexyVoice OAuth server.

## Phase 3: Add PKCE and authorization request generation

### Goal

Replace the custom login bootstrap with a standards-based authorization request.

### Work

1. Add PKCE helper utilities in the CLI for:
   - generating a high-entropy code verifier
   - deriving an `S256` code challenge
2. Add secure random `state` generation
3. Build the authorization URL with:
   - `response_type=code`
   - `client_id`
   - `redirect_uri`
   - `scope`
   - `state`
   - `code_challenge`
   - `code_challenge_method=S256`
4. Preserve any existing browser-opening UX where possible
5. Ensure the CLI prints a fallback URL if automatic browser open fails

### UX notes

The login command should remain simple, for example:

- “Opening browser to authenticate with SexyVoice...”
- “If the browser did not open, visit this URL: ...”

### Deliverable

The CLI can generate a valid OAuth authorization request with PKCE.

## Phase 4: Rework the localhost callback flow

### Goal

Keep the current browser-to-localhost UX, but receive an authorization code
instead of a custom exchange token.

### Work

1. Reuse or refactor the existing localhost callback server
2. Replace the current callback expectation of:
   - `exchange_token`
   - `state`
   with OAuth callback handling for:
   - `code`
   - `state`
   - OAuth error parameters
3. Verify the returned `state` matches the original request
4. Handle timeout and cancellation cleanly
5. Return a friendly browser success page or message after callback completion
6. Return a friendly browser error page if login fails or is cancelled

### Error cases to handle

- missing `code`
- missing `state`
- mismatched `state`
- `access_denied`
- callback timeout
- port binding failure
- browser closed before completion

### Deliverable

The CLI can safely receive and validate the OAuth authorization response.

## Phase 5: Implement token exchange and refresh

### Goal

Exchange the authorization code for tokens and support automatic refresh.

### Work

1. Add token endpoint client logic for:
   - `grant_type=authorization_code`
   - `code`
   - `redirect_uri`
   - `client_id`
   - `code_verifier`
2. Parse and validate token responses:
   - `access_token`
   - `refresh_token`
   - `expires_in`
   - `scope`
   - `token_type`
3. Add refresh flow using:
   - `grant_type=refresh_token`
4. Implement refresh token rotation handling
5. Handle token endpoint errors clearly
6. Ensure only `Bearer` token type is accepted unless future requirements change

### Recommended behavior

- refresh access tokens automatically before or when expired
- if refresh fails with an invalid grant or revoked token, require re-login
- avoid prompting the user again unless refresh is no longer possible

### Deliverable

The CLI can exchange authorization codes and refresh tokens successfully.

## Phase 6: Replace API key storage with OAuth credential storage

### Goal

Store OAuth credentials safely and update the CLI auth model.

### Work

1. Define a new local credential shape, for example:
   - access token
   - refresh token
   - access token expiry timestamp
   - granted scopes
   - issuer / base URL
   - client id
2. Decide whether to store:
   - current access token plus refresh token, or
   - refresh token only and fetch access token on demand
3. Update local storage read/write logic
4. Ensure file permissions remain restrictive
5. Add versioning to the stored auth format if needed
6. Avoid logging tokens or writing them to debug output

### Recommendation

Store:

- refresh token
- current access token
- expiry timestamp
- granted scopes

This gives good UX while still allowing automatic refresh.

### Deliverable

The CLI stores OAuth credentials instead of a raw API key.

## Phase 7: Update the request pipeline to use bearer access tokens

### Goal

Make all authenticated CLI API calls use OAuth access tokens.

### Work

1. Refactor the auth header injection layer
2. Replace API key header usage with:
   - `Authorization: Bearer <access_token>`
3. Add token freshness checks before requests
4. Refresh tokens automatically when needed
5. Retry once after refresh if the access token is expired
6. Distinguish auth failures from normal API failures

### Compatibility note

During rollout, it may be useful to support both stored auth modes temporarily:

- legacy API key credentials
- new OAuth credentials

This allows a smoother migration for existing CLI users.

### Deliverable

Authenticated CLI commands work with OAuth bearer tokens.

## Phase 8: Add migration and backward compatibility behavior

### Goal

Move existing CLI users to the new auth model without unnecessary breakage.

### Work

1. Detect legacy stored API key credentials
2. Decide migration behavior:
   - continue using legacy credentials until re-login
   - or prompt users to re-authenticate
3. Update `sexyvoice login` to always use OAuth once available
4. Update `sexyvoice logout` to remove OAuth credentials
5. Add a clear message for users upgrading from the old auth model
6. Keep the old server-side custom login flow temporarily if needed
7. Plan removal of the current web flow pieces only after migration is complete,
   including:
   - `/api/cli-login-sessions`
   - `/api/cli-login-sessions/redeem`
   - the localized CLI login page under `app/[lang]/cli/login/`

### Recommended rollout

- existing stored API keys continue to work for a transition period
- new logins use OAuth immediately
- users can re-run `sexyvoice login` to migrate
- old custom login flow is removed only after the OAuth CLI flow is stable

### Deliverable

Existing CLI users can transition to OAuth without a disruptive cutover.

## Phase 9: Improve CLI UX and error handling

### Goal

Make the new auth flow feel polished and understandable.

### Work

1. Update login command output to explain what is happening
2. Add clear messages for:
   - browser open failure
   - callback timeout
   - denied consent
   - expired or revoked session
   - refresh failure
3. Add a command or output path to inspect current auth state if useful
4. Ensure logout messaging is clear
5. Ensure non-interactive environments fail gracefully

### Suggested UX improvements

Potential messages:

- “Opening browser to connect your SexyVoice account...”
- “Waiting for authorization callback on localhost...”
- “Login successful.”
- “Your session expired. Run `sexyvoice login` again.”
- “Access was denied in the browser.”

These should stay aligned with the current browser-based login UX already
described in the dashboard and localized CLI login copy.

### Deliverable

The CLI auth experience is understandable for both happy-path and failure cases.

## Phase 10: Update tests

### Goal

Add confidence around the new OAuth login and token lifecycle behavior.

### Work

1. Add unit tests for:
   - PKCE verifier/challenge generation
   - state generation and validation
   - token expiry calculations
   - credential storage serialization
2. Add integration-style tests for:
   - authorization callback parsing
   - token exchange handling
   - refresh token rotation handling
   - auth header injection
3. Add migration tests for:
   - legacy API key credential detection
   - logout behavior
4. Mock browser and localhost callback behavior where needed

### Deliverable

The CLI auth migration is covered by targeted automated tests.

## Phase 11: Update CLI documentation

### Goal

Document the new login model clearly for users and maintainers.

### Work

1. Update CLI README and help text
2. Document the new `sexyvoice login` flow
3. Document localhost callback expectations
4. Document how credentials are stored locally
5. Document how to recover from expired or revoked sessions
6. Document any environment or debug flags relevant to auth
7. Remove or rewrite docs that imply the CLI stores a dashboard API key

### Deliverable

CLI docs accurately describe OAuth + PKCE login behavior.

## Suggested implementation areas in `sexyvoice-cli`

The exact paths depend on the CLI repo structure, but likely areas include:

- login command implementation
- localhost callback server
- auth storage module
- HTTP client / request wrapper
- config or credential file handling
- logout command
- tests for auth and login flows

This plan intentionally avoids naming exact CLI file paths because that repo was
not reviewed here line-by-line. The migration work should start with a concrete
audit of `sexyvoice-cli` before implementation.

## Suggested auth state model

A useful internal auth state shape may look like:

- `auth_type`: `oauth`
- `issuer`
- `client_id`
- `access_token`
- `refresh_token`
- `expires_at`
- `scopes`

Optional fields:

- `token_type`
- `created_at`
- `last_refresh_at`

If legacy support is needed during migration, the CLI may temporarily support:

- `auth_type: api_key`
- `auth_type: oauth`

## Open decisions

These decisions should be resolved before implementation starts:

1. whether the CLI should support both `localhost` and `127.0.0.1`
2. whether the CLI should use a random available port or a fixed port
3. whether the CLI should store the current access token or derive it on demand
4. whether logout should attempt server-side revocation in v1
5. whether the CLI should expose a command to inspect current auth status
6. how long legacy API key credentials should remain supported
7. whether the CLI should support headless fallback later via device flow

## Recommended decisions for v1

To keep the migration practical, the recommended v1 choices are:

- public OAuth client
- Authorization Code + PKCE only
- localhost callback with dynamic port
- support both `localhost` and `127.0.0.1` if the server allows both
- store refresh token plus current access token
- automatic refresh
- local logout only in v1
- legacy API key credentials supported temporarily
- no device code flow in v1

## Verification

### Targeted tests

- login command generates valid PKCE values
- login command generates and validates `state`
- callback handler rejects mismatched `state`
- token exchange succeeds with valid authorization response
- refresh flow updates stored credentials correctly
- expired access token triggers refresh before request
- revoked refresh token forces re-login
- logout removes stored OAuth credentials
- legacy API key credentials remain usable during transition if supported

### Manual checks

- `sexyvoice login` opens the browser successfully
- browser callback returns to localhost successfully
- CLI stores OAuth credentials locally
- authenticated commands work after login
- access token refresh happens without user interaction
- `sexyvoice logout` clears local auth state
- re-running login after logout works cleanly

### Commands

Run the smallest relevant CLI test suites first, then broader checks as needed in
the CLI repo.

## Rollout notes

- ship the server-side OAuth endpoints before switching the CLI default login
- keep the old custom login flow available briefly during migration if needed
- prefer re-login migration over risky automatic credential conversion
- do not remove legacy support until the OAuth CLI flow is stable in production
- keep user-facing messaging simple and explicit during the transition
- keep the current localhost-only callback safety constraints unless there is an
  explicit product decision to broaden them

## Success criteria

This plan is complete when:

1. `sexyvoice login` uses OAuth Authorization Code + PKCE
2. the CLI receives an authorization code via localhost callback
3. the CLI exchanges the code for tokens successfully
4. the CLI stores OAuth credentials instead of a raw API key
5. authenticated CLI commands use bearer access tokens
6. token refresh works automatically
7. users can log out and re-authenticate cleanly
8. the old custom API-key login flow can be deprecated safely

## Relationship to the server plan

This CLI plan depends on the server-side OAuth work described in:

- `docs/plans/2026-04-22-oauth-authorization-code-pkce-implementation-plan.md`

In particular, the CLI migration requires the server to provide:

- a registered first-party CLI OAuth client
- `GET /api/v1/oauth/authorize`
- `POST /api/v1/oauth/token`
- localhost redirect URI support for the CLI client
- PKCE verification
- access token issuance
- refresh token issuance and rotation
- OAuth-compatible error responses

It should also preserve the current practical constraints already present in the
repo where appropriate, including localhost callback validation and a browser-led
login flow.

The CLI migration should begin only after that contract is stable enough for
end-to-end testing.
