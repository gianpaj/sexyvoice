# Stripe Dispute Evidence Script — Design

**Date:** 2026-06-22
**Status:** Approved for planning
**Author:** brainstormed with Claude

## Purpose

When a user files a payment dispute (chargeback), we need to compile that
user's complete account data to respond to Stripe. The output serves two
audiences at once:

1. **Internal investigation** — a human-readable summary so we can decide
   whether to fight the dispute or accept it.
2. **Stripe evidence package** — a clean, factual record proving the user
   signed up, paid, and actually used the service (delivery of goods).

## Scope

- A single read-only script: `scripts/compile-dispute-evidence.mts`.
- Mirrors the conventions of the existing `scripts/refund-credits.mts`
  (TypeScript `.mts`, `dotenv`, `@supabase/supabase-js` admin client).
- **Read-only.** No DB writes, no Stripe API calls, no confirmation prompts.

### Out of scope (YAGNI)

- Live Stripe API calls (charge/dispute lookup). DB already holds the decisive
  evidence; Stripe's own charge details can be pasted in manually.
- Resolving by email / `cus_...` / charge ID. Input is `user_id` only.
- Reproducing generated content (`text_content`, audio URLs). Metadata only.
- JSON output. Console + Markdown only.

## Inputs & Setup

- `user_id` read from `process.argv[2]`; if absent, prompt for it via
  `readline/promises` (same fallback pattern as `refund-credits.mts`).
- Reuse the `createAdminClient()` + `config({ path: ['.env', '.env.local'] })`
  pattern verbatim. Requires `NEXT_PUBLIC_SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`.
- Log whether the local (`127.0.0.1`) or production Supabase URL is in use,
  matching the existing warning in `refund-credits.mts`.

## Architecture (Approach B: gather-then-render)

All data is fetched once into a single typed `DisputeReport` object, then
rendered twice — `renderConsole(report)` and `renderMarkdown(report)` — so the
two output views never drift and query logic is not duplicated.

```
main(userId)
  ├─ gatherReport(userId): DisputeReport      // all queries, no side effects
  ├─ renderConsole(report)  -> stdout
  └─ renderMarkdown(report) -> dispute-<user_id>-<YYYY-MM-DD>.md
```

If the user is not found (`profiles` row missing) the script exits with a clear
error before running the remaining queries.

## Data Gathered (all scoped `WHERE user_id = X`)

### Account — `profiles`
- `username` (the user's email), `stripe_id`, `created_at`.
- Proves identity and signup date.

### Payments — `credit_transactions` (type in `purchase`, `topup`, `refund`)
- Per row: `created_at`, `type`, `amount` (credits), `metadata.dollarAmount`,
  `reference_id` (Stripe Payment Intent ID), `subscription_id`.
- Proves what they paid and links each payment to a Stripe Payment Intent.

### Balance — `credits`
- Current `amount`. Source of truth for available credits.

### Usage summary — `usage_events`, aggregated by `source_type`
- Per `source_type` (`tts`, `voice_cloning`, `live_call`, `audio_processing`,
  `api_tts`, `api_voice_cloning`): event count, total `quantity`,
  total `credits_used`, first and last `occurred_at`.
- This append-only audit log is the strongest proof the service was used.

### Delivered artifacts (metadata only — no `text_content`, no URLs)
- `audio_files`: count, total `duration`, total `credits_used`, first/last
  `created_at`, distinct `model`s, and a paid-vs-free split (first/last paid,
  first free). Paid/free is "was the user a paying customer at generation time",
  read from `usage.userHasPaid` (falling back to the `generated-audio/` vs
  `generated-audio-free/` `storage_key` folder). It is **not** based on
  `credits_used`, which is recorded for free users too. Rows that can't be
  classified are counted as `unknown`.
- `voices`: count of voice clones the user created.
- `call_sessions`: count, total `billed_minutes`, total `duration_seconds`,
  total `credits_used`.

## Computed Totals & Reconciliation

- Total charged (gross) USD = sum of `metadata.dollarAmount` over purchase/topup
  rows.
- USD refunded = absolute sum of the negative `metadata.dollarAmount` on
  `refund` rows (cash refunds; platform-bug refunds carry no `dollarAmount`).
- Net paid USD = total charged − USD refunded. (Net is the figure that usually
  matters for a dispute.)
- Total credits purchased = sum of `amount` over purchase/topup rows.
- Total freemium credits = sum of `amount` over `freemium` rows.
- Total credits used = sum of `credits_used` over `usage_events`.
- Total refunded = sum of `amount` over `refund` rows.
- Current balance = `credits.amount`.
- Reconciliation line:
  `purchased + freemium − used − refunded ≈ balance`
  (display the computed expected balance alongside actual, and the delta).

## Output

### Console (stdout)
Sectioned, labelled text in the visual style of
`refund-credits.mts`'s `displayRefundInfo()` (header banners, aligned labels).

### Markdown file
Written to `dispute-<user_id>-<YYYY-MM-DD>.md` in the current working
directory. Same sections as the console view, formatted as Markdown headings
and tables so it can be attached directly to the Stripe dispute response.
The script prints the saved file path on completion.

## Error Handling

- Missing env vars → throw with a clear message (reuse existing checks).
- Missing `user_id` → prompt, then error if still empty.
- User not found in `profiles` → clear "user not found" error, exit 1.
- A user with no payments is still rendered (the absence of payments is itself
  evidence) — do not hard-fail like the refund script does.
- Any query error → throw with the table name in the message; top-level
  `catch` prints the error and `process.exit(1)`.

## Testing

- Run against a local Supabase instance with a seeded user that has
  payments + usage; verify console output and the generated Markdown file.
- Run against a user_id with no payments — confirm it renders rather than
  crashing.
- Run with an unknown user_id — confirm the "user not found" error path.

## Files

- New: `scripts/compile-dispute-evidence.mts`
- No changes to existing files.
