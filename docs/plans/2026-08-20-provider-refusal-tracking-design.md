# Provider Refusal Tracking — Design and Implementation Plan

Date: 2026-08-20
Status: proposal (no code written yet)

> Terminology: this plan uses "TTS" throughout for text-to-speech. The branch
> name (`texas-refusal-tracking-db`) is a dictation artifact of "TTS".

## Goal

Record every time a third-party provider refuses, blocks, or fails to return
audio for a speech generation or voice cloning request, in a queryable table,
so we can:

1. Measure refusal rate by provider, model, voice, language, and user tier,
   charted against successful generations in the admin dashboard.
2. Debug a specific incident from the full (redacted) provider payload instead
   of reconstructing it from Sentry breadcrumbs.
3. Build a **prompt corpus of things our providers refuse**, and replay that
   corpus against a candidate provider to decide whether it suits our use case
   before we integrate it.

Point 3 is the reason this is a database table and not just better logging.
Sentry and Axiom are event streams with retention windows and no stable join
key to voices, models, or credits — they are for alerting, not for building an
evaluation corpus we curate over months.

## What exists today

Refusals are already detected and classified — they are just not persisted.

| Surface | Where refusals surface today |
| --- | --- |
| Dashboard TTS | `apps/web/app/api/generate-voice/route.ts:696-800` (Gemini `finishReason` / `promptFeedback.blockReason`), `:1257-1275` (streaming variant, `getStreamBlockError`), `:835-870` (Grok), `:1074-1165` (outer catch: quota / transient / `INVALID_ARGUMENT`) |
| External API TTS | `apps/web/app/api/v1/speech/route.ts:639-660`, `:926-975` |
| Voice cloning | `apps/web/app/api/clone-voice/route.ts:986-1005` (Mistral guardrail), `:1081-1105` (Replicate unavailable/failed), `:1476-1490` (fal.ai reference-audio enhancement), `:1644-1694` (outer catch) |

The vocabulary already exists in `apps/web/lib/utils.ts:314-346`:
`PROHIBITED_CONTENT`, `OTHER_GEMINI_BLOCK`, `NO_AUDIO_DATA`,
`GEMINI_INPUT_TOO_LONG`, `PROVIDER_UNAVAILABLE`, `THIRD_P_QUOTA_EXCEEDED`,
`REPLICATE_ERROR`, `XAI_TTS_ERROR`. The plan reuses these codes verbatim rather
than inventing a parallel taxonomy.

Three gaps:

- **Nothing is durable.** `logger.warn('Content generation prohibited by Gemini', …)`
  writes to Sentry with a 500-char text preview. Once it ages out, the prompt
  is gone.
- **Classification is duplicated.** `generate-voice`, `v1/speech`, and the
  streaming path each re-implement the same Gemini `finishReason` →
  `ERROR_CODES` mapping. A fourth copy would be added by this feature unless it
  is extracted first (`CLAUDE.md` → Maintainability).
- **Cloning refusals are second-class.** The Mistral guardrail block is logged
  at `info` with no text, no voice, and no user tier.

## What this table does not catch

A refusal is an *error path*. The streaming corruption that forced
`GEMINI_STREAMING_ENABLED = false` (`apps/web/lib/ai.ts:82`) was the
opposite: HTTP 200, audio returned, credits charged, and the audio was bad.
Nothing throws, so nothing lands here.

That is a **silent quality failure**, and it needs its own signal — the
existing `scripts/find-truncated-gemini31-tts.mjs` is the current stopgap.
Tracking it means comparing expected duration against delivered duration on the
success path, which is a different feature with a different table. Keep it out
of scope here, but do not let the refusal dashboard imply "no refusals = healthy
output": those are different questions.

The one thing this table *can* contribute when streaming is re-enabled is the
`stream` column — if streaming also raises the `no_audio` or `other_block` rate,
that shows up here immediately, and it is a cheap early warning during rollout.

## Why a new table and not `usage_events`

`usage_events` is the immutable billing audit log: "credits were consumed, here
is why". It is append-only by trigger (`prevent_usage_events_update` /
`prevent_usage_events_delete`), it is user-readable via RLS, and it is the
source for `api_usage_daily`. Refusals are the opposite shape:

- Refusals **refund** credits; folding them into the consumption log pollutes
  every billing aggregate and the user-facing usage table.
- Refusals must store the **full prompt and full provider payload**. Putting
  user prompt text into a table that has a permissive per-user `SELECT` policy
  and a `gin` index on `metadata` is a privacy and cost regression.
- Refusals need **retention and erasure** (prune old free-tier prompt text,
  scrub on account deletion). `usage_events` is deliberately un-prunable.

So: a separate `public.generation_refusals` table, service-role write only, no
user-facing read path in phase 1.

## Schema

Migration name: `apps/web/supabase/migrations/<YYYYMMDDHHmmss>_create_generation_refusals.sql`
(UTC timestamp per `.agents/rules/create-migration.md`; lowercase SQL, header
comment, RLS mandatory).

### Enums

```sql
-- Which product surface issued the request.
create type public.generation_surface as enum (
  'dashboard_tts',                -- POST /api/generate-voice
  'dashboard_clone',              -- POST /api/clone-voice
  'api_tts',                      -- POST /api/v1/speech
  'reference_audio_enhancement'   -- fal.ai enhancement inside the clone flow
);

-- Normalized reason bucket. Coarser than error_code on purpose: error_code is
-- the exact ERROR_CODES value, category is what we group and chart by.
create type public.refusal_category as enum (
  'content_policy',        -- provider refused on content grounds  <- primary signal
  'no_audio',              -- 200 OK, finished, but no audio part returned
  'other_block',           -- non-STOP finish reason we could not classify
  'input_rejected',        -- INVALID_ARGUMENT, too long, bad reference audio
  'provider_unavailable',  -- 5xx / timeout / transient
  'quota_exceeded',        -- our quota with the provider, not the user's credits
  'provider_error'         -- everything else
);
```

`api_clone` is intentionally omitted — there is no external cloning endpoint
today (`apps/web/app/api/v1/` is `speech`, `voices`, `models`, `billing`,
`openapi`). Adding an enum value later is a one-line `alter type … add value`,
which is the precedent set by `20260302193000_add_api_usage_tracking.sql`.

### Table

```sql
create table public.generation_refusals (
  id uuid primary key default gen_random_uuid(),

  -- when the provider call returned vs when we managed to write the row
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),

  -- who
  user_id     uuid references auth.users(id) on delete set null,
  api_key_id  uuid references public.api_keys(id) on delete set null,
  is_paid_user boolean not null,

  -- what was asked for
  surface   public.generation_surface not null,
  provider  text not null,          -- 'gemini' | 'grok' | 'replicate' | 'mistral' | 'fal'
  model     text not null,          -- resolved model id actually called
  voice_id   uuid references public.voices(id) on delete set null,
  voice_name text,                  -- denormalized: survives rename/delete
  language   text,                  -- locale sent to the provider

  -- the prompt (the evaluation corpus)
  text_content text,
  text_length  integer check (text_length is null or text_length >= 0),
  text_sha256  text,                -- dedupe + group without scanning text
  style_prompt text,                -- Gemini styleVariant / director's notes

  -- generation knobs, as actually sent to the provider
  seed bigint,                      -- null when the request sent none
  stream boolean not null default false,   -- Gemini 3.1 progressive streaming path
  generation_params jsonb not null default '{}'::jsonb,  -- temperature, speed, codec, split

  -- what came back
  category   public.refusal_category not null,
  error_code text not null,         -- ERROR_CODES value, e.g. 'PROHIBITED_CONTENT'
  provider_status        integer,   -- HTTP status from the provider
  provider_finish_reason text,      -- Gemini finishReason
  provider_block_reason  text,      -- Gemini promptFeedback.blockReason
  provider_request_id    text,      -- responseId / prediction id / Mistral request id
  payload jsonb not null default '{}'::jsonb,   -- redacted { request, response, error }

  -- operational context
  request_id       text,            -- joins to usage_events.request_id and Axiom
  credits_reserved integer,
  credits_refunded integer,
  latency_ms       integer,
  attempt          smallint not null default 1,   -- 2 = pro→flash fallback attempt
  environment      text not null default 'production',
  release          text,            -- VERCEL_GIT_COMMIT_SHA

  -- cloning-only context (no audio bytes are ever stored here)
  reference_audio_sha256           text,
  reference_audio_duration_seconds numeric(10, 2),
  reference_audio_enhanced         boolean
);
```

#### Column rationale

Beyond the five you asked for (date, model, voice, payload, paid/free), each
addition earns its place against a question we already ask during incidents:

| Column | Question it answers |
| --- | --- |
| `surface` | "Is cloning refusing more than TTS?" — the whole reason this covers both routes |
| `category` + `error_code` | Separates *content refusal* (product signal) from *provider outage* (ops noise). Without this the table is 90% timeouts. |
| `text_sha256` | "How many distinct prompts, not attempts?" Retries of one blocked prompt otherwise inflate every rate. Also the join key for the eval corpus. |
| `style_prompt` | Gemini blocks are frequently caused by the style prompt, not the transcript. Storing only the transcript would make blocks unreproducible. |
| `seed` | Without it a replay is not the same request. Also the only way to tell a *deterministic* refusal from a flaky one: same `text_sha256`, different `seed`, different outcome. |
| `stream` | Its own column, not a `generation_params` key: streaming is a different code path with a known history of bad output, so refusal rate sliced by streaming on/off is a chart we will want the day it is re-enabled. |
| `generation_params` | `temperature` shifts Gemini across the refusal boundary; `speed`, `codec`, `split` change the code path. Kept as `jsonb` because the set differs per provider and none of them is a grouping dimension. |
| `attempt` | `generate-voice` retries pro→flash (`:621-682`). Counting both attempts double-counts one user-visible refusal. |
| `provider_request_id` | The only key that lets support pull the provider's own trace |
| `request_id` | Joins a refusal to its `usage_events` row and its Axiom log line |
| `credits_reserved` / `credits_refunded` | Detects the failure mode we actually get support tickets for: refused *and* charged |
| `latency_ms` | A 30s refusal and a 200ms refusal are different problems |
| `environment` / `release` | Keeps preview/dev noise out of production charts; correlates a spike with a deploy |
| `reference_audio_sha256` | Cloning refusals are often about the reference audio, not the text. The hash groups repeats without storing audio. |
| `is_paid_user` | Stored as a column, not in `payload`, because it is a primary grouping dimension |

`is_paid_user` is denormalized deliberately: `hasUserPaid()` is a point-in-time
fact, and a user who upgrades later must not retroactively rewrite history.

#### Record effective values, not requested ones

`seed` and `generation_params` must hold what was **actually sent to the
provider**, after gating and clamping — otherwise a replay reproduces a request
we never made:

- `generate-voice/route.ts:349-352` drops `seed` and `temperature` entirely for
  free users, so a free-tier row's `seed` is `null` even if the client sent one.
- `speed` is clamped by `normalizeXaiTtsSpeed()` to 0.7–1.5 before it reaches
  the provider *or* the cache key.
- The clone path does not accept these from the client at all: Replicate's seed
  (`0`), temperature (`0.8`), `cfg_weight`, and `exaggeration` are hardcoded at
  `clone-voice/route.ts:1064-1072`. Record them anyway — they are constants
  today, and the day we tune them we will want to know which rows predate the
  change. Mistral Voxtral takes none, so the column stays `{}`.

The raw request as the client sent it is already preserved in
`payload.request`, so the promoted columns can be the effective values without
losing the discrepancy.

`seed` is `bigint`, not `integer`: `generate-voice` accepts any
`Number.isSafeInteger` value, which overflows `int4`.

`stream` records the *effective* path (`shouldStream`), not `body.stream`.
While `GEMINI_STREAMING_ENABLED` is `false` the two differ: a stale client that
sends `stream: true` is rejected with a 409 before any provider call
(`generate-voice/route.ts:332-340`), so it is not a refusal and must not be
recorded as one.

The three request surfaces differ in what they accept — `/api/v1/speech` takes
`seed`, `temperature`, `speed`, `style`, and `response_format`
(`lib/api/schemas.ts:43-69`); `/api/generate-voice` takes those plus `split` and
`stream`; cloning takes none — so `generation_params` is populated per surface
rather than from one shared shape.

### Indexes

```sql
create index generation_refusals_occurred_at_idx
  on public.generation_refusals (occurred_at desc);
create index generation_refusals_provider_model_occurred_idx
  on public.generation_refusals (provider, model, occurred_at desc);
create index generation_refusals_category_occurred_idx
  on public.generation_refusals (category, occurred_at desc);
create index generation_refusals_surface_occurred_idx
  on public.generation_refusals (surface, occurred_at desc);
create index generation_refusals_user_id_idx
  on public.generation_refusals (user_id) where user_id is not null;
create index generation_refusals_text_sha256_idx
  on public.generation_refusals (text_sha256) where text_sha256 is not null;
create index generation_refusals_request_id_idx
  on public.generation_refusals (request_id) where request_id is not null;
```

No `gin` index on `payload` in phase 1. `payload` is for reading one row during
an investigation, not for filtering; every dimension worth filtering on is
promoted to a column. Add the `gin` index only if a real query needs it — it is
the most expensive index on the table and the least likely to be used.

### RLS

```sql
alter table public.generation_refusals enable row level security;

-- Deliberately NO policies for anon or authenticated: rows contain other
-- users' prompt text. Writes and reads happen through the service role
-- (createAdminClient), which bypasses RLS.
revoke all on public.generation_refusals from anon, authenticated;
```

This is stricter than `usage_events` (which has a per-user `SELECT` policy) and
that difference is intentional — call it out in the migration header comment so
a future reader does not "fix" it. If we later want a "your blocked
generations" view in the dashboard, add a narrow `select` policy over a view
that exposes `occurred_at`, `category`, and `voice_name` only, never
`text_content` or `payload`.

**Not append-only.** Unlike `usage_events`, no update/delete-prevention
triggers: we need to prune old rows for retention, scrub text on account
deletion, and re-classify rows when we learn a new provider error shape.

### Retention and erasure

Two jobs, both following the existing pg_cron precedent in
`20260517001000_schedule_delete_old_free_user_audio_files.sql`:

1. **Scrub prompt text after 180 days**, keep the row.
   `update … set text_content = null, style_prompt = null, payload = '{}'::jsonb
   where occurred_at < now() - interval '180 days'`.
   Aggregate rates stay accurate forever; the personal data does not.
2. **Delete rows after 400 days.** Enough for year-over-year comparison.

Account deletion (`apps/web/app/actions.ts:100-230`) currently soft-deletes the
auth user and retains `usage_events`. Extend it to null `user_id`,
`text_content`, `style_prompt`, and `payload` on that user's refusal rows — the
counts survive, the content does not. Add this to
`apps/web/tests/account-deletion.test.ts`.

## Payload capture and redaction

This is the part most likely to bite us, so it gets its own module and its own
tests.

Rules for `payload`:

- Shape: `{ "request": {…}, "response": {…}, "error": {…} }`. Any of the three
  may be absent.
- **Strip audio bytes before serializing.** A Gemini response can carry
  `candidates[].content.parts[].inlineData.data` (base64 audio) even on a
  partial failure; Mistral errors can echo `refAudio`. Drop any key in
  `{ data, audioData, refAudio, reference_audio, audio_base64, inlineData }`,
  replacing it with `"[stripped:<bytes>]"`.
- **Strip credentials.** Drop `authorization`, `api_key`, `apiKey`, `token`,
  `Bearer …` anywhere in the tree.
- **Cap size.** Serialize, and if over 32 KB, truncate and set
  `payload.truncated = true`. An unbounded provider payload in a `jsonb` column
  is a TOAST and cost problem.
- Never store the reference audio itself — only `reference_audio_sha256`.

`text_content` is stored in full, not previewed. Truncating it to 500 chars (as
the current Sentry logs do) makes the corpus useless for replay, and the text is
already stored in full in `audio_files.text_content` on the success path.

## Shared module

New directory `apps/web/lib/refusals/`:

| File | Responsibility |
| --- | --- |
| `types.ts` | `RefusalCategory`, `GenerationSurface`, `RecordRefusalParams` |
| `classify.ts` | `classifyGeminiOutcome({ finishReason, blockReason, hasAudio })`, `classifyGoogleApiError(err)`, `classifyMistralError(err)`, `classifyReplicateError(err)` → `{ category, errorCode }` |
| `redact.ts` | `buildRefusalPayload({ request, response, error })` — the rules above |
| `record.ts` | `recordGenerationRefusal(params)` — fire-and-forget insert via `createAdminClient()` |

`recordGenerationRefusal` follows the `insertUsageEvent` contract in
`apps/web/lib/supabase/queries.ts:339-388`: never throws, reports failures to
Sentry, returns the row id or `null`. Tracking must never turn a 422 refusal
into a 500.

`classify.ts` is the payoff: the Gemini `finishReason` → `ERROR_CODES` mapping
currently exists in three places (`generate-voice` non-streaming, `generate-voice`
streaming, `v1/speech`). Extracting it first means this feature adds one call
site per route instead of a fourth copy of the logic, and the three routes stop
drifting apart.

## Call sites

Each is a one-line `void recordGenerationRefusal({…})` next to the existing
`logger.warn` / `throw`, inside the branch that already knows the classification.

| File | Location | Notes |
| --- | --- | --- |
| `generate-voice/route.ts` | `:708` no-audio/prohibited block | pass `attempt` (pro vs flash fallback) |
| `generate-voice/route.ts` | `:844` Grok failure | `provider_status` from the xAI response |
| `generate-voice/route.ts` | `:1256` `getStreamBlockError` | streaming path; guarded by `GEMINI_STREAMING_ENABLED` |
| `generate-voice/route.ts` | `:1097-1160` Google API error branches | quota / transient / `INVALID_ARGUMENT` |
| `v1/speech/route.ts` | `:649` Gemini block | include `api_key_id`, `surface: 'api_tts'` |
| `v1/speech/route.ts` | `:926` outer catch | |
| `clone-voice/route.ts` | `:989` Mistral guardrail | the highest-value cloning signal; currently logged at `info` with no text |
| `clone-voice/route.ts` | `:1083`, `:1099` Replicate | |
| `clone-voice/route.ts` | `:1476` fal enhancement failure | `surface: 'reference_audio_enhancement'` |

Two rules for the call sites:

- Record **after** the refund path runs, so `credits_refunded` is accurate.
- Read `seed`/`temperature`/`speed` from the variables that were passed to the
  provider call, not from `body.*`.
- Do not `await` in a way that can delay the error response — use the same
  detached pattern as the existing PostHog/Axiom calls, with a `.catch()`.

## Phased implementation

**Phase 1 — capture (the deliverable).**
1. Extract `lib/refusals/classify.ts` from the three existing copies; keep
   behavior identical, add unit tests.
2. Write the migration. **Do not apply it** — hand the SQL over for the user to
   run (`CLAUDE.md`: agents must not apply migrations).
3. Regenerate types: `pnpm --filter @sexyvoice/web generate-supabase-types:local`.
4. Add `lib/refusals/{types,redact,record}.ts`.
5. Wire the nine call sites.
6. Tests: vitest for `redact` (audio stripping, credential stripping, 32 KB cap)
   and `classify`; pgTAP `apps/web/supabase/tests/generation_refusals_security.test.sql`
   asserting `anon`/`authenticated` cannot select or insert.
7. `pnpm fixall`, `pnpm type-check`, `pnpm test`, `pnpm test:db`.

**Phase 2 — visibility.** Ship the `get_generation_outcomes_daily` RPC below,
plus `scripts/analyze-refusals.mts` for ad-hoc digging (the workspace already
has `analyze-call-sessions.mjs` and `analyze-credit-transactions.py` as
precedent). The admin dashboard is a separate deliverable in the
`sexyvoice-admin` repo — see the next section.

**Phase 3 — the evaluation loop (the actual goal).**
- `scripts/export-refusal-corpus.mts`: dedupe by `text_sha256`, filter to
  `category = 'content_policy'`, emit JSONL of
  `{ text, style_prompt, language, voice_name, seed, generation_params,
  refused_by: [provider/model], count }` — carrying the knobs through is what
  makes the replay a like-for-like test rather than a fresh roll of the dice.
- `scripts/evaluate-provider-refusals.mts`: replay that JSONL against a
  candidate provider and report pass/refuse per prompt, alongside a control set
  of prompts that currently succeed (to catch a provider that accepts
  everything but sounds bad — refusal rate alone is not quality).
  `scripts/generate-gemini-speech-samples.mjs` and
  `generate-xai-speech-samples.mjs` are the shape to copy.
- Keep evaluation results in files, not the database, until we run enough
  evaluations that a `provider_evaluations` table earns itself.

## Admin dashboard (`gianpaj/sexyvoice-admin`)

Separate deliverable, separate repo, handed to another agent. This section is
the contract it builds against.

### Can we get refusals vs successes from the current schema?

Yes — but the denominator needs care, and two dimensions are missing today.

**Use `usage_events` as the denominator, never `audio_files`.** Both hold one
row per successful generation, but `audio_files` rows for free accounts are
**hard-deleted after 45 days** by the `delete-old-free-user-audio-files` pg_cron
job. Refusals are retained for 400 days. Charting one against the other means
successes evaporate from the older half of every window while refusals remain —
the refusal rate would appear to spike the further back you look, entirely as an
artifact. `usage_events` is never deleted, which is exactly the property a
denominator needs.

**Cache hits are correctly excluded from both sides.** `generate-voice` returns
at the Redis hit (`route.ts:510-540`) before any credit reservation, so it
writes no `usage_events` row and no `audio_files` row — only a PostHog event. So
`usage_events` counts *provider attempts*, not user requests, which is the
denominator we want. Worth stating on the dashboard, because totals will not
match PostHog and someone will ask why.

**The dimensions mostly line up already.** The success path writes rich
metadata:

| Dimension | `tts` (`generate-voice:1014-1026`) | `api_tts` (`v1/speech:874-885`) | `generation_refusals` |
| --- | --- | --- | --- |
| model | `metadata.model` + `model` column | both | column |
| provider | `metadata.provider` | **missing** (only `isGeminiVoice`/`isGrokVoice`) | column |
| voice | `metadata.voiceId` / `voiceName` | same | columns |
| paid tier | `metadata.userHasPaid` | same | column |
| seed | **missing** | `metadata.seed` | column |
| language | **missing** (join `voices` via `voiceId`) | **missing** | column |
| stream | **missing** | n/a | column |

So the core chart — refusals vs successes over time, sliced by
surface/provider/model/voice/tier — works today. Slicing by **language** or
**stream** does not, on the success side only.

**Close the gaps in phase 2** by adding `provider`, `language`, and `stream` to
the `tts` metadata and `provider` + `language` to `api_tts`. That is a
three-line change to two `insertUsageEvent` calls, it is additive to a `jsonb`
column, and it costs nothing. Do it in the same PR as the refusal table so both
sides speak the same vocabulary from day one. Rows written before that change
simply have `null` for those keys, which the dashboard should render as
"unknown" rather than dropping.

### Surface ↔ source_type mapping

The join key. Fix it once, here, so both repos agree:

| `generation_refusals.surface` | `usage_events.source_type` |
| --- | --- |
| `dashboard_tts` | `tts` |
| `api_tts` | `api_tts` |
| `dashboard_clone` | `voice_cloning` |
| `reference_audio_enhancement` | `audio_processing` |

### Ship an RPC, not raw table access

Two things in the admin repo make a pre-aggregated RPC the right interface
rather than letting the dashboard query the tables directly:

1. **It aggregates in JavaScript.** `src/lib/data/voices.ts` pulls every row via
   `fetchAllPages` and counts into a `Map`. That is fine for a voice list; for
   refusal-vs-success over 90 days it means paging two large tables into Node on
   every render.
2. **It excludes internal users from a hardcoded list.**
   `src/lib/data/internal-users.ts` resolves `INTERNAL_USERNAMES` →
   `profiles.id` at query time and applies `NOT IN`. A plain view cannot know
   that list, so the exclusion has to be a parameter.

Hence a set-returning function, following the `get_usage_summary` precedent in
`20260127063200_create_usage_summary_rpc.sql` and the conventions in
`.agents/rules/create-db-functions.md` (`security invoker`, `set search_path =
''`, fully qualified names):

```sql
create or replace function public.get_generation_outcomes_daily(
  p_start_date       timestamptz default null,
  p_end_date         timestamptz default null,
  p_exclude_user_ids uuid[] default '{}'
)
returns table (
  day          date,
  surface      text,
  provider     text,
  model        text,
  is_paid_user boolean,
  outcome      text,     -- 'success' | 'refusal'
  category     text,     -- refusal_category, null for successes
  attempts     bigint,
  distinct_users   bigint,
  distinct_prompts bigint   -- null for successes; count(distinct text_sha256)
)
```

The body is a `union all` of two grouped selects — successes from
`usage_events` (mapping `source_type` → `surface` per the table above, reading
`provider`/`userHasPaid` out of `metadata`), refusals from
`generation_refusals`. Both filter `user_id <> all(p_exclude_user_ids)` *before*
grouping.

Grant `execute` to `service_role` only. The admin app uses `createAdminClient()`
(per its own `CLAUDE.md`), which bypasses RLS — so the refusal table needing
service-role access is not an obstacle for this dashboard, and the raw prompt
text still never reaches a browser.

One RPC call replaces two paged table scans, and the dashboard never has to
learn the `metadata` jsonb shape — which is the point, because that shape will
keep drifting.

### Spec for the dashboard agent

Follow the repo's existing page conventions exactly:

- Route: `src/app/admin/(dashboard)/refusals/page.tsx`, components under
  `refusals/components/` — mirroring `voices/`, `api/`, `calls/`.
- Data: `src/lib/data/refusals.ts`, `createAdminClient()`, calling
  `get_generation_outcomes_daily` via `supabase.rpc(...)`. Pass the internal IDs
  from `fetchInternalUserIds()` as `p_exclude_user_ids` — do not re-implement
  the exclusion.
- Charts: recharts through the existing `src/components/ui/chart.tsx` wrapper,
  matching `voice-charts.tsx` in structure.
- Types: derive from the generated `Database` types, and extend
  `src/lib/usage-source-types.ts` rather than hand-writing string unions — its
  `AGENTS.md` calls this out specifically.
- Run `pnpm fixall`, `pnpm typecheck`, `pnpm test` (note: `typecheck`, not
  `type-check` — the admin repo's script name differs from the main repo's).

Charts worth building, in priority order:

1. **Stacked area, refusals vs successes per day** — the headline. Absolute
   counts, not just rate, so a refusal spike caused by a traffic spike is
   distinguishable from a real regression.
2. **Refusal rate by provider × model** — the provider comparison that motivates
   the whole feature.
3. **Refusal rate by category, stacked** — separates `content_policy` from
   `provider_unavailable`. If this is not on the page, the first outage will be
   read as a content-policy crisis.
4. **Free vs paid refusal rate** — different prompts, likely different rates.
5. **Top refused voices and languages** — a table, not a chart. `voice_name` and
   `language` come straight off the refusal rows.
6. **Distinct prompts vs total refusals** — the gap is retry behaviour. A large
   gap means users are hammering a blocked prompt, which is a UX problem, not a
   provider problem.

A drill-down from any chart into individual refusal rows (prompt text, payload,
seed, provider ids) is the highest-value follow-up, but note it needs a
deliberate decision about showing user prompt text in the admin UI. Ship the
aggregates first.

## Documentation

- `docs/devops.md` — the two pg_cron jobs, retention windows, where the corpus
  export lives.
- `AGENTS.md` / `CLAUDE.md` — one line under "Voice and Call Flows": refusals
  are recorded via `lib/refusals/record.ts`; add new provider classifications to
  `classify.ts`, not inline in routes.
- `scripts/README.md` — the two new scripts.
- `gianpaj/sexyvoice-admin` — its own `AGENTS.md` table of database tables needs
  a `generation_refusals` row and a note that the refusals page reads the
  `get_generation_outcomes_daily` RPC rather than the tables directly.
- No new environment variables, so no `.env.example` / README changes.
- Docs-only commits get `[skip deploy]`; the code commits do not.

## Decisions to confirm

1. **Scope of `category`.** This plan records *all* provider failures, with
   `content_policy` as one category, because "refused" and "timed out" are hard
   to separate at the call site and a table that only has refusals cannot give a
   rate. If you only want content refusals, we drop the other five categories
   and the table gets much smaller and much less useful for ops.
2. **Retention.** 180-day text scrub / 400-day row delete are proposals. A
   longer text window makes a better corpus; a shorter one is a smaller privacy
   surface.
3. **Free-tier prompt text.** Storing the full prompt of a *free* user who was
   blocked is the case most worth a second look. The alternative is to store
   `text_sha256` only for free users and full text for paid — at the cost of a
   corpus biased toward paid usage.
4. **Terms of service.** Storing prompt text for model/provider evaluation
   should be covered by the privacy policy before phase 3 ships.
