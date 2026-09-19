# SexyVoice.ai Repository Threat Model

## Overview

SexyVoice.ai is a Next.js 16, React 19, TypeScript, Supabase, and Tailwind monorepo for an AI voice generation product. The primary deployed product is `apps/web`, with `apps/docs` serving public API/product documentation and `scripts` containing operational one-off tasks. The web application exposes localized App Router pages, authenticated dashboard workflows, public/free audio tools, cookie/session-authenticated API routes, API-key authenticated `/api/v1/*` routes, Stripe payment flows, LiveKit call-token issuance, Supabase-backed account and credit state, Cloudflare R2 audio storage, Redis caching/rate limiting, and several external AI-provider integrations.

The highest-value assets are Supabase authentication sessions, user identifiers and profile data, credit balances and billing history, Stripe checkout and webhook integrity, API keys and their HMAC hashes, generated and uploaded audio files, voice-cloning input audio, predefined character/call prompts, provider credentials, service-role Supabase access, LiveKit room tokens, R2 object keys and URLs, external API request logs, and operational secrets such as `CRON_SECRET`, `API_KEY_HMAC_SECRET`, Stripe secrets, provider API keys, R2 credentials, and Supabase service-role keys.

Security review should prioritize production runtime code in `apps/web/app/api`, `apps/web/app/[lang]`, `apps/web/lib`, `apps/web/hooks`, `apps/web/components`, `apps/web/supabase/migrations`, and shared operational scripts that touch customer, credit, billing, storage, or provider systems. Documentation, tests, generated content, and local-only tooling are lower priority unless they affect generated API docs, deployment behavior, secret handling, or privileged operational workflows.

## Threat Model, Trust Boundaries, and Assumptions

Primary actors:

- Anonymous web users can reach public pages, public utility tools, auth callbacks, and unauthenticated API routes.
- Authenticated dashboard users are trusted only for their own account, credits, audio history, API keys, profile settings, character settings, and voice-generation requests.
- External API users authenticate with bearer API keys and must be scoped to the user resolved from the validated key, not to any browser session.
- Stripe, Supabase, LiveKit, Replicate, fal.ai, Mistral, Google Generative AI, xAI, Upstash Redis, Cloudflare R2, Vercel Edge Config, Sentry, PostHog, Axiom, Telegram, and Inngest are external systems across network trust boundaries.
- Operators and developers control environment variables, migrations, deployment settings, internal scripts, and admin/service-role operations. Compromise or misuse here has high blast radius and should not be treated as normal attacker control.

Important trust boundaries:

- Browser to Next.js server: all route handlers and server actions must treat request bodies, query strings, form data, cookies, headers, filenames, audio blobs, locale parameters, and route params as attacker-controlled.
- Session-authenticated dashboard routes to Supabase: session-scoped clients should preserve RLS and user ownership. Service-role/admin clients must never be used to expose or mutate other users' data without explicit ownership checks.
- `/api/v1/*` bearer API boundary: raw API keys are attacker-controlled until validated with `validateApiKey()`. External API data access must use the resolved API-key user id and must consistently rate-limit, update last-used state, and preserve structured errors.
- Payment boundary: Stripe checkout/session creation is initiated by authenticated users, but credit grants, subscription state, and transaction records should derive from verified Stripe webhook events using `STRIPE_WEBHOOK_SECRET`.
- Storage boundary: generated audio and clone input objects cross from user-controlled text/audio into Cloudflare R2. Object keys, MIME types, filenames, public URLs, deletion jobs, and bucket selection must preserve tenant separation and retention assumptions.
- AI-provider boundary: prompt text, clone reference audio, selected model/voice, output audio, and provider errors cross to third-party services. The app must enforce text length, model compatibility, cost/credit checks, and privacy expectations before sending data.
- LiveKit boundary: call-token issuance crosses from authenticated dashboard settings to LiveKit access tokens and AI agent dispatch. Prompt templates and predefined character prompts should be resolved server-side and never exposed unnecessarily to clients.
- Redis/cache boundary: cache keys and rate-limit keys should include enough user/request context to avoid cross-user cache hits, credit bypasses, or key collisions.
- Documentation/OpenAPI boundary: generated docs and OpenAPI content must match the actual API contract so third-party users do not rely on insecure or stale behavior.

Attacker-controlled inputs include HTTP headers, cookies, bearer tokens, JSON request bodies, multipart upload data, audio file content and metadata, user-entered text and prompt fields, route params, locale slugs, markdown/document route params, API-key names, character names/descriptions, CLI-login tokens, and any callback/webhook body that has not yet been cryptographically verified. Operator-controlled inputs include environment variables, Edge Config values, scheduled cron invocations, production secrets, and manual script arguments. Developer-controlled inputs include migrations, generated Supabase types, content files, docs generation, package dependencies, and build configuration.

Core invariants:

- Users can only view or mutate their own account state, credits, generated audio metadata, API keys, characters, usage events, and billing-derived data unless a route is intentionally public.
- Service-role Supabase operations must be paired with explicit user ownership checks and should not trust client-supplied user ids.
- Credits and payment state cannot be granted, deducted, bypassed, or double-spent through replay, stale cache hits, race conditions, webhook spoofing, or external API misuse.
- External API keys are never stored or compared raw in production; API-key authenticated routes must resolve and use the key owner consistently.
- Generated audio storage must use the intended bucket and public URL for the surface: dashboard flows use dashboard storage, while external API speech uses the dedicated external API R2 bucket.
- Clone-input audio must be validated for type, size, and duration, then retained and cleaned up according to the product's privacy expectations.
- Predefined prompts, service-role credentials, provider secrets, API key hashes, payment details, and generated private audio access must not leak to untrusted clients or logs.
- Public endpoints and utility routes should be rate-limited or bounded where expensive model calls, audio processing, database scans, or storage writes are reachable.

## Attack Surface, Mitigations, and Attacker Stories

High-impact runtime surfaces include:

- Session-authenticated API routes under `apps/web/app/api`, especially `generate-voice`, `clone-voice`, `call-token`, `api-keys`, `characters`, `billing/usage`, `usage-events`, Stripe transactions, CLI-login sessions, and account/profile actions.
- API-key authenticated external API routes under `apps/web/app/api/v1`, especially `/speech`, `/voices`, `/models`, and `/billing`, with shared auth, schemas, rate-limit, logger, pricing, and OpenAPI helpers under `apps/web/lib/api`.
- Stripe webhook handling under `apps/web/app/api/stripe/webhook/route.ts` and Stripe checkout server actions under `apps/web/app/[lang]/actions/stripe.ts`.
- Supabase client/admin boundaries in `apps/web/lib/supabase`, typed query helpers, RLS-dependent dashboard pages, migrations, and functions.
- R2 upload/delete helpers in `apps/web/lib/storage`, dashboard and external API bucket selection, clone-input upload paths, and cleanup jobs.
- LiveKit token issuance and AI agent dispatch configuration in `apps/web/app/api/call-token/route.ts` and related call hooks/components.
- Audio parsing/conversion/transcription flows, including browser-side FFmpeg/transformers usage and server-side audio metadata validation where present.
- Cron and operational routes such as daily stats, Telegram notifications, Inngest jobs, and scripts under `scripts` that use privileged credentials.
- Next.js configuration, CSP headers, PostHog rewrites, Sentry tunnel, middleware/proxy, and auth callback handling.

Existing mitigations visible from repository guidance and architecture include Supabase Auth and SSR session clients, RLS-oriented query patterns, `createAdminClient()` separation for service-role operations, Zod schemas for external API inputs and OpenAPI generation, `validateApiKey()`/HMAC key handling, Upstash rate limiting for external API keys and some public flows, structured external API error responses, dedicated R2 bucket variables for external API speech, Stripe webhook signature verification, CSP and `X-Content-Type-Options` headers in Next config, clone-file type/size/duration constraints, localized route handling through `next-intl`, and tests for API and shared behavior.

Realistic attacker stories:

- An authenticated user tries to read, modify, delete, or bill against another user's credits, audio files, characters, API keys, usage events, billing records, or LiveKit call settings by tampering with ids or route params.
- An external API user or leaked bearer token tries to bypass rate limits, generate audio without paying credits, access another user's billing state, or exploit inconsistent admin-query ownership checks.
- An anonymous attacker targets public or unauthenticated routes for SSRF, resource exhaustion, markdown/content exposure, auth callback confusion, CLI-login token replay, or cron endpoint abuse.
- A malicious or careless user uploads malformed, oversized, mislabeled, or privacy-sensitive audio to voice cloning and attempts to bypass validation, poison cache entries, keep clone input indefinitely, or make generated outputs public unexpectedly.
- An attacker attempts payment or credit manipulation through forged Stripe webhook payloads, checkout metadata tampering, replayed sessions, race conditions, or trusting client-side price/quantity information.
- A user-supplied prompt, text, voice name, locale, or character field crosses into external AI providers, logs, or LiveKit agent instructions and causes prompt leakage, unsafe prompt reuse, provider-side privacy exposure, or denial of wallet through excessive work.
- An attacker exploits CSP gaps, unsafe inline/eval allowances, rich text/editor rendering, blog/content rendering, MDX/markdown exports, or third-party script integrations to run script in authenticated browser contexts.

Out-of-scope or lower-severity stories include attacks that require direct control over production environment variables, Supabase service-role keys, Stripe account secrets, Vercel project settings, or deployment pipelines unless the repository exposes a path for lower-privileged actors to influence those values. Developer-only scripts and local tooling are lower priority unless they are run in production, write production data, mishandle secrets, or are reachable through CI/deployment automation.

## Severity Calibration (Critical, High, Medium, Low)

Critical findings are vulnerabilities that let an unauthenticated or low-privileged attacker compromise service-role secrets or provider credentials, forge Stripe webhooks or grant credits/subscriptions at scale, execute arbitrary server-side code in production, bypass authentication across tenants, access or mutate arbitrary users' private/generated audio and account state through an admin-client flaw, mint LiveKit tokens for arbitrary rooms/users, or cause high-cost AI-provider spend without authentication or credit checks.

High findings include authenticated cross-tenant access to another user's credits, audio history, API keys, generated files, characters, or billing data; external API key validation bypass or raw-key disclosure; missing or ineffective rate limits on expensive generation surfaces; R2 bucket/key confusion that exposes private clone input or external API audio unexpectedly; Stripe checkout metadata tampering that grants incorrect credits after a legitimate payment; prompt or predefined instruction leakage where it reveals protected product logic or sensitive user data; and stored XSS in dashboard or shared content surfaces that reaches authenticated users.

Medium findings include bounded credit/account inconsistencies that require a user's own account, reflected XSS or content injection with limited reach, weak validation of non-sensitive public utility inputs, cache-key collisions that cause minor cross-request confusion without data exposure, incomplete structured error handling that leaks limited operational details, missing security headers that increase exploitability but do not create a direct bug alone, and documentation/OpenAPI mismatches that could cause insecure client usage without breaking server-side controls.

Low findings include defense-in-depth gaps in local development configuration, minor information leaks in non-sensitive public metadata, weak logging hygiene for non-secret values, insufficient validation in developer-only scripts, stale docs that do not affect runtime behavior, and robustness issues that produce handled errors without data exposure, privilege escalation, billing impact, or meaningful availability loss.
