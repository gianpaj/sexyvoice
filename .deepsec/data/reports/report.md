# Vulnerability Scan Report

| Field | Value |
|-------|-------|
| Project | sexyvoice-2 |
| Date | 2026-05-05T09:49:25.462Z |
| Files tracked | 248 |
| Files analyzed | 248 |
| Total findings | 61 |

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 8 |
| MEDIUM | 32 |
| HIGH_BUG | 4 |
| BUG | 9 |

## HIGH (8)

### Live production secrets stored in unignored .env.localx (gitignore bypassed by 'x' suffix)

- **File:** `.env.localx`
- **Lines:** 6, 8, 9, 11, 14, 15, 20, 24, 38, 44, 45, 46, 48, 49, 50, 51, 54, 74, 75, 85, 89, 92
- **Slug:** secrets-exposure
- **Confidence:** high

The file contains live production credentials including: STRIPE_SECRET_KEY=sk_live_... (live Stripe API key — full charge/refund/customer access on the production Stripe account), SUPABASE_SERVICE_ROLE_KEY (a service-role JWT that bypasses Postgres RLS — read/write any user data), KV_REST_API_TOKEN / KV_REST_API_READ_ONLY_TOKEN (Vercel KV write & read tokens), BLOB_READ_WRITE_TOKEN (Vercel Blob write token), R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY (Cloudflare R2 storage credentials for the sv-audio-files bucket), LIVEKIT_API_SECRET, XAI_API_KEY / REPLICATE_API_TOKEN / FAL_KEY / two GOOGLE_GENERATIVE_AI_API_KEY values (paid AI APIs that an attacker can drain), INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY (production — allows forging/signing background jobs), and three HMAC/encryption secrets (API_KEY_HMAC_SECRET, CLI_LOGIN_ENCRYPTION_SECRET, OAUTH_CALLBACK_MARKER_SECRET) — with these an attacker can forge API key hashes, decrypt CLI handoff payloads, and forge OAuth callback markers. Critically, the project .gitignore protects `.env.local`, `.env*.local`, `.env`, and `.env.e2e`, but NONE of those patterns match the actual filename `.env.localx` — the trailing `x` defeats every rule. The file is currently untracked, but `git check-ignore .env.localx` returns no match, so a routine `git add .` from the project root would commit and push every secret. The same naming pattern (`x` appended to defeat the ignore rule) appears with `.env.e2ex`, suggesting this is repeated in the developer's workflow. Even before any commit, having live credentials in plaintext outside the standard ignored filenames means they leak through cloud sync, IDE indexers, AI tools that read working-tree files, backups, etc.

**Recommendation:** 1) Immediately rotate every credential in this file: Stripe live secret key, Supabase service role JWT (regenerate in Supabase dashboard), KV tokens, Blob token, R2 keys, LiveKit secret, XAI/Replicate/FAL/Gemini API keys, INNGEST production event+signing keys, and all three HMAC secrets (API_KEY_HMAC_SECRET, CLI_LOGIN_ENCRYPTION_SECRET, OAUTH_CALLBACK_MARKER_SECRET). 2) Rename to a filename that .gitignore actually matches — e.g. `.env.local` (the standard) or add explicit lines `.env.localx` and `.env.e2ex` to .gitignore. 3) Audit `git log --all --full-history -- .env.localx` and the remote to confirm no historical leak. 4) Move secrets to a managed secret store (Vercel env vars, Doppler, 1Password) and avoid keeping live production secrets on developer laptops at all.

---

### Unauthenticated, unrate-limited LLM chat endpoint billable to OPENROUTER_API_KEY

- **File:** `apps/docs/src/app/api/chat/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 70, 71, 82, 84, 85, 88, 89, 91
- **Slug:** expensive-api-abuse
- **Confidence:** high

The POST handler accepts arbitrary user requests, runs `streamText` against OpenRouter with the server's `OPENROUTER_API_KEY`, and returns the streamed response — with no authentication, no IP/user rate limiting, no captcha, and no payload size cap on individual messages. The Zod schema only caps the message array length at 50, but each message is `z.any()` and can be arbitrarily large. An attacker can send 50 messages of ~100KB each to balloon prompt tokens, repeat thousands of times per minute, and burn through the operator's OpenRouter quota with no per-request cost gate. The `searchTool` and `stepCountIs(5)` constrain the agent's per-response branching but do not bound input size or request frequency. Because Next.js middleware is absent for /api routes in this app, there's no edge-level gate either.

**Recommendation:** Add request-rate limiting keyed on IP (and/or a session identifier) — Upstash Redis sliding-window or Vercel rate-limit middleware. Add a hard byte/token cap on the request body (e.g., reject any message field > 8KB and any aggregate > 64KB before invoking the model). Consider also requiring a low-friction client identity (e.g., turnstile/captcha or a signed token from the docs frontend) so anonymous scripts can't trivially hammer the endpoint. Wrap the `requestSchema.parse` call in a try/catch returning 400 — currently a malformed body throws an uncaught error.

---

### Authenticated LLM endpoint with no credit deduction, usage tracking, or rate limit

- **File:** `apps/web/app/api/generate-text/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 16, 26, 33, 37, 58, 79
- **Slug:** expensive-api-abuse
- **Confidence:** high

POST /api/generate-text calls `streamText({ model: google('gemini-3.1-flash-lite-preview'), system, prompt, maxOutputTokens: 500, ... })` for any authenticated Supabase user. Unlike /api/clone-voice, /api/estimate-credits, or /api/v1/speech, this handler never calls getCredits, validateCredits, hasUserPaid, reduceCredits, insertUsageEvent, or consumeRateLimit — it merely caps the input prompt at 1000 chars. Any signed-in user (and account creation appears self-serve) can stream unlimited tokens from Gemini at the company's expense, exhausting the Vertex/Google AI quota or driving up the bill. There is no cap on the number of concurrent or sequential calls.

**Recommendation:** Before calling streamText, validate credits with estimateCredits() and check hasUserPaid() (or apply the same per-user rate limit used in /api/v1/speech). After completion, deduct credits and emit a usage_events row using onFinish/await result.usage. At minimum, gate the endpoint with consumeRateLimit() keyed on user.id.

---

### IDOR: stripeId from query params used without ownership verification

- **File:** `apps/web/app/api/stripe/transactions/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 9, 10, 22, 25, 31, 32
- **Slug:** cross-tenant-id
- **Confidence:** high

The GET handler accepts a `stripeId` from query parameters (line 10) and uses it directly in a Stripe API call (line 32) to list subscriptions, without verifying that the supplied `stripeId` actually belongs to the authenticated user. While `supabase.auth.getUser()` confirms the caller is logged in (lines 22-28), there is no authorization step linking the supplied stripeId to `user.id`. Any authenticated user can call `GET /api/stripe/transactions?stripeId=cus_OTHER_USER_ID` and receive that other user's subscription data: subscription IDs, billed amounts (`unit_amount`), plan nicknames, statuses, period start/end timestamps, and invoice IDs. This is a textbook IDOR / cross-tenant access bug. Stripe customer IDs are not trivially enumerable, but they could be obtained from log leaks, support exports, breach data, or via insider knowledge — the bug remains real and exploitable. The endpoint also lacks any input validation on `stripeId` format and has no rate limiting.

**Recommendation:** Do not trust client-supplied stripeId. Either (a) ignore the parameter and look up the authenticated user's stripe_id from the `profiles` table (`select stripe_id from profiles where id = user.id`) and use that for the Stripe call, or (b) load the user's profile and reject the request with 403 if `profile.stripe_id !== stripeId`. Option (a) is preferable because it eliminates the parameter entirely.

---

### 'use server' file with admin operations and no auth checks — multiple latent CRITICAL exposures

- **File:** `apps/web/lib/supabase/queries.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 1, 104, 168, 186, 241, 327, 400, 556, 586, 603, 636
- **Slug:** server-action-no-auth
- **Confidence:** high

The file is marked 'use server' at the top level, making every exported async function a publicly-callable Next.js Server Action. Per Next.js's own security model, 'Server Actions are public HTTP endpoints. They should be treated like any other public-facing endpoint to ensure the user is authorized to perform the action.' None of the functions in this file contain any authentication or authorization check (no supabase.auth.getUser() / getClaims call exists in queries.ts). Several functions also use createAdminClient() (which uses SUPABASE_SERVICE_ROLE_KEY and bypasses ALL RLS) and accept a userId parameter from the caller. One Server Action — hasUserPaid — is already imported by the client component apps/web/components/credits-section.tsx, so its action ID is bundled into client JS, confirming the pattern is exposed in production. Even though the more dangerous admin-client functions (insertSubscriptionCreditTransaction, insertTopupCreditTransaction, reduceCredits, reduceCreditsAdmin, getCreditsAdmin, saveAudioFileAdmin, hasUserPaidAdmin, insertUsageEvent, resolveCharacterPrompt) are not currently imported across the client boundary, they are one casual client import away from CRITICAL exploitability. The architecture violates least-privilege: routine query helpers and webhook-only privileged operations live in the same Server-Action-exporting file with no per-function auth gating.

**Recommendation:** Remove the file-level 'use server' directive — these are intended to be plain server-side helper functions, not Server Actions. Use the 'server-only' npm package instead to ensure the module is never bundled into client code. If any function genuinely needs to be a Server Action, split it into a dedicated file and add an explicit `const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error('Unauthorized')` check at the top, plus authorization checks (e.g., resolve userId from `user.id`, never trust a userId parameter for cross-user operations). Privileged operations (admin-client + SECURITY DEFINER RPCs) should never be Server Actions — only invoke them from authenticated API routes or trusted webhook handlers.

---

### reduceCredits Server Action allows draining any user's credits via SECURITY DEFINER RPC

- **File:** `apps/web/lib/supabase/queries.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 168, 178, 179, 586
- **Slug:** cross-tenant-id
- **Confidence:** high

reduceCredits uses createClient() (cookie-session) — not the admin client — but it then calls supabase.rpc('decrement_user_credits', { user_id_var: userId, ... }). The migration apps/web/supabase/migrations/20251027132100_update_credit_function_params.sql defines decrement_user_credits as SECURITY DEFINER, which means the RPC runs with the function owner's privileges and bypasses RLS. The userId is a function parameter taken from the caller, with no check that it matches the authenticated session. Combined with the file-level 'use server', if reduceCredits is ever imported by a client component (or is reachable via the existing Server Action manifest in any future build), an authenticated attacker can pass any victimUserId and drain that user's credit balance. Mirror issue: reduceCreditsAdmin (L586) does the same thing with the admin client outright.

**Recommendation:** Resolve the user from the session (`const { data: { user } } = await supabase.auth.getUser()`) and ignore any userId argument, OR add `if (user.id !== userId) throw new Error('Forbidden')`. For reduceCreditsAdmin, gate it behind an API-route-only path (do not export from a 'use server' file). Additionally, change decrement_user_credits to SECURITY INVOKER and rely on a credits RLS UPDATE policy, or add an explicit `IF auth.uid() <> user_id_var` guard inside the function body.

---

### Credit-grant Server Actions (insertSubscriptionCreditTransaction / insertTopupCreditTransaction) accept all parameters from caller

- **File:** `apps/web/lib/supabase/queries.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 327, 371, 400, 442, 462
- **Slug:** server-action-no-auth
- **Confidence:** high

Both functions are exported from a 'use server' file and use createAdminClient(), which bypasses RLS. They accept userId, paymentIntentId, subscriptionId, creditAmount, and dollarAmount entirely from the caller. The only de-duplication check is `.eq('reference_id', paymentIntentId)`, which an attacker trivially defeats by supplying a unique fake reference_id per call. After insert, updateUserCredits() is invoked with the attacker-controlled creditAmount, calling increment_user_credits (also SECURITY DEFINER) to add credits to the supplied user_id_var. While the legitimate caller (apps/web/app/api/stripe/webhook/route.ts) verifies the Stripe-Signature header before calling these, the underlying Server Action does not — the signature check lives in the route handler, not in the action itself. If these actions are ever discovered in the action manifest (any future client import would put their IDs in the bundle), an attacker can grant themselves unlimited credits. This is the most catastrophic latent exposure in the file.

**Recommendation:** Move these functions into a non-'use server' module (e.g., lib/billing/credit-transactions-internal.ts) that uses the 'server-only' package marker. Only the Stripe webhook handler should be able to import them. Even better: make them require a verified Stripe.Event object as input (not loose primitives), so the signature-verified event is the only acceptable trigger. Never let credit grants be reachable via Server Action.

---

### /stats command and stats callback have no user-level authorization — any Telegram user can exfiltrate sensitive business data

- **File:** `apps/web/supabase/functions/telegram-bot/index.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 867, 877, 921, 930, 935, 13, 18, 957
- **Slug:** missing-auth
- **Confidence:** high

The Telegram bot exposes a /stats command (lines 867-877) and an inline-keyboard 'stats' callback (lines 930-935) that invoke generateTodayStats(). Neither handler validates ctx.chat.id, ctx.from.id, or any allowlist before responding with sensitive business metrics. The only gatekeeping is the FUNCTION_SECRET query parameter check at line 957, which authenticates the Telegram-to-function webhook channel — it does NOT authorize which Telegram user/chat may use bot commands. Telegram bots are publicly discoverable by username, so any attacker who locates the bot (e.g., via search or guessing 'sexyvoice_*_bot') can DM it and execute /stats. The response leaks: daily/weekly/all-time revenue (lines 839-842), top 3 customers with masked usernames and exact purchase amounts/types (line 819), top 3 power users with credit usage in dollars (line 836), refund counts and amounts (lines 821-828), paid-user counts and conversion ratios (line 834), API key activity (line 831), 3-month MTD revenue trend (line 842), and a burn-rate flag that can hint at financial health (lines 624-627). Worse, the Supabase client is constructed with SUPABASE_SERVICE_ROLE_KEY (line 18), so all queries bypass RLS — there is no DB-side mitigation. The README confirms 'Authentication: Webhook secret validation' is the only auth model.

**Recommendation:** Add an explicit allowlist of admin Telegram user IDs (and/or chat IDs) and check it at the top of every command/callback handler. Source the allowlist from an env var like ADMIN_TELEGRAM_USER_IDS. Reject (or silently drop) any update where ctx.from?.id is not in the allowlist BEFORE invoking generateTodayStats(). Consider also gating /menu so the inline-keyboard 'stats' button is not even rendered for non-admins.

---

## MEDIUM (32)

### Test user credentials in unignored .env.e2ex (gitignore bypassed by 'x' suffix)

- **File:** `.env.e2ex`
- **Lines:** 1, 2
- **Slug:** secrets-exposure
- **Confidence:** high

The file contains a Playwright test user email and password (gianpa@gmail.com / musiclife) in plaintext. The .gitignore has a rule for `.env.e2e` but not for `.env.e2ex` — the trailing `x` defeats the pattern, and `git check-ignore` confirms the file is unprotected. A `git add .` would commit it. The same circumvention pattern appears with `.env.localx`, suggesting a systemic naming convention that bypasses .gitignore. The credentials look like a real user account (the email matches the project owner's apparent personal address) rather than a synthetic test fixture, raising the severity from purely-test to potential account compromise.

**Recommendation:** Add `.env.e2ex` and `.env.localx` to .gitignore (or rename to standard `.env.e2e` / `.env.local`). Rotate the password — even for a test user, plaintext credentials in working-tree files are a leak vector. If this is genuinely a synthetic test fixture, document that and use a clearly synthetic email (e.g. e2e-test@example.invalid).

---

### Disposable-email and Gmail-alias abuse prevention is client-side only

- **File:** `apps/web/app/[lang]/(auth)/signup/signup-form.tsx`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 39, 40, 41, 50
- **Slug:** rate-limit-bypass
- **Confidence:** high

The banlist and Gmail-with-`+` checks (lines 39–48) run exclusively in the browser before calling `supabase.auth.signUp()`. The Supabase browser client uses the public NEXT_PUBLIC_SUPABASE_ANON_KEY (see lib/supabase/client.ts). An attacker can bypass these abuse-prevention checks trivially by: (a) calling the Supabase Auth REST endpoint (`/auth/v1/signup`) directly with the published anon key, (b) running `supabase.auth.signUp(...)` from the devtools console after deleting the form, or (c) modifying the bundled JS to skip the guard. There is no equivalent server-side check (grep for `banList`/`banlist` finds only this client file and the constant). Combined with the broken comparison above, the practical effect today is zero protection; even after fixing the comparison, the only enforcement layer would still be the browser. This enables: account spam from disposable-email providers (the explicit intent of the banlist), and abuse of Gmail `+` aliases to claim the free-credit signup bonus (`landing.cta.freeCredits` on the signup page) repeatedly from the same Gmail mailbox.

**Recommendation:** Move email-policy enforcement to the server: a Supabase Auth Hook (Before User Created), a Postgres trigger on auth.users, an Edge Function that wraps signup, or a custom Next.js route handler that does the validation before calling the admin signUp. Treat the client-side check as a UX hint only. Also extend the alias detection to cover @googlemail.com and Gmail dot-insensitivity (normalize by removing dots from the local part) to prevent free-credit farming.

---

### Email enumeration via 'already registered' redirect

- **File:** `apps/web/app/[lang]/(auth)/signup/signup-form.tsx`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 65, 66
- **Slug:** other-info-disclosure
- **Confidence:** medium

When `signUpError.message.includes('already registered')` (line 65), the form redirects the user to `/${lang}/login?email=${encodeURIComponent(email)}`. This unambiguously confirms to an unauthenticated caller whether a given email already has an account on the platform — the signup endpoint becomes an oracle for user enumeration. Combined with no rate limiting evident in this file, an attacker can iterate over a large email list and harvest valid accounts (useful for credential stuffing, phishing campaigns, and targeted social engineering). Note: Supabase's underlying response already discloses this somewhat, but the redirect makes it trivially scriptable from the public form without parsing JSON errors.

**Recommendation:** Show a generic message ('Check your email to confirm your account') regardless of whether the email already exists, and rely on email-based confirmation flow to handle both new and existing users uniformly. If preserving the 'go to login' UX is required, gate it behind a CAPTCHA and rely on Supabase's 'confirm email change' flow rather than disclosing account existence to anonymous callers. Ensure rate limiting is configured at the Supabase project level for signup endpoints.

---

### MAX_ACTIVE_API_KEYS check-then-insert is non-atomic

- **File:** `apps/web/app/api/api-keys/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 72, 85, 97
- **Slug:** other-race-condition
- **Confidence:** high

Lines 72-90 do a SELECT count followed by a separate INSERT. Two concurrent POSTs can both observe count=9 (below MAX=10) and each insert a new key, ending at 11 active keys. Combined with no rate limiting on this endpoint, an authenticated paid user can race-create more keys than the cap permits. Impact is bounded to that single user's account but defeats the documented limit.

**Recommendation:** Enforce the limit in the database (e.g. a partial unique index or a SECURITY DEFINER function that does the count + insert in a single transaction with FOR UPDATE on the user's row) and/or apply consumeRateLimit on this handler.

---

### TOCTOU on credit + free-user-call-limit allows parallel-call abuse

- **File:** `apps/web/app/api/call-token/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 86, 88, 97, 98
- **Slug:** other-race-condition
- **Confidence:** high

Lines 86–106 read `getCredits` and call `isFreeUserOverCallLimit` without locking. A free user near or at the 5-minute cumulative call limit can fire multiple concurrent POSTs to /api/call-token; all observe the same total duration and pass the gate, each receiving its own LiveKit token + dispatched agent. This bypasses the documented free-user call cap and lets a free account amplify usage. The `MINIMUM_CREDITS_FOR_CALL` check is similarly bypassable for users near the floor.

**Recommendation:** Atomically reserve a call slot — e.g., insert a 'pending call' row with `INSERT ... WHERE NOT EXISTS (SELECT ... where active_calls >= N)` semantics, or use a Postgres advisory lock keyed on the user id. Tie the LiveKit token issuance to the reservation succeeding. Add a short per-user request-rate cap (Upstash Redis is already in the project) covering this endpoint.

---

### Rate limit identifier derived from attacker-controlled X-Forwarded-For header

- **File:** `apps/web/app/api/cli-login-sessions/redeem/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 15, 16
- **Slug:** rate-limit-bypass
- **Confidence:** high

The redeem endpoint computes its rate-limit key as `cli_login_redeem:${ip}` where `ip` is taken from `request.headers.get('x-forwarded-for')`. On Vercel/Next.js the X-Forwarded-For header value can be influenced by a remote client (Vercel typically appends to client-supplied values, and clients can include arbitrary content in the leftmost positions). An attacker can therefore rotate this header per request to obtain a fresh rate-limit bucket each time, defeating the 60 req/min Upstash token bucket. Because the underlying exchange_token is 32 random bytes (~256 bits of entropy), brute-forcing the token itself remains computationally infeasible, but the rate limit is not effective DoS protection on this auth endpoint and would be ineffective if token entropy were ever reduced. A safer approach is to use `request.ip` (NextRequest property), Vercel's `x-real-ip`, or to take only the leftmost value of x-forwarded-for after stripping client-supplied prefixes; alternatively rate-limit on the token_hash lookup result so attempts against any single session are bounded.

**Recommendation:** Switch to a trusted IP source (e.g., `(request as NextRequest).ip` or a header set by your trusted proxy) for the rate-limit identifier, or supplement the IP-based limit with a per-token-hash counter so any single session can only be redeemed-attempted N times regardless of source IP. Consider also rejecting requests that arrive without a known proxy-set client identifier in production.

---

### MAX_ACTIVE_API_KEYS and paid-user gates bypassable via api_key_id branch

- **File:** `apps/web/app/api/cli-login-sessions/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 67, 86, 87, 95, 108, 119, 129, 150
- **Slug:** acl-check
- **Confidence:** high

When a request supplies `api_key_id`, the handler verifies the existing key belongs to the user (lines 67-85) but then skips both the `hasUserPaid` check and the `MAX_ACTIVE_API_KEYS` count check (those run only in the `else` branch on lines 86-114). It still INSERTs a brand-new active api_key (lines 119-132). The old api_key remains active until — and only if — someone redeems the corresponding cli_login_session (cli-login-sessions/redeem/route.ts lines 93-99). An authenticated user with a single existing active key can therefore POST to /api/cli-login-sessions arbitrarily many times to create unlimited active api_keys, bypassing MAX_ACTIVE_API_KEYS=10. The endpoint has no rate limiting (only the redeem endpoint does), and a downgraded user can keep generating new keys without re-checking paid status because the paid check is skipped on this branch.

**Recommendation:** Always count active api_keys (and re-check hasUserPaid) before inserting a replacement, regardless of whether api_key_id was provided. Alternatively, deactivate the old api_key in the same transaction as the insert (and roll back if the limit would be exceeded), so the active-key count stays bounded.

---

### No rate limiting on expensive voice cloning endpoint

- **File:** `apps/web/app/api/clone-voice/route.ts`
- **Recent committers:** gianpaj <gianpa@gmail.com>, Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 1149, 1334, 1364
- **Slug:** rate-limit-bypass
- **Confidence:** high

The POST /api/clone-voice handler authenticates the user but applies no rate limiting (no consumeRateLimit, no Upstash Ratelimit). The endpoint triggers paid third-party API calls (Mistral Voxtral, Replicate Chatterbox, fal.ai DeepFilterNet3) and `maxDuration` is 600 seconds. An authenticated user can spam this endpoint to exhaust the company's third-party API budget. Compare with /api/v1/speech which uses consumeRateLimit. Combined with the credit-reduction TOCTOU below, the cost-abuse impact is amplified.

**Recommendation:** Apply consumeRateLimit() (or equivalent) keyed on user.id at the top of the handler before any external API call, mirroring the pattern in /api/v1/speech.

---

### Credit check / deduction race allows N free generations from a low credit balance

- **File:** `apps/web/app/api/clone-voice/route.ts`
- **Recent committers:** gianpaj <gianpa@gmail.com>, Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 1192, 1381, 1402, 1005
- **Slug:** other-credit-toctou
- **Confidence:** high

validateCredits() at line 1192 reads the current balance and asserts `currentAmount >= estimate`, but the corresponding reduceCredits call is scheduled inside `after(() => runBackgroundTasks(...))` at line 1381. `after` runs *after* the response is returned, so deduction happens out of band from the validation. If a user with 1 credit fires N parallel requests of 1 credit each, all N pass the validation (each sees currentAmount = 1), all N invoke the paid Mistral/Replicate/Fal pipelines, and only then do N parallel `decrement_user_credits` RPCs run. The SQL function uses `GREATEST(0, amount - credit_amount_var)` (see migration 20251027132100), so the balance is clamped to 0 and the user effectively gets N-1 free generations. Because there is no rate limit (see above), N is bounded only by attacker concurrency.

**Recommendation:** Atomically reserve credits before invoking the external APIs: either move reduceCredits in front of the generation step (and refund on failure), or change `decrement_user_credits` to fail when the post-update amount would be < 0 and gate the request on success. Do not rely on after() for billing-critical state changes.

---

### Authenticated cost-abuse path through enhancement / Mistral / Replicate

- **File:** `apps/web/app/api/clone-voice/route.ts`
- **Recent committers:** gianpaj <gianpa@gmail.com>, Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 1149, 1255, 1335, 1364
- **Slug:** expensive-api-abuse
- **Confidence:** high

Each call invokes paid AI services (fal-ai/deepfilternet3 audio enhancement, Mistral Voxtral, or Replicate Chatterbox). With no rate limit and the credit-deduction race above, an authenticated user can amplify cost. Free-tier users land in `cloned-audio-free` storage, but they still hit the same paid backends.

**Recommendation:** Combine the rate-limit and atomic-credit fixes; additionally consider a per-user concurrency gate to cap simultaneous in-flight clones.

---

### CRON auth bypass when CRON_SECRET env var is unset

- **File:** `apps/web/app/api/daily-stats/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 55, 58
- **Slug:** secret-in-fallback
- **Confidence:** high

The cron auth check is `authHeader !== \`Bearer ${process.env.CRON_SECRET}\``. When `process.env.CRON_SECRET` is undefined (e.g., env var missing in a deployment), JavaScript template-literal coercion produces the literal string `'Bearer undefined'`. An attacker who sends `Authorization: Bearer undefined` would pass the equality check and access the endpoint, which exposes sensitive business data: total revenue, all-time revenue, MTD revenue, active subscribers, top customer (partially-masked) usernames + dollar amounts, top usage user IDs, refund totals, etc. The endpoint is also expensive (5-min maxDuration, paginates many tables) so it doubles as a DoS vector. The same fail-open occurs if `CRON_SECRET` is set to the empty string (`Bearer ` would match). The route is documented in `apps/web/vercel.json` and `README.md`, so the path is well-known. The check should fail closed when the secret is missing/empty.

**Recommendation:** Validate the secret is present before comparing: `const cronSecret = process.env.CRON_SECRET; if (isProd && (!cronSecret || authHeader !== \`Bearer ${cronSecret}\`)) { return new NextResponse('Unauthorized', { status: 401 }); }`. Better, fail loudly at module load when the env var is missing in production.

---

### TOCTOU race on credit/freemium-limit checks allows credit double-spend

- **File:** `apps/web/app/api/generate-voice/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 127, 133, 142, 206, 542
- **Slug:** other-race-condition
- **Confidence:** high

The credit balance check at line 133 (`if (currentAmount < estimate)`) and the freemium limit check at line 206 (`isFreemiumUserOverLimit`) are read-then-act with no transactional guard. The actual deduction (`reduceCredits`) is deferred to the `after()` callback at line 542, which runs after the response is sent. A user can fire N parallel requests; each request observes the same balance, all pass the gate, all generate audio (each calling expensive Gemini/Replicate/xAI APIs), and only then are credits decremented. The underlying `decrement_user_credits` SQL function uses `GREATEST(0, amount - credit_amount_var)`, so the balance simply clamps at 0 — meaning a user with 100 credits spawning 5 parallel jobs of 80 credits each gets 5 audios for 100 credits' worth (or, on freemium, exceeds the freemium cap entirely). For freemium users this also bypasses the secondary-API-key gate that limits abuse on the free tier.

**Recommendation:** Atomize: combine the balance read with a conditional decrement in a single RPC (e.g. `try_reserve_credits(user_id, amount)` that returns whether the reservation succeeded, debiting only if `amount <= balance`). Settle the actual cost after generation by either refunding the difference or finalizing the reservation. Apply the same pattern to the freemium-over-limit check (e.g. atomically increment the free-generation counter only if under the cap). Consider adding a per-user concurrency lock or short-window rate limit so parallel abuse can't even reach the credit logic.

---

### Raw googleapis error message returned to client

- **File:** `apps/web/app/api/generate-voice/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 643, 659
- **Slug:** error-message-leak
- **Confidence:** high

Line 659 returns `error.message` verbatim to the client when the underlying error message contains the substring 'googleapis' but is not a quota (429) error. Google API errors typically embed JSON describing the model, request URL, internal status codes, and quota project information. This leaks internal API surface details to attackers. The other error branches (lines 624 and 667) go through `getErrorMessage(...)` so their messages are sanitized — only the googleapis fallback at line 659 returns raw provider output.

**Recommendation:** Replace the raw `error.message` return with a sanitized constant from `getErrorMessage` (e.g., `getErrorMessage('OTHER_GEMINI_BLOCK', 'voice-generation')`) and log the raw message server-side via `captureException`/Sentry instead of returning it to the client.

---

### Sentry captures include full Stripe event.data and customer/session metadata (PII to third party)

- **File:** `apps/web/app/api/stripe/webhook/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 46, 47, 48, 112, 113, 114, 115, 175, 220, 242, 309, 314, 351, 357, 413, 419, 484
- **Slug:** sensitive-data-in-traces
- **Confidence:** high

On line 114 the Sentry `extra` payload includes `event_data: event.data`, which for Stripe webhook events contains full customer billing addresses, customer email, partial card details (brand/last4/exp), invoice line items with descriptions, and any custom metadata. This is full PCI-adjacent and PII data being shipped to Sentry. Other captures (lines 46-49, 175-181, 215-223, 237-245, 309-317, 351-360, 413-423, 479-487) include `session.metadata` (which contains the application's own userId, packageId, credits, dollarAmount), customer_id, invoice_id, subscription_id, and event_id. Some of these are operationally useful, but sending the entire `event.data` blob is overcollection and potentially violates GDPR/privacy obligations, plus expands the blast radius if a Sentry org credential is ever leaked.

**Recommendation:** Replace `event_data: event.data` with a small allowlist of non-PII fields (e.g. event.id, event.type, customer ID, subscription ID). Apply Sentry's `beforeSend` PII scrubbing to redact any remaining email/billing fields. Avoid logging session.metadata wholesale — log only the fields needed for debugging.

---

### Subscription price-ID switch matches `undefined` if env vars are unset, awarding wrong credit tier

- **File:** `apps/web/app/api/stripe/webhook/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 253, 257, 258, 262, 267, 271, 368, 372, 373, 377, 382, 386
- **Slug:** other-undefined-env-switch-collision
- **Confidence:** medium

Lines 257-275 and 372-390 use a `switch (priceId)` whose case labels are `process.env.STRIPE_SUBSCRIPTION_5_PRICE_ID`, `STRIPE_SUBSCRIPTION_10_PRICE_ID`, `STRIPE_SUBSCRIPTION_99_PRICE_ID`. If any of these env vars is unset at runtime (e.g. only the prod set is present in a preview environment, or one is misnamed), the corresponding `case` becomes `case undefined:`. The switch then does loose equality on the actual `priceId` string from Stripe; that string is never `undefined`, so the default branch logs and returns — which is recoverable here. However, if multiple env vars share a value (e.g. a copy-paste mistake gives STRIPE_SUBSCRIPTION_5_PRICE_ID and STRIPE_SUBSCRIPTION_10_PRICE_ID the same value), the FIRST matching case wins and the user is awarded the wrong tier of credits — `starter` credits for someone who paid for `standard`, or vice versa. There is no defensive check that the three env vars are distinct and non-empty at module load. Combined with the silent-200 webhook behavior above, a misconfiguration could quietly give the wrong credit amounts to paying customers.

**Recommendation:** At module load, validate that all three subscription price-ID env vars are set and pairwise distinct (throw on startup if not). Better: replace the env-var switch with a lookup via the Stripe `lookup_key` field (e.g. `pro_monthly`, already TODO'd on line 266) or a server-side mapping table keyed off priceId, so a bad config fails loudly rather than miscrediting.

---

### Topup webhook trusts mutable Stripe session metadata for userId and credit amount

- **File:** `apps/web/app/api/stripe/webhook/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 161, 162, 164, 185, 186, 192, 193, 194, 195, 196, 197, 198
- **Slug:** other-metadata-trust
- **Confidence:** medium

Lines 161-199 destructure userId, credits, and dollarAmount from `session.metadata` and pass them straight to `insertTopupCreditTransaction`. While the metadata is set server-side in `createCheckoutSession` (apps/web/app/[lang]/actions/stripe.ts L74-83) using the authenticated `user.id` and a server-side package lookup, Stripe metadata is mutable — anyone with Stripe Dashboard write access (or a compromised Stripe API key) can edit it before the checkout completes and have the webhook credit a different user with arbitrary `credits`/`dollarAmount`. The subscription branch correctly resolves userId via `getUserIdByStripeCustomerId(customerId)` and looks up credits from the priceId (line 231-274), but the topup branch never cross-checks: it never verifies `session.amount_total` matches `dollarAmount * 100`, never resolves userId from `session.customer`, and never validates `packageId` against the price ID Stripe charged. `Number.parseInt(credits)` on line 185 also silently truncates non-numeric input (e.g. `'5000abc'` → 5000) without warning. With the live Stripe key currently exposed in .env.localx (see other finding), this trust pattern becomes directly exploitable: the leaked sk_live key gives full metadata write access on completed/pending sessions.

**Recommendation:** In the topup branch: (1) resolve userId from `session.customer` via `getUserIdByStripeCustomerId` and cross-check against metadata.userId; (2) look up credits/dollarAmount from a server-side package table keyed off the line-item priceId (`session.line_items` with expand) instead of trusting metadata; (3) verify `session.amount_total` matches the expected dollar amount * 100 before awarding credits; (4) reject the event if any cross-check fails.

---

### Platform-wide business stats endpoint protected only by NODE_ENV check

- **File:** `apps/web/app/api/wrapped/platform/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 282, 284, 286, 292
- **Slug:** missing-auth
- **Confidence:** medium

GET /api/wrapped/platform uses createAdminClient() (service role key, bypassing all RLS) to return business-sensitive aggregated stats — totalRevenue, totalRefunds, netRevenue, totalPaidUsers, totalUsers, monthly revenue/user/audio breakdowns, top voices, and platform launch data. The only authorization gate is `if (process.env.NODE_ENV === 'production') return 401`. There is no user authentication, no admin role check (the codebase has no is_admin/isAdmin pattern at all), and no shared-secret/Bearer token requirement. Compare with the similar /api/daily-stats route (line 58) which at least requires `Bearer ${CRON_SECRET}` in production. Additionally, apps/web/proxy.ts line 147 explicitly excludes `/api/` from the middleware matcher (`/((?!api/|...).*)`), so no Next.js middleware auth or session check ever runs for this route. In Vercel deployments NODE_ENV=production blocks both prod and preview environments, mitigating exploitation there in practice. However, any environment where NODE_ENV !== 'production' (local `next dev` exposed via tunnel/ngrok/cloudflared, self-hosted staging with NODE_ENV=development or NODE_ENV=test, custom CI-deployed integration environments) leaks all platform revenue, refund totals, paid-user counts, and historical month-over-month business metrics to unauthenticated callers.

**Recommendation:** Replace the NODE_ENV gate with explicit admin-user authentication: call createClient() (anon-keyed cookie session), require a logged-in user via supabase.auth.getUser(), and check that user against an explicit admin allowlist or admin role column. If this endpoint must remain dev-only, additionally require a server-side shared secret header (similar to the CRON_SECRET pattern in /api/daily-stats) so the protection does not collapse the moment NODE_ENV differs from 'production'.

---

### Unbounded full-table scans without rate limiting in unauthenticated path

- **File:** `apps/web/app/api/wrapped/platform/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 84, 117, 282, 368
- **Slug:** rate-limit-bypass
- **Confidence:** medium

fetchAllAudioFiles() and fetchAllProfiles() execute paginated scans of the audio_files and profiles tables in batches of 1000 with no upper bound on iterations. Combined with three additional aggregate queries (voices, credit_transactions x2) on every request, each call performs an expensive full-data sweep. Because the route has no authentication in non-production environments (see the missing-auth finding) and no rate limiting, an attacker who can reach the endpoint in dev/staging can trivially exhaust DB resources by issuing concurrent requests. The Cache-Control public/s-maxage=300 header would partially mitigate at the CDN tier on cache hits, but cache-busting query strings or differing Vary headers can defeat this.

**Recommendation:** Add a hard cap on pages iterated, add request-level rate limiting (per IP and per session), and gate the route behind real authentication so only trusted admins can trigger the scans.

---

### Sentry session replay captures unmasked text and media (PII leak)

- **File:** `apps/web/instrumentation-client.ts`
- **Recent committers:** gianpaj <gianpa@gmail.com>, Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 52, 53, 54, 55, 56, 50
- **Slug:** other-info-disclosure
- **Confidence:** high

The Sentry replay integration is configured with `maskAllText: false` and `blockAllMedia: false`, which disables Sentry's default privacy protections. Combined with `replaysOnErrorSampleRate: 0.1`, this means 10% of sessions where an error occurs are recorded with all text fields (including potentially passwords, billing info, personal voice scripts, prompts entered by users on sexyvoice.ai) and all media (images, videos, audio elements) sent to Sentry. While the DSN is intentionally public, the captured content is not — this leaks PII and potentially sensitive user content to a third-party service. For a voice/AI service where users may submit personal text-to-speech content, this is a meaningful privacy risk.

**Recommendation:** Set `maskAllText: true` and `blockAllMedia: true` (the Sentry defaults). Use `mask` selectors for input fields specifically if you need to record some text, and explicitly mask sensitive form fields (password, payment, prompt textareas). Review what user-submitted data flows through pages that may produce errors and ensure none of it is captured.

---

### PostHog init may receive undefined key without runtime guard

- **File:** `apps/web/instrumentation-client.ts`
- **Recent committers:** gianpaj <gianpa@gmail.com>, Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 64
- **Slug:** other-info-disclosure
- **Confidence:** low

`process.env.NEXT_PUBLIC_POSTHOG_KEY!` uses a non-null assertion. If the env var is missing in any environment, posthog.init() is called with `undefined`, which is a runtime bug rather than a security issue, but the lack of a guard means analytics could silently fail or, depending on the SDK, be initialized without the expected scoping. This is minor and noted only as a robustness concern.

**Recommendation:** Guard with `if (process.env.NEXT_PUBLIC_POSTHOG_KEY) posthog.init(...)` or fail fast at boot. Not a security vulnerability.

---

### SHA-256 truncated to 32 bits used as global cache key — collisions leak audio across users

- **File:** `apps/web/lib/audio.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 73, 78
- **Slug:** insecure-crypto
- **Confidence:** high

generateHash() (lines 70-79) computes SHA-256 of the input but slices the hex digest to only the first 8 characters (32 bits). The result is used in apps/web/app/api/generate-voice/route.ts (line 149, 158, 177) to derive a Redis cache key under a global, non-user-scoped folder (`generated-audio` or `generated-audio-free`, line 153-158). The cached value is the URL of an already-rendered audio file. When two different (text, voice, model) tuples hash to the same 8-char value, the authenticated requester for input B will receive the previously-cached audio URL for input A — even though they belong to different users in the same paid tier. With 32 bits, the birthday-paradox probability of any collision reaches ~50% near 65,000 cached entries, which is plausible for a TTS service. The same pattern applies to clone-voice/route.ts (line 971), where the cache key is composed of locale, provider, text and audio hash and then truncated to 32 bits. Impact: confidentiality breach (one user's generated speech served to another) and integrity (wrong audio for the requested text).

**Recommendation:** Do not truncate the digest used as a uniqueness key. Either return the full SHA-256 hex (or at minimum 16 bytes / 32 hex chars) so collision probability becomes cryptographically negligible, or scope the cache namespace per user (e.g. include `user.id` in the path so collisions can only collide with the same user's own content).

---

### OAuth callback marker secret falls back to API key HMAC secret

- **File:** `apps/web/lib/supabase/oauth-callback-marker.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 7, 8, 9, 10, 11, 12, 13
- **Slug:** other-secret-reuse
- **Confidence:** medium

getOauthCallbackMarkerSecret() returns process.env.OAUTH_CALLBACK_MARKER_SECRET ?? process.env.API_KEY_HMAC_SECRET. Reusing one HMAC key across two distinct cryptographic contexts (OAuth callback markers and API key HMACs) is a key-management anti-pattern. The two contexts are distinguished only by the message format (`${OAUTH_CALLBACK_COOKIE_NAME}.${expiresAt}` vs whatever format the API-key signer uses). If an attacker ever obtains an oracle that signs API-key-formatted messages, or if the API-key-signer ever signs a message that is also a valid OAuth-marker payload (e.g., a future change relaxes the format), they could forge OAuth callback markers or vice versa. Even without a current cross-protocol bug, blast radius compounds: a compromise of the API key HMAC secret automatically compromises the OAuth callback marker as well.

**Recommendation:** Require OAUTH_CALLBACK_MARKER_SECRET to be set explicitly in production (no fallback). If a single environment-wide root secret is desired, derive per-purpose subkeys via HKDF: `subkey = HKDF(rootSecret, info='oauth-callback-marker')`. Document in INFO.md that secrets must not be aliased across contexts.

---

### Admin-client Server Actions accept user-controlled IDs without ownership check

- **File:** `apps/web/lib/supabase/queries.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 104, 186, 241, 304, 316, 556, 586, 603, 636
- **Slug:** cross-tenant-id
- **Confidence:** high

getCreditsAdmin(userId), hasUserPaidAdmin(userId), saveAudioFileAdmin({userId,...}), insertUsageEvent({userId,...}), getUserIdByStripeCustomerId(customerId), getUserByStripeCustomerId(customerId) all use createAdminClient() (RLS bypass) and accept the target identifier directly from the caller. The doc-comment at L552 acknowledges the risk ('Use only in server-side API routes where the userId is resolved from a trusted API key, not a session cookie') but the file-level 'use server' directive defeats that intent — every function becomes a Server Action regardless. resolveCharacterPrompt(characterId) similarly bypasses RLS and would leak any user's private prompt text if invoked directly (the call-token API route correctly checks character.user_id !== user.id at L211, but that mitigation only protects the API-route path, not a direct Server Action invocation). Currently not in the action manifest, but exposed surface grows with any new client import.

**Recommendation:** Same fix as the umbrella issue: remove the file-level 'use server' directive and gate admin-client helpers behind authenticated API routes only. If a Server Action variant is needed, force the userId to come from `(await supabase.auth.getUser()).data.user.id`, never from a parameter.

---

### hasUserPaid Server Action — exposed via client component, takes arbitrary userId

- **File:** `apps/web/lib/supabase/queries.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 487, 488, 491, 502
- **Slug:** other-info-disclosure
- **Confidence:** high

credits-section.tsx (apps/web/components/credits-section.tsx, line 1 'use client') imports hasUserPaid from queries.ts and calls hasUserPaid(user.id) in a useEffect. Because the source file is 'use server', this import registers hasUserPaid as a publicly-callable Server Action with its action ID embedded in the client bundle. The function takes any userId and queries credit_transactions filtered by that userId. RLS on credit_transactions ('Users can view own credit transactions' USING auth.uid() = user_id) does limit the result to the caller's own rows, so a remote attacker cannot directly enumerate other users' paid status. However: (1) the function shape is wrong — it should derive userId from the session, not accept it as a parameter, removing the false sense that it's safe to pass arbitrary IDs; (2) any change to the credit_transactions RLS (e.g., adding a public-read policy for analytics) would silently turn this into a cross-tenant info disclosure; (3) it sets a precedent that other dangerous Server Actions are 'fine' to import from client code.

**Recommendation:** Rewrite as `export async function hasUserPaid(): Promise<boolean>` with no parameter, resolving userId server-side from the session. Update the one client caller in credits-section.tsx to omit the argument. This both eliminates the cross-tenant attack surface and makes the contract self-evidently safe.

---

### Sentry exception capture includes raw insert params (userId, source/voice/model details)

- **File:** `apps/web/lib/supabase/queries.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 269, 281, 520
- **Slug:** sensitive-data-in-traces
- **Confidence:** medium

Sentry.captureException at L269 and L281 includes the entire `params` object as `extra`, which contains userId, model, sourceId, requestId, apiKeyId, dollarAmount, durationSeconds, and metadata. L520 includes userId in the trace context. While userId is PII and apiKeyId is just a row identifier (not the API key itself), shipping these to a third-party error monitoring service should be intentional and reviewed against the data classification policy. If `metadata` is ever changed to contain anything more sensitive (raw text content, prompts, IPs), it would silently leak to Sentry.

**Recommendation:** Use Sentry's beforeSend or scrubbing rules to allow-list which fields appear in extras for queries.ts errors. At minimum, omit `metadata` (which is open-shape) and consider hashing userId. Verify Sentry PII redaction settings (sendDefaultPii) match the privacy posture of the product.

---

### Weak Content Security Policy: 'unsafe-inline' and 'unsafe-eval' in script-src

- **File:** `apps/web/next.config.js`
- **Recent committers:** gianpaj <gianpa@gmail.com>, Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 18, 20, 31, 84, 91
- **Slug:** other-weak-csp
- **Confidence:** medium

The CSP defined for all routes (line 20, applied via the headers() function on line 84) allows 'unsafe-inline' and 'unsafe-eval' in the script-src directive. This effectively disables CSP-based mitigation against XSS — any reflected, stored, or DOM-based XSS would still be exploitable as an inline script. Additionally, scripts are allowed from public CDNs like cdn.jsdelivr.net, which broadens the attack surface in case any XSS sink is found. The developer has acknowledged this as a TODO at line 12 ('TODO: generate CSP Header and add policy domains to on the the needed routes'), indicating awareness that a nonce-based CSP is the correct approach. Given the application handles authenticated user sessions, payment flows (Stripe), and uploaded user content (R2 audio files), the lack of effective CSP weakens defense-in-depth meaningfully.

**Recommendation:** Move to a nonce-based CSP using Next.js middleware to inject a per-request nonce, then remove 'unsafe-inline' and 'unsafe-eval' from script-src. See https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy. If 'unsafe-eval' is required by a specific dependency (e.g., for WASM), use 'wasm-unsafe-eval' instead. Consider tightening cdn.jsdelivr.net to specific package paths if its only consumer needs a known asset.

---

### CSP directive interpolates an environment variable without validation

- **File:** `apps/web/next.config.js`
- **Recent committers:** gianpaj <gianpa@gmail.com>, Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 19, 91
- **Slug:** other-csp-injection-via-env
- **Confidence:** low

The default-src directive at line 19 interpolates ${process.env.NEXT_PUBLIC_SUPABASE_URL} directly into the CSP string. If this env var is misconfigured (e.g., empty, contains whitespace, semicolons, or other CSP separators), the CSP could become malformed or a single misconfiguration could insert additional directives. Because NEXT_PUBLIC_SUPABASE_URL is bundled to the client and the value originates in env config rather than user input, exploitation requires a deployer mistake rather than an attacker action — but the failure mode is silent (browsers just accept a broken policy). This is closer to a configuration robustness concern than a directly exploitable bug.

**Recommendation:** Validate the URL at build time (assert it's a well-formed https URL with no whitespace/semicolons) before interpolating. Alternatively, use a typed constant for the Supabase project URL.

---

### Console logging integration may forward sensitive data to Sentry

- **File:** `apps/web/sentry.edge.config.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 15
- **Slug:** other-info-disclosure
- **Confidence:** medium

`Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] })` captures every `console.log`, `console.warn`, and `console.error` call from edge runtime code and sends them as logs to Sentry. If any code path in middleware or edge routes inadvertently logs sensitive data — auth tokens, user PII, request bodies, internal service URLs — it will be exfiltrated to Sentry. This is a common information-disclosure footgun. Severity depends on what is actually logged across the edge code paths, but the configuration itself is broad (captures `log` level, not just errors).

**Recommendation:** Restrict to `['error']` only, or replace with structured logging that explicitly redacts secrets. Add a Sentry `beforeSendLog` hook to scrub patterns matching tokens, emails, phone numbers, and Authorization headers. Audit existing console.* calls for leaked secrets.

---

### Vercel AI integration sends full AI inputs and outputs to Sentry

- **File:** `apps/web/sentry.server.config.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 14, 15, 16, 17
- **Slug:** other-info-disclosure
- **Confidence:** high

`Sentry.vercelAIIntegration({ recordInputs: true, recordOutputs: true })` causes every prompt and AI-generated response handled via the Vercel AI SDK on the server to be recorded and shipped to Sentry. For sexyvoice.ai, user-submitted text prompts (which may include personal scripts, names, addresses, or any text users want voiced) and the corresponding model outputs are sent verbatim to a third-party observability service. This is a privacy concern (third-party data sharing of user content) and a compliance concern under GDPR/CCPA if users are not informed, especially since `enabled: NODE_ENV === 'production'` means this runs in production only.

**Recommendation:** Set `recordInputs: false` and `recordOutputs: false` by default. If span inputs/outputs are needed for debugging, scrub them in `beforeSendSpan`/`beforeSend` hooks to strip the actual content while retaining metadata (token counts, latencies, model names). Disclose third-party AI data sharing in the privacy policy if any user content does flow to Sentry.

---

### Console logging integration may forward sensitive data to Sentry

- **File:** `apps/web/sentry.server.config.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 19
- **Slug:** other-info-disclosure
- **Confidence:** medium

`Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] })` captures every server-side `console.log`/`warn`/`error` and forwards it to Sentry. On the server in particular, accidental logging of database row contents, request bodies, JWTs, Stripe webhook payloads, API key fragments, or internal error details (file paths, env variable values) is common. With `level: 'log'` included this is a wide net. The risk is information disclosure to Sentry.

**Recommendation:** Restrict to `['error']` only, add a `beforeSendLog` scrubber that redacts tokens/PII patterns, and audit server-side console.* calls. Prefer a structured logger (pino, winston) with explicit redaction over forwarding raw console output.

---

### maskUsername leaves non-email usernames fully unmasked

- **File:** `apps/web/supabase/functions/telegram-bot/index.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 77, 78, 79, 92, 742, 792
- **Slug:** other-info-disclosure
- **Confidence:** high

maskUsername (lines 77-93) only applies the masking branch when username.includes('@'). Any profile.username that is a plain handle (e.g., 'jdoe123', 'companyXYZ') is returned verbatim. The function is used for top-customers (line 742) and top-usage-users (line 792) in the /stats output. Combined with the missing-auth issue, this means an attacker can read clear-text usernames of the platform's biggest paying customers and heaviest API users, alongside their dollar-spend and credit usage. Even when the field looks like an email, the masking is weak (3 characters of localpart + the full domain), but the no-mask path for non-emails is the more serious leak.

**Recommendation:** Apply masking unconditionally — for any username, return only a fixed-length prefix and a fixed suffix (e.g., first 3 chars + '...'). For emails, keep the existing transform but never let the unmasked variable fall through. Better: do not include personally identifiable usernames in the bot output at all; show internal user_id hashes instead.

---

### FUNCTION_SECRET compared with non-constant-time !==

- **File:** `apps/web/supabase/functions/telegram-bot/index.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 957, 958
- **Slug:** other-timing-unsafe-compare
- **Confidence:** medium

Line 957 compares the supplied 'secret' query parameter to FUNCTION_SECRET using strict inequality, which short-circuits on the first differing byte. Over the network the practical exploitability is low (jitter dominates byte-level timing), but Deno Deploy's response latency is fairly stable, and an attacker who knows the function URL (Supabase project IDs and edge-function names are often guessable/leaked) could in theory mount a remote timing oracle. Also, the response status code 405 ('Method Not Allowed') is semantically wrong — auth failure should be 401/403; 405 leaks that the request was understood but rejected for non-method reasons.

**Recommendation:** Use a constant-time comparison: convert both strings to bytes and XOR-compare, or use crypto.subtle.timingSafeEqual. Return 401 (or 404 to avoid disclosing the endpoint exists) instead of 405. Consider moving to Telegram's native 'X-Telegram-Bot-Api-Secret-Token' header (set via setWebhook?secret_token=...) instead of putting the secret in the URL where it can leak via referrer/logs.

---

## HIGH_BUG (4)

### Banlist check is non-functional: compares full email to domain list

- **File:** `apps/web/app/[lang]/(auth)/signup/signup-form.tsx`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 41
- **Slug:** other-broken-validation
- **Confidence:** high

Line 41 uses `banList.includes(email)` to determine whether to block a signup. However, `banList` (apps/web/lib/banlist.ts) contains bare domains such as 'cevipsa.com', 'mailto.plus', 'fexpost.com', etc. — not full email addresses. The user-supplied `email` value is always a complete address like 'attacker@mailto.plus', so `banList.includes(email)` will never return true for any realistic input. As a result, the entire disposable-/abusive-domain ban list is silently bypassed — every domain the developers intended to block can sign up freely. The setTimeout/error-display branch is dead code in practice. Correct logic should extract the domain (e.g., `email.toLowerCase().split('@')[1]`) and check `banList.includes(domain)`, or use `banList.some(d => email.toLowerCase().endsWith('@' + d))`.

**Recommendation:** Extract the domain from the email and compare to banList: `const domain = email.toLowerCase().split('@')[1]; if (banList.includes(domain)) { ... }`. Add a unit test covering at least one entry from banList to prevent regressions. Additionally enforce this server-side (see separate finding) since client-side checks alone are bypassable.

---

### Webhook returns 200 OK on every error, suppressing Stripe retries and silently losing paid events

- **File:** `apps/web/app/api/stripe/webhook/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 37, 38, 39, 50, 52, 117
- **Slug:** other-silent-webhook-failure
- **Confidence:** high

The outer try/catch on lines 37-50 catches ALL errors from `doEventProcessing()` — signature verification failures (line 28), credit insertion failures (lines 192, 287, 394), Redis sync failures, Supabase failures, network errors — and unconditionally returns `NextResponse.json({ received: true })` on line 52. Stripe interprets 200 OK as 'webhook delivered successfully' and will NOT retry. As a result, when the database is briefly unavailable or any downstream call throws (which the inner `processEvent` catch on line 117 explicitly re-throws), the customer's payment goes through on Stripe's side but their credit transaction is never inserted, and Stripe never retries the webhook. There is no separate reconciliation job in this file. The customer paid and never got their credits — only Sentry knows. This is a real-money correctness bug. It also masks signature verification failures: a forged request returns 200, making it harder to alert on tampering attempts.

**Recommendation:** Distinguish error categories: (a) signature verification failures should return 400 (do not let an attacker silently probe the endpoint by getting 200 back); (b) transient processing errors (DB/Redis/Stripe API) should return 500 so Stripe retries with exponential backoff; (c) only after successful processing return 200. Concretely: move signature verification outside the inner try, and in the catch on line 39 inspect the error and return `new NextResponse('Internal error', { status: 500 })` for processing failures. Keep the Sentry capture but stop swallowing the failure.

---

### Inverted isPaidUser prop breaks CreateCharacterDialog gating

- **File:** `apps/web/components/call/preset-selector.tsx`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 648
- **Slug:** other-inverted-paid-flag
- **Confidence:** high

At line 648 the component passes `isPaidUser={!isPaidUser}` to `<CreateCharacterDialog>`. The dialog uses this prop with the opposite polarity (`disabled={!isPaidUser}` on inputs at create-character-dialog.tsx L115/128/142/184; styling/tooltip at L207/212 treat `true` as paid). With the negation, a real paid user (`isPaidUser=true`) has the dialog's name/description/voice/prompt inputs disabled and sees the 'paid user only' tooltip on the save button — they cannot create a character at all. Conversely, a non-paid user sees the form fully enabled, fills it out, and only discovers it is gated when the server returns 403 at /api/characters (route.ts L91-97 via `hasUserPaid()`). This is not a security bypass — the API still enforces the paid check server-side and Zod-validates the payload — but it inverts the intended UX of a premium feature, blocks paying customers, and leads non-paying users into a dead-end submission. Note also that line 211-235's handleCreateCharacter is reachable only from the dialog, so the same inverted-flag confusion gates the whole 'add character' flow.

**Recommendation:** Remove the negation: `isPaidUser={isPaidUser}`. Optionally also gate the create-button entry point (`addCharacterButton` / `handleOpenCreateDialog` at L206-209) on `isPaidUser` so unpaid users don't reach a partially-functional form.

---

### fetchCreditTransactions paginates ALL credit transactions ever, growing without bound

- **File:** `apps/web/supabase/functions/telegram-bot/index.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 281, 304, 312, 325
- **Slug:** other-unbounded-pagination
- **Confidence:** high

fetchCreditTransactions (lines 281-326) loops .range() calls over credit_transactions filtered only by '.lt(created_at, now)' — i.e., every transaction ever made on the platform. There is no lower-bound date filter and no max-page guard. As the platform scales to many months/years of data, /stats will load tens to hundreds of thousands of rows into the function's memory on every invocation, increasing latency and risking OOM/timeout in Deno Deploy. Combined with the missing-auth issue above, an unauthenticated attacker can repeatedly trigger /stats to amplify cost and potentially DoS the function. Note that this is the only pagination loop with no bounded date window — fetchAudioFilesToday uses today, fetchProfilesInRange takes start/end, fetchUsageEvents uses sevenDaysAgo, but fetchCreditTransactions is unbounded.

**Recommendation:** Add a lower bound (e.g., '.gte(created_at, threeMonthsAgoStart.toISOString())' or whatever the longest comparison window the function actually needs). Pre-aggregate older totals via a materialized view or summary table so the bot never needs to load full history. Add a hard MAX_PAGES guard inside the while-loop to fail fast on runaway iteration.

---

## BUG (9)

### Unhandled Zod parse error returns 500 to client

- **File:** `apps/docs/src/app/api/chat/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 83, 88
- **Slug:** other-error-handling
- **Confidence:** high

Line 88 calls `requestSchema.parse(reqJson)` rather than `safeParse`. A malformed body throws an unhandled exception that Next.js translates into a generic 500. This isn't a security issue but degrades observability and UX, and may also surface validation-error details depending on framework defaults.

**Recommendation:** Use `requestSchema.safeParse(reqJson)` and return a 400 with `z.prettifyError(...)` if validation fails. Wrap the entire handler in a try/catch to convert unexpected errors into stable 500 responses.

---

### Unbounded module-level markdown render cache

- **File:** `apps/docs/src/components/markdown.tsx`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 112, 113, 114, 115, 116, 117, 118
- **Slug:** other-memory-leak
- **Confidence:** high

The module-level `cache = new Map<string, Promise<ReactNode>>()` (L112) is keyed by the full markdown text and never has entries evicted. The Renderer is consumed by the AI search chat (apps/docs/src/components/ai/search.tsx) which streams assistant responses token-by-token via useChat — every token tick produces a new, longer `text` value that triggers `cache.set(text, result)` for a brand-new entry while old promises (with full ReactNode trees attached) remain pinned. Over a long chat or many regenerations the map grows without bound, retaining every intermediate render of every message in browser memory until the page is reloaded. Additionally, if `processor.process(text)` ever rejects for some input, the rejected promise is cached forever — every subsequent render of that text will throw via `use()`, so a single bad input becomes a sticky failure.

**Recommendation:** Replace the unbounded Map with a bounded LRU (e.g., capped at a small N like 32) and skip caching rejected promises (or evict on rejection). Alternatively scope the cache per-Markdown-instance via useMemo/useRef so it cannot outlive the component tree.

---

### RSS items always emit current timestamp instead of page modified date

- **File:** `apps/docs/src/lib/rss.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 24, 25, 26
- **Slug:** other-stale-rss-date
- **Confidence:** high

Every RSS item is published with `date: new Date()` (line 25), so each fetch of the RSS feed produces fresh timestamps for all items. RSS aggregators that key off pubDate/updated will treat every item as new on every refresh, spamming subscribers and breaking dedup. The FIXME on line 24 acknowledges this — the commented line 26 (`new Date(page.data.lastModified)`) is the intended source. Not a security issue, but a real defect that affects subscribers.

**Recommendation:** Replace `date: new Date()` with `date: new Date(page.data.lastModified)` (or whichever timestamp field exists in the fumadocs page metadata). Add a fallback (e.g., file mtime or a static build date) for pages lacking that field, and ensure the type for `lastModified` is set in the docs collection schema.

---

### TOCTOU race in custom-character limit check allows exceeding the 10-character cap

- **File:** `apps/web/app/api/characters/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 220, 221, 228, 231, 254
- **Slug:** other-race-condition
- **Confidence:** high

The POST create branch reads the user's current character count via `countUserCallCharacters(user.id)` (line 220) and only afterwards inserts a new prompt + character (lines 231-278). There is no transactional or unique-key enforcement between the read and the write. A user issuing N concurrent POST requests can have all N reads return `currentCount = 9`, all pass the `currentCount >= MAX_CUSTOM_CHARACTERS` check, and all proceed to insert — resulting in more than 10 characters per user. The same race lets users bloat their stored prompt rows. This is a business-logic / quota bypass, not a direct security vulnerability, but it lets a malicious user abuse a quota that is otherwise enforced.

**Recommendation:** Enforce the limit at the database layer: add a partial unique index, a CHECK / trigger on `characters` that rejects insert when a user already has 10 non-public rows, or wrap the count-then-insert in a serializable transaction / RPC that performs both steps atomically. Relying on a JS-level read-then-write check is not safe under concurrency.

---

### Non-atomic prompt+character update can leave inconsistent state

- **File:** `apps/web/app/api/characters/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 162, 181, 360, 378
- **Slug:** other-data-integrity
- **Confidence:** medium

The POST update branch performs two sequential, non-transactional writes: it updates the prompt row (lines 162-168) and then updates the character row (lines 181-202). If the second update fails (DB error, network blip, RLS denial), the prompt content has been changed but the character's voice_id / session_config still references the old configuration, leaving a desynced view to the user. Similarly, the DELETE handler deletes the character (lines 360-365) and then the linked prompt (lines 378-394); if only one of the two succeeds, the database is left with an orphaned prompt or, in the inverse, a character pointing at a missing prompt. Not a security issue but worth noting alongside the race finding.

**Recommendation:** Wrap the multi-row mutations in a Postgres function/RPC executed inside a single transaction so that prompt + character updates (or deletes) succeed or fail together.

---

### Production catch path returns undefined when Telegram POST fails

- **File:** `apps/web/app/api/daily-stats/route.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 1316, 1322, 1323, 1324, 1328, 1332
- **Slug:** other-missing-return
- **Confidence:** high

In the final try/catch (lines 1296–1331), the production branch of the catch block calls `Sentry.captureException(error)` and `Sentry.captureCheckIn({...status: 'error'})` but does not return a `Response`. Control falls through the `finally` (which only awaits `Sentry.flush()`) and the function ends, returning `undefined`. Next.js App Router route handlers must return a `Response`; returning `undefined` results in a runtime error and a generic 500 to the cron caller. The job's status is captured in Sentry, but the HTTP response is broken. In `!isProd` the catch correctly returns `NextResponse.json(...)`.

**Recommendation:** Return a `NextResponse` after the Sentry calls in the production catch path, e.g. `return NextResponse.json({ error: 'Failed to send Telegram message' }, { status: 500 });` (or `{ ok: false }` to keep the cron schedule from retry storms, depending on intent).

---

### Hardcoded credit count in error toast diverges from MINIMUM_CREDITS_FOR_CALL constant

- **File:** `apps/web/hooks/use-agent.tsx`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 120
- **Slug:** other-ui-inconsistency
- **Confidence:** high

Line 120 hardcodes the string '2000' as the credit count in the 'insufficient_credits' toast: `toast.error(dict.notEnoughCredits.replace('__COUNT__', '2000'))`. The single source of truth is `MINIMUM_CREDITS_FOR_CALL = 999` in `apps/web/lib/supabase/constants.ts`, which is correctly used in the parallel error path in `use-connection.tsx` L117 and on the server in `app/api/call-token/route.ts` L88. Users hitting the agent-side insufficient_credits error will see a misleading credit threshold (2000) that does not match the actual server-enforced minimum (999). If the constant is ever changed, this hardcoded value will silently drift.

**Recommendation:** Import `MINIMUM_CREDITS_FOR_CALL` from `@/lib/supabase/constants` and use `MINIMUM_CREDITS_FOR_CALL.toString()` for the replacement, mirroring the pattern in `use-connection.tsx`.

---

### Unhandled JSON.parse in RPC handlers can break disconnect flow

- **File:** `apps/web/hooks/use-agent.tsx`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 86, 114, 125
- **Slug:** other-unhandled-exception
- **Confidence:** medium

Both registered RPC methods (`pg.toast` at L86 and `pg.error` at L114) call `JSON.parse(data.payload)` without a try/catch. RPC payloads are produced by the agent process; if the agent ever sends a malformed payload (e.g. a partial buffer, a non-JSON status string, or a future protocol change), the handler throws and the surrounding logic is skipped. For `pg.error` this is particularly impactful — the `disconnect()` call on L125 (which terminates the call session and refreshes credit state) will not run, leaving the client connected to a session that the agent has already errored out of.

**Recommendation:** Wrap both `JSON.parse` calls in try/catch. On parse failure, log a diagnostic and still invoke `disconnect()` for the error handler so the client recovers a clean state.

---

### Object URL revoked synchronously after click() may break downloads

- **File:** `apps/web/lib/download.ts`
- **Recent committers:** Gianfranco P <899175+gianpaj@users.noreply.github.com>
- **Lines:** 19, 22
- **Slug:** other-resource-lifecycle
- **Confidence:** medium

downloadUrl() calls `window.URL.revokeObjectURL(objectUrl)` (line 22) on the line immediately after `anchorElement.click()` (line 19). Anchor-triggered downloads run asynchronously: the browser dispatches the click and starts fetching/saving the blob from the object URL after the synchronous handler returns. Revoking the URL before the browser has read it can cause the download to be cancelled or saved as 0 bytes in some browsers (notably Safari and older Firefox versions). This is a functional bug, not a security issue, but it can silently break the user-facing 'download audio' flow.

**Recommendation:** Defer the revoke until after the browser has had a chance to start the download. A common safe pattern is `setTimeout(() => URL.revokeObjectURL(objectUrl), 0)` (or a longer delay such as 1000ms). Alternatively, attach the anchor to the DOM, click it, and revoke from the next animation frame.

---

