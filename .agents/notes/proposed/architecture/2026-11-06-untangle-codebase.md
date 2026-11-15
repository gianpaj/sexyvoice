# Untangle the codebase

## Problem

Each product fact lived in several places that had to change together:

- Speech model limits, labels, credit rules and provider routing were copied
  into the dashboard route, the external API, the estimate and enhance
  routes, about fifteen client components and the scripts. Retiring Gemini
  2.5/3.1 touched 67 files.
- The dashboard, external API and clone routes each kept their own credit
  reservation and refund code, provider error mapping, cache key and R2
  folder names.
- Clone provider facts were split across constants, a text-limits module,
  route literals and two clone UIs that had drifted apart.
- Calls resolved prompts in the browser and on the server, parsed the
  character row in four places, and copied the analysis queue rules into two
  scripts that applied them differently.
- The public site built metadata, JSON-LD, sitemap entries and markdown per
  page, with live hreflang, title and draft-post bugs.

An audit listed the problems per area, with the business rules to keep and
the tests that protect them. Intended behaviour stays the same; the bugs a
structural fix removed are listed in each commit body and in the PR.

## Decisions

### Speech generation

- `apps/web/lib/tts/models.ts` has one entry per active model: provider,
  stored model IDs, label, limits per tier, formats, settings, credit
  estimate, inline tags and enhance prompt. An unknown model is rejected
  instead of falling through to Replicate.
- `lib/tts/generation-input.ts` validates input once for the generator, the
  settings card and the three speech routes. `lib/tts/speech-client.ts` holds
  the dashboard request, response and error types both sides use.
- `lib/tts/synthesize.ts` runs Gemini, Grok and Replicate behind
  `synthesizeSpeech()` and throws `SpeechError(kind)`. Each route keeps one
  kind-to-response table.
- `lib/tts/cache-key.ts` builds the dashboard Redis key, equal to the R2 key.
  Settings join the hash only when the provider receives them, and Grok's
  language only when it is not `auto`, so existing cached audio stays valid.
- `lib/tts/provider-cost.ts` prices a generation by the model that ran.

### Credits, storage and the external API

- `lib/credits/reservation.ts` reserves before provider work and returns
  `settle(actual)` and `release(context, amount?)` for session and service
  callers. A failed refund is logged and captured once.
- `lib/storage/layout.ts` names the R2 folders and has no imports, so
  scripts load it too.
- `withExternalApi()` in `lib/api/handler.ts` owns key auth, rate limits,
  request IDs, logging, last-used updates and unexpected-error capture.

### Cloning and browser audio

- `lib/clone/providers.ts` holds each clone provider's model, text limits
  and reference audio bounds; `lib/clone/reference-audio.ts` holds the upload
  contract the route and both clone UIs share.
- The clone route is three use cases (`speakWithSavedVoice`, `saveVoice`,
  `cloneOnce`). Charged work runs inside `withReservedCredits()`, which
  refunds on throw. Saving a voice returns the saved row.
- `lib/ffmpeg.ts` loads the pinned FFmpeg core and holds the output formats;
  the hooks live in `hooks/`, not in the tools route folders.
- Clone and split-mode copy uses ICU arguments that next-intl fills.

### Calls

- `lib/calls/` owns the call model and language tables (default
  `grok-voice-think-fast-2.0`), the Character module, call-token metadata,
  errors, memory and voices. call-token builds the call from the saved
  character; the browser sends only per-call choices.
- `CallSessionProvider` owns the call lifecycle and maps stable error codes
  to messages; `CallSetupProvider` holds only pre-call choices.
- `lib/ai/call-analysis-queue.ts` holds the queue rules that the webhook,
  the cron and both analysis scripts follow.

### Scripts and the public site

- Scripts share `scripts/lib/cli.mts` (env order, flags, entry guard),
  `scripts/lib/ledger.mts` (the only credit write path) and import provider
  constants from the web app. See
  `.agents/notes/implemented/operations/2026-11-07-scripts-untangle.md`.
- The public site builds metadata, JSON-LD, sitemap entries and agent
  markdown from `lib/page-metadata.ts`, `lib/site.ts`,
  `lib/structured-data.ts`, `lib/content.ts`, `lib/public-routes.ts` and
  `lib/landing-content.ts`, inside one marketing shell.

## Rejected

- A shared server pipeline for `/api/generate-voice` and `/api/v1/speech`.
  Both call the same validation, reservation, synthesis and cost modules;
  what remains differs per surface (actor, bucket, cache, records, error
  envelopes), so one function would take a callback per step.
- A generic provider plugin interface for speech. Three adapters behind one
  function and an error kind cover every caller.
- Adding the Grok language to every cache key. It would cold-start the Grok
  cache.
- Renaming the clone error field `code` to the speech routes' `errorCode`.
  No client reads both envelopes, and PROVIDER_UNAVAILABLE resolution is
  already shared in `lib/errors/`.
- One markdown dispatcher behind `proxy.ts`. The `.md` routes are thin
  bindings to `lib/markdown-for-agents.ts`; the proxy change would touch
  session matching for little gain.
- Returning both the old and new save-voice response shapes. Both clients
  ship with the route.

## Not done here

- Accounts and billing (credit ledger, account summary, Stripe catalog,
  webhook, account deletion, API-key issuance, auth routing) and the daily
  stats and reports code overlap the security fixes in #688 and the daily
  stats change in #686. They follow in a separate change after #688 merges.
- The LiveKit token carries the character prompt in participant metadata,
  which the browser can decode. Closing it needs the SexyCall agent to read
  the prompt from server-side dispatch metadata or load it itself.
- Free users see the split toggle and paid speech settings dimmed but
  focusable, without the `UpgradeCrown` AGENTS.md asks for. That is a visible
  change for the owner to approve.
- Remaining copies found in review:
  - The text-limit message is written in three routes.
  - `postSpeechRoute` and `readCloneError` each parse route errors.
  - `proxy.ts` keeps its own markdown and public path lists.
  - Promo settings span `lib/promo.ts`, the banner resolver, Stripe pricing
    and checkout.
  - `robots.txt` and the docs app hardcode the site origin.
  - `/blog.md` lists posts the blog index hides (no cover image).
  - Scripts write default outputs to `scripts/` but resolve path arguments
    from `INIT_CWD`. Two scripts page with offsets of their own, and
    `analyze-call-sessions.mjs` escapes CSV without the formula guard.

## Verification

- `pnpm type-check`, lint, `pnpm check-translations`, the web Vitest suite
  and the scripts suite pass at each merge point.
- Each area added tests that pin its behaviour before the change and the
  bugs it fixed. Playwright runs in CI only.
- Read-only reviewers checked each area against the base branch; each
  confirmed finding has its own fix commit and test.
