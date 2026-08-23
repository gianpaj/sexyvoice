# Scripts

## R2 audio backup

This command copies missing R2 objects to a local drive. It never deletes R2
objects or local files, and it never overwrites an existing local path.

Back up both complete configured buckets:

```bash
pnpm backup-r2-audio -- \
  --download-dir /Volumes/ExternalHD/sexyvoice-r2-bucket
```

Limit the scan to one or more exact bucket prefixes:

```bash
pnpm backup-r2-audio -- \
  --download-dir /Volumes/ExternalHD/sexyvoice-r2-bucket \
  --source sv-audio-files/generated-audio/,sv-api-speech-audio-files
```

Use `--dry-run` to list, compare, and report without downloading. Use
`--max-download-size 20GB` to cap new transfers. The command selects missing
objects from oldest to newest and can fit a later small object when an older
object exceeds the remaining cap.

Files keep their full bucket and key under the destination. Existing files with
a simple ETag receive size and MD5 verification. Files with opaque or multipart
ETags receive size-only verification. A mismatch is reported and left untouched.

The command writes `scripts/backups/r2-audio-backup-<timestamp>.json`. It
requires `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Default
sources also require `R2_BUCKET_NAME` and `R2_SPEECH_API_BUCKET_NAME`. The R2
credentials need list and read access.

## R2 orphan audio cleanup

This command inventories free-user audio objects that are at least 45 days old
and have no matching `audio_files.storage_key`. It scans only the configured
`generated-audio-free/` and `cloned-audio-free/` locations.

Create an inventory manifest first:

```bash
pnpm cleanup-orphaned-r2-audio
```

Review the JSON under `scripts/backups/` without editing it. The action command
validates the candidate list and all derived totals, so use the manifest as
generated or reject the run. The inventory reports total objects and bytes for
each configured bucket. It also reports scanned objects, objects younger than 45
days, old objects still referenced by the database, and orphan candidates for
every allowed cleanup prefix.

R2 has no aggregate bucket-size response. Inventory paginates all object metadata
to calculate bucket totals. It does not download object contents, and objects
outside the cleanup prefixes can never become candidates.

Download one bounded batch to an external drive with:

```bash
pnpm cleanup-orphaned-r2-audio -- \
  --manifest scripts/backups/r2-orphan-candidates-<timestamp>.json \
  --download \
  --download-dir /Volumes/ExternalHD/sexyvoice-r2-bucket \
  --max-download-size 20GB
```

Add `--delete --yes` to delete only objects with verified local copies. To
delete without downloading, use `--delete --force --yes`. `--force` skips only
the local backup check. The command still validates the manifest, checks the
allowlist, refetches database keys, and compares live R2 metadata. Soft-deleted
`audio_files` rows intentionally remain references and continue to protect their
R2 objects.

The command requires:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_SPEECH_API_BUCKET_NAME`
- `KV_REST_API_URL` (deletion mode)
- `KV_REST_API_TOKEN` (deletion mode)

R2 credentials need list, read, and head access. Deletion mode also needs delete
access. The destructive loop rechecks and deletes one object at a time to keep
the gap between the final database check and deletion small. After deleting an
object from the main dashboard bucket, the command evicts the matching Redis URL
cache entry.

## TypeScript maintenance scripts

New TypeScript maintenance scripts must call `loadScriptEnv()` from
`lib/env.mts` and create privileged Supabase clients with
`createScriptAdminClient()` from `lib/supabase.mts`. Keep command-specific
warnings and confirmation policy in the command.

## Generate Gemini Speech Samples Script

Generates speech samples through the public `/api/v1/speech` endpoint and saves
them as MP3 files. The API returns WAV for `gpro`/`gpro31`, so the script
downloads the WAV and converts it to MP3 with `ffmpeg` (required).

### Quick Start

```bash
# Show help
pnpm generate-gemini-speech-samples --help

# Generate one sample by voice ID (model is inferred from the voice)
SEXYVOICE_API_KEY=xxx \
  pnpm generate-gemini-speech-samples --voiceId 85153e4b-f5b0-477a-856e-1bf05fd84165

# Generate samples for specific voices with a model + style
SEXYVOICE_API_KEY=xxx \
  pnpm generate-gemini-speech-samples --model gpro --style "calm" \
  --text "Hello there" --voices achernar,zephyr

# Run against a local/dev server
SEXYVOICE_API_BASE_URL=http://localhost:3000 SEXYVOICE_API_KEY=xxx \
  pnpm generate-gemini-speech-samples --voiceId <id>
```

> Note: you don't need `--` before the flags (e.g. `pnpm generate-gemini-speech-samples --voiceId <id>`).

### CLI Options

- `--voiceId <id>` - Voice ID from `GET /api/v1/voices`. Used **instead of** `--voice` + `--model` (the model is inferred from the voice).
- `--model <gpro|gpro31>` - Gemini model alias (used with `--voices`)
- `--voices <a,b,c>` - Comma-separated voice names (defaults to a built-in list when neither `--voices` nor `--voiceId` is given)
- `--text <text>` - Text to synthesize
- `--style <style>` - Emotion/style prompt applied by the API
- `--seed <number>` - Optional deterministic seed
- `--out <dir>` - Output directory (default: `scripts/generated-speech`)
- `--base-url <url>` - Override `SEXYVOICE_API_BASE_URL`
- `--api-key <key>` - Override `SEXYVOICE_API_KEY`
- `--keep-wav` - Keep the downloaded WAV next to each MP3
- `-h, --help` - Show help message

### Environment

- `SEXYVOICE_API_KEY` - Required Bearer API key
- `SEXYVOICE_API_BASE_URL` - Optional API host (default: `https://sexyvoice.ai`)
- `NEXT_PUBLIC_STYLE_PROMPT_VARIANT_MOAN` - Default `--style` if not passed
- `DEBUG=1` - Print full stack traces on error

`.env.local`/`.env` files in the repo root, `apps/web/`, and `scripts/` are
loaded automatically.

### Requirements

- `ffmpeg` on your `PATH` (used to convert WAV → MP3)

### Troubleshooting

- **`Could not reach Speech API at ...: ENOTFOUND` / `ECONNREFUSED`** - the host
  is wrong or the server isn't running. Check `SEXYVOICE_API_BASE_URL`.
- **`... SELF_SIGNED_CERT_IN_CHAIN`** - the server uses a self-signed
  certificate. For local/dev only, prepend `NODE_TLS_REJECT_UNAUTHORIZED=0`, or
  point Node at the cert with `NODE_EXTRA_CA_CERTS=/path/to/cert.pem`.

---

## Reset Freeloader Credits Script

Node.js/TypeScript script to reset credits to 0 for users who exploited a bug that prevented credit deduction.

### Quick Start

```bash
# Show help
pnpm reset-freeloader-credits --help

# Test with dry-run flag (no changes made)
pnpm reset-freeloader-credits --dryrun freeloaders.csv

# Test with limited records
pnpm reset-freeloader-credits --dryrun --limit 10 freeloaders.csv

# Run for real (will prompt for confirmation)
pnpm reset-freeloader-credits freeloaders.csv
```

### CLI Options

- `--dryrun` - Run in dry-run mode (no database changes)
- `-l, --limit <number>` - Limit number of records to process
- `-h, --help` - Show help message

### CSV Format

```csv
id,username,created_at,total_credits_received,total_credits_used,current_credits,usage_percentage
26fb4371-...,user@email.com,2025-11-26 16:11:36.930227+00,10000,11856,2464,118.56
```

### Features

- **Batch processing**: Fetches credit balances in batches of 10 (10x faster!)
- **CLI options**: `--dryrun`, `--limit`, `--help` flags
- Dry-run mode for safe testing
- UUID validation
- Environment detection (local vs production)
- Individual error handling per user
- Optional audit trail transaction logging
- Detailed progress reporting

### Performance

- 50 users: ~10 seconds (vs ~50 seconds sequential)
- 100 users: ~10 seconds (vs ~100 seconds sequential)
- Processes 10 users per database query

### Documentation

- [RESET_CREDITS_GUIDE.md](./RESET_CREDITS_GUIDE.md) - Complete guide with examples
- [QUICKREF.md](./QUICKREF.md) - Quick reference card
- [identify-freeloaders.sql](./identify-freeloaders.sql) - SQL to find freeloaders

---

## Backfill Free Call Script

Retroactively sets the `free_call` column on `call_sessions` by checking whether the
user had a paid transaction (`purchase` or `topup`) before the call started.

### Quick Start

```bash
# Show help
pnpm backfill-free-call --help

# Dry-run to preview changes
pnpm backfill-free-call --dryrun

# Dry-run first 50 records
pnpm backfill-free-call --dryrun --limit 50

# Apply changes (prompts for confirmation)
pnpm backfill-free-call
```

### CLI Options

- `--dryrun` - Run in dry-run mode (no database changes)
- `-l, --limit <number>` - Limit number of call sessions to process
- `-h, --help` - Show help message

### What it does

- Fetches `call_sessions` in batches of 1000
- Fetches paid credit transactions in batches of 50 users
- Sets `free_call = true` if the user had **no** paid transaction before the call
- Sets `free_call = false` if the user **had** paid before the call
- Applies updates in batches of 100

### Notes

- Requires `.env` or `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`
- Output timestamps are normalized to second precision

---

## Call Transcript Analysis Scripts

Analyze `call_sessions` transcripts with xAI Grok and write one rich row per call
to `call_session_analysis` (language, topic, engagement, sentiment, key requests,
AI issues, etc.), plus an aggregate row to `call_session_analytics`. There are two
entry points that share a single engine (`analyze-call-sessions.mjs`); the
backfill script imports its prompt, transcript extraction, analysis schema, and
persistence, so all paths write identical rows.

- **`analyze-call-sessions`** - recent / daily-cron run over calls started in the
  last N hours.
- **`backfill-call-analysis`** - one-off catch-up over **all** completed,
  unanalyzed calls (paginated), with model and duration filters.

A third path (not a script) analyzes a single call in real time: the
`POST /api/call-sessions/analyze` webhook fired when a call completes.

Only successful analyses are persisted; failures leave no row so they stay
retryable. Calls shorter than 120s and sessions that already have an analysis row
are skipped.

### Quick Start

```bash
# Show help
pnpm analyze-call-sessions --help
pnpm backfill-call-analysis --help

# Analyze calls from the last 12h (default: 24h)
pnpm analyze-call-sessions --hours=12

# Dry-run: analyze but write CSV + insights instead of the database
pnpm analyze-call-sessions --dry-run

# First real Batch API run is cheapest to validate with a tiny sample
pnpm backfill-call-analysis --limit=2 --debug

# Backfill everything (all completed, unanalyzed calls)
pnpm backfill-call-analysis
```

### Engine: xAI Batch API

Both scripts default to the [xAI Batch API](https://docs.x.ai/developers/advanced-api-usage/batch-api):
requests are uploaded as a JSONL batch, then the script block-polls until the
batch completes before writing results. It is discounted and has no per-request
rate limits, at the cost of async latency — best suited to the large backfill.
Use `--realtime` to fall back to synchronous per-call generation instead.

### CLI Options

Shared by both scripts:

- `--dry-run` - Analyze but write CSV + insights instead of the database
- `--limit=N` - Limit the number of calls to analyze
- `--realtime` (alias `--no-batch`) - Use synchronous xAI calls instead of the Batch API
- `--batch-timeout=N` - Minutes to wait for the batch to finish (default: 60)
- `--debug` - Verbose logging
- `--debug-session=UUID` - Only analyze/debug a specific session id
- `--smoke-test` - Run a tiny xAI request first to validate the model id
- `-h, --help` - Show help message

`analyze-call-sessions` only:

- `--hours=N` - Analyze calls started in the last N hours (default: 24)

`backfill-call-analysis` only:

- `--min-duration=N` - Minimum call duration in seconds (default: 120)
- `--models=a,b,c` - Only analyze these call models

### Environment

Requires `.env` or `.env.local` with:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `XAI_API_KEY`
- `XAI_SUMMARY_MODEL` (optional; defaults to `grok-4.3`)
- `XAI_API_BASE_URL` (optional; defaults to `https://api.x.ai`)

---

## Investigate Gemini TTS Errors and Credit Charges

Use this runbook when a user reports that Gemini speech requests failed,
returned defective audio, or consumed credits unexpectedly. It is the canonical
workflow for humans and coding agents. The companion agent instructions are in
`skills/investigate-gemini-tts-credit-report/SKILL.md`.

The investigation is read-only. Do not run refund scripts, database mutations,
Supabase RPCs, or any other production write while following it. A refund is a
separate action that requires explicit human approval after the evidence and
amount have been reviewed.

### Inputs and scope

Collect:

- the user's UUID;
- the start and end timestamps in UTC, including enough buffer to catch retries;
- any generation IDs, request IDs, filenames, screenshots, or exact error text;
- whether the complaint concerns an error response, the delivered audio, or
  both.

Do not infer a narrow time window from the report when one can be obtained from
the user or production records. State any assumed window in the final report.
Use a temporary directory outside the repository for logs, downloaded audio,
environment files, and generated reports. These artifacts may contain user text,
email addresses, signed URLs, or other production data.

### 1. Establish the ledger baseline

Run the read-only dispute evidence script to reconcile the complete account
ledger:

```bash
pnpm --filter @sexyvoice/scripts compile-dispute-evidence -- <user-id>
```

The expected balance is:

```text
purchased + freemium + refund adjustments - usage = expected balance
current balance - expected balance = unexplained delta
```

A zero delta means the stored credit balance agrees with the stored ledger. It
does not prove that every delivered artifact was usable. A non-zero delta is a
billing-integrity finding that must be explained before considering any refund.

The script writes a Markdown report containing production account data. Move it
to the temporary investigation directory and remove it after the investigation.
Do not paste irrelevant PII into tickets or the final report.

If the script does not expose a required detail, use the configured Supabase CLI
or database client only for scoped `SELECT`/read-only queries. Inspect the query
before execution. Never use `INSERT`, `UPDATE`, `DELETE`, DDL, RPC calls, or a
script with a write mode during an investigation.

### 2. Correlate Sentry application logs

Use Sentry as the primary source for application errors and handled Gemini
failures. Query the production project across the exact UTC window:

```bash
sentry-cli logs list \
  --org sexyvoiceai \
  --project 4509116876193872 \
  --max-rows 1000 \
  --query 'timestamp:>=<start-iso> timestamp:<=<end-iso> user.id:<user-id>'
```

Start without a level filter. The generation route records several handled
Gemini failures as `warn`, including provider unavailability, rejected input,
quota exhaustion, and responses with no audio. Add terms to `--query` to refine
the results by `level`, message, model, provider response ID, or refund context.
Useful messages include:

- `Gemini voice generation succeeded`;
- `Gemini voice generation returned no audio data`;
- `Gemini voice generation failed`;
- `Gemini provider temporarily unavailable`;
- `Gemini rejected TTS request`;
- `Failed to restore reserved credits`;
- `Failed to refund unused reserved credits`.

`--log-level` controls `sentry-cli`'s own output verbosity; it does not filter
the returned application logs. Filter application levels inside `--query`, such
as `level:error` or `level:warn`.

The `sentry-cli logs` command is beta and may change. Confirm the installed
syntax before adapting a command:

```bash
sentry-cli logs list --org sexyvoiceai --project 4509116876193872 --help
```

Use an existing authenticated CLI configuration with read access to the project;
do not put an auth token in commands, reports, or shared notes. If the first
query returns no rows, keep the same UTC window and broaden the Sentry search by
removing `user.id` and using a supplied response ID, known message, or model.
Narrow busy windows instead of assuming that the 1000-row result cap contains
every matching attempt.

Correlate attempts by `user.id`, timestamp, message, model, response ID,
artifact ID, and credit reservation or refund context. Read the current
generation route before relying on historical message names or refund behavior.

### Vercel fallback

Use Vercel only when Sentry has no matching evidence, the request may have
failed before application logging, or platform HTTP/request metadata is needed:

```bash
vercel logs --environment production --since <start-iso> --until <end-iso> --limit 1000 --json
vercel logs --environment production --since <start-iso> --until <end-iso> --query '<user-id>' --json
vercel logs --environment production --request-id <request-id> --json
```

Label Vercel-only timestamp correlations as inferences unless a request ID,
response ID, or artifact ID joins them to Sentry or database evidence.

Classify each relevant attempt as one of:

- failed before delivery and refunded;
- failed before delivery with no matching refund evidence;
- successful with a persisted delivered artifact;
- successful but the delivered artifact is disputed;
- inconclusive because the log or database evidence is incomplete.

Do not equate an error log or HTTP status with a credit loss, or a success log
with usable audio.

### 3. Inspect delivered Gemini 3.1 artifacts

Run the transcript-duration detector for the exact UTC window:

```bash
pnpm --filter @sexyvoice/scripts find-truncated-gemini31-tts -- \
  --user <user-id> \
  --since <start-iso> \
  --until <end-iso> \
  --out <temporary-directory>/truncation-candidates.json
```

The detector produces short-output candidates and review-only long-output
anomalies, not confirmed defects. Long-output anomalies must not enter refund
calculations. For each disputed or flagged artifact, compare its database
status, credits, model, transcript, duration, provider token metadata, storage
object, and the matching request log. Download audio only when necessary and
keep it in the temporary directory.

Confirm a delivered-audio defect with independent evidence such as listening to
the complete artifact, verifying that transcript content is missing, or finding
that the file is empty, corrupt, or materially shorter than its transcript can
support. One heuristic alone must not determine a refund.

### Audio energy and “silence”

`ffmpeg`'s `silencedetect` filter finds intervals below a selected amplitude
threshold for a minimum duration. It does not prove that those intervals are
inaudible. Quiet speech, room tone, compression artifacts, fades, and poor
recording levels can all fall below the threshold while remaining audible.

For example:

```bash
ffmpeg -i <audio-file> -af silencedetect=noise=-40dB:d=0.5 -f null -
```

Report this result as “approximately N seconds below -40 dBFS for at least 0.5
seconds,” not “N seconds of silence.” Always state the threshold and minimum
duration. Do not use low-energy duration by itself to classify audio as broken
or to calculate a refund.

### 4. Separate findings from hypotheses

Use these evidence classes:

- **Proven billing defect:** a debit or usage charge lacks the expected delivery
  or refund and creates an explainable credit shortfall.
- **Confirmed delivered-audio defect:** the artifact was billed and delivered,
  but independent inspection confirms missing, corrupt, or unusable output.
- **Suspected quality defect:** a heuristic or subjective review raises concern,
  but the expected content may still be audible or present.
- **No discrepancy found:** the ledger reconciles, failures were refunded, and
  no delivered artifact was independently confirmed defective.
- **Inconclusive:** required logs or artifacts are unavailable.

Keep these claims separate. In particular, a reconciled ledger rules out an
unexplained balance mismatch, but it does not rule out compensation for a
confirmed defective artifact.

### 5. Report and clean up

Return:

1. user ID and UTC investigation window;
2. data sources and exact commands used;
3. ledger equation, current balance, expected balance, and delta;
4. request counts by outcome, with request IDs when available;
5. delivered artifacts reviewed and their evidence;
6. proven findings, suspected issues, and confidence labels;
7. proposed credit adjustment, if supported, without executing it;
8. missing evidence and recommended next action.

Before finishing, remove or move to the system Trash all temporary environment
files, logs, reports, signed URLs, and downloaded user audio. State what was
cleaned up and whether anything remains recoverable in Trash.

---

## Find Truncated Gemini 3.1 Flash TTS Script

Read-only Node.js script that flags `gemini-3.1-flash-tts-preview`
`audio_files` whose measured duration is unusually short or long for the stored
transcript. Use it as one signal in the broader
[Gemini TTS investigation](#investigate-gemini-tts-errors-and-credit-charges),
not as proof of truncation or authorization for a refund.

### Why truncation can cause an overcharge

Gemini TTS credits are `ceil(totalTokenCount * 1.1 * multiplier)` where
`totalTokenCount = promptTokenCount + candidatesTokenCount` (see
`apps/web/lib/utils.ts` → `calculateCreditsFromTokens`). If the model reads a
long prompt but produces only part of the requested speech, the prompt tokens
can still contribute to the charge.

### Detection signal and limits

The transcript stored in `audio_files.text_content` (everything after the
`## TRANSCRIPT` marker, see `apps/web/lib/tts/gemini-prompt.ts`) is the text that
should have been spoken. Dividing its character count by `duration` gives
characters per second. An extreme mismatch is a useful truncation signal:

- strong candidate: `~2400 spoken chars / 7.08s ≈ 340 cps`;
- typical example: `~1050 spoken chars / 70.24s ≈ 15 cps`.

Speech rate and stored prompt structure vary. The detector does not verify the
spoken words, audio quality, low-energy passages, or whether the user considers
the artifact usable. Rows with `duration = -1` (the “couldn't measure” sentinel)
are listed as `unknown-duration` and are not judged.

The detector also reports review-only long outputs when:

```text
actual duration > expected duration * long factor
expected duration = spoken characters / normal cps
```

The default long factor is `2`. The check applies only when the transcript meets
`--min-chars`. It records the actual-to-expected duration ratio for review.
Long-output anomalies are quality signals; they do not contribute to candidate
credit exposure or refund commands.

### Quick Start

```bash
# Scan one user in an exact UTC window
pnpm --filter @sexyvoice/scripts find-truncated-gemini31-tts -- \
  --user <user-id> --since <start-iso> --until <end-iso>

# Use a stricter long-output review threshold
pnpm --filter @sexyvoice/scripts find-truncated-gemini31-tts -- \
  --user <user-id> --long-factor 2.5

# Scan the user's complete history for this model
pnpm --filter @sexyvoice/scripts find-truncated-gemini31-tts -- --user <user-id>

# Scan all users
pnpm --filter @sexyvoice/scripts find-truncated-gemini31-tts
```

### CLI Options

- `--user <uuid>` — only scan this `user_id` (default: all users)
- `--threshold <cps>` — flag when spoken characters per second exceed this
  heuristic threshold (default: `30`)
- `--min-chars <n>` — ignore clips whose transcript is shorter than this
  (default: `150`)
- `--normal-cps <cps>` — comparison rate used to estimate duration and the
  “delivered %” column (default: `15`); this is not measured transcript coverage
- `--long-factor <n>` — report output longer than expected by this factor
  (default: `2`; must be greater than `1`)
- `--active-only` — skip soft-deleted rows (`deleted_at` not null)
- `--since <date>` — only scan files created on or after this ISO date/timestamp
- `--until <date>` — only scan files created on or before this ISO date/timestamp
- `--paid-only` — only scan users with a `purchase` or `topup` transaction
- `--out <path>` — JSON report path (default: `./truncated-gemini31-tts.json`)
- `--reason <text>` — reason included in conditional refund instructions

### Output

- A candidate table with characters per second, duration, transcript length,
  estimated delivered percentage, credits, and output/input token ratio.
- A separate `REVIEW-ONLY LONG OUTPUTS` table with actual duration, expected
  duration, and the actual-to-expected ratio. These rows never enter refund
  exposure or refund commands.
- Candidate credit exposure by user. This is not a confirmed refund amount.
- Conditional refund commands retained for a human-approved follow-up. Never
  run them based only on this detector.
- A JSON report with `candidates`, `abnormallyLong`, `unknownDuration`, the
  `summary.abnormallyLong` count, time bounds, thresholds, and explicit
  heuristic/approval warnings.

Independently inspect every candidate and reconcile the account ledger before
proposing a refund. See [Refund Credits Script](#refund-credits-script) only
after a human has approved a confirmed amount.

### Requirements

- `.env` or `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and
  `SUPABASE_SECRET_KEY` (read-only usage).

---

## Refund Credits Script

Interactive Node.js/TypeScript script to process credit refunds for users.

### Features

- Calculates maximum refundable amount based on credits purchased vs. used
- Prevents refunds for freemium-only users
- Links refund to original payment intent
- Optional Stripe charge ID tracking
- Interactive prompts with confirmation
- Smart dollar amount suggestions (uses exact transaction amount when refunding full transaction)
- Validates credit balance integrity before processing
- Automatically updates the `credits` table to reflect the refunded amount

### Usage

```bash
# Run with user ID as argument
pnpm refund-credits -- <user-id>

# Or run interactively (will prompt for user ID)
pnpm refund-credits
```

### What it does

1. Fetches all credit transactions for the user
2. Calculates total credits purchased (from `purchase` and `topup` transactions)
3. Calculates total credits used (from `usage_events.credits_used`)
4. Calculates total credits already refunded (from `refund` transactions)
5. Fetches user's credit balance from `credits` table
6. **Validates that calculated credits match actual balance** (throws error if mismatch)
7. Determines maximum refundable credits (purchased - used - refunded)
8. Calculates USD refund amount based on credit rate
9. Prompts for credit amount to refund and which transaction to refund against
10. **Suggests dollar amount**: If refunding full transaction, suggests exact transaction amount; otherwise uses credit rate calculation
11. Prompts for USD amount to refund (can accept suggestion or enter custom amount)
12. Optionally records Stripe charge ID (`ch_...`)
13. Inserts negative credit transaction with `refund` type
14. Updates the `credits` table by calling `decrement_user_credits` function

### Requirements

- `.env` or `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`
- User must have `purchase` or `topup` transactions with `metadata.dollarAmount`
- Freemium-only users cannot be refunded

### Example Output

```
Processing refund for user: xxx-xxx-xxx

=== Credit Refund Calculation ===
Total Credits Purchased: 5000
Total Credits Used: 1200
Total Credits Refunded: 0
Available Credits: 3800
Total Spent: $50.00
Credit Rate: $0.0100 per credit

Max Refundable Credits: 3800
Max Refund Amount: $38.00
```

### How It Works

The script prevents duplicate refunds by tracking all previous refunds and automatically updates the user's credit balance:

**Available Credits Formula:**

```
Available Credits = (Purchased + Topup + Freemium) - Used - Refunded
```

**Maximum Refundable Credits Formula:**

```
Max Refundable = Total Purchased - Total Used - Total Already Refunded
```

**Example scenario:**

- User purchased 5000 credits for $50.00
- User used 1200 credits
- User previously received a refund of 500 credits
- Maximum refundable now: 5000 - 1200 - 500 = **3300 credits** ($33.00)

This ensures:

- Users can't be refunded more than they paid
- Users can't get refunds for credits they've already used
- Users can't receive multiple refunds for the same credits
- Data integrity is validated before processing (calculated vs actual balance)
- The `credits` table accurately reflects the user's remaining credits after refund
- Smart dollar amount suggestions prevent rounding errors on full transaction refunds

### Data Integrity Check

Before processing any refund, the script validates that the calculated available credits matches the actual balance in the `credits` table.

The calculated available credits = (purchase + topup + freemium credits) - (credits used from `usage_events`) - (previously refunded credits)

If there's a mismatch, the script will throw an error:

```
Credit mismatch detected!
  Calculated from usage_events: 3800
  Actual balance in credits table: 3750
  Please investigate data integrity before processing refund.
```

This prevents refunds when there are data inconsistencies that need to be resolved first.

### Smart Dollar Amount Suggestions

When you select a transaction to refund:

**If refunding the full transaction amount:**

```
💡 Note: Refunding full transaction amount. Suggested refund: $10.00
Enter USD amount to refund [suggested: $10.00]:
```

The script suggests the exact dollar amount from that transaction's metadata, preventing rounding errors.

**If refunding a partial amount:**

```
Calculated refund based on credit rate: $7.50
Enter USD amount to refund [suggested: $7.50]:
```

The script calculates the amount based on the credit rate (total spent / total credits).

You can press Enter to accept the suggestion, or enter a custom amount.

---

## Batch Refund Credits Script

Processes platform-bug credit refunds in bulk from a CSV of duplicate usage events. Adds credits back to affected users (no USD refund) one by one, with a single confirmation prompt before starting.

### Usage

```bash
# Dry run first to verify CSV parsing and row count
pnpm batch-refund-credits -- dupes.csv --dry-run

# Apply refunds (prompts for confirmation)
pnpm batch-refund-credits -- dupes.csv
```

### CSV Format

Export the duplicate sessions query result as CSV:

```csv
source_id,user_id,event_count,first_event_at,last_event_at,duplicate_credits,duplicate_dollars,end_reasons
38ae34f3-f7fd-48ec-88dc-0955f0722812,8c56bc8d-b16f-4de3-acf7-2f58313b209b,19,2026-05-15 16:45:07+00,2026-05-15 16:47:46+00,72000,null,"[""credit_limit""]"
```

Only `source_id`, `user_id`, and `duplicate_credits` are used. Rows with `duplicate_credits` ≤ 0 or null are skipped automatically.

### SQL to identify duplicate sessions

```sql
WITH dupes AS (
    SELECT
        source_id,
        user_id,
        COUNT(*)                                  AS event_count,
        MIN(occurred_at)                          AS first_event_at,
        MAX(occurred_at)                          AS last_event_at,
        SUM(credits_used)   - MAX(credits_used)   AS duplicate_credits,
        SUM(dollar_amount)  - MAX(dollar_amount)  AS duplicate_dollars,
        ARRAY_AGG(DISTINCT metadata ->> 'end_reason') AS end_reasons
    FROM usage_events
    WHERE source_type = 'live_call'
    GROUP BY source_id, user_id
    HAVING COUNT(*) > 1
)
SELECT * FROM dupes
ORDER BY event_count DESC, last_event_at DESC;
```

### What it does

1. Parses the CSV (handles quoted fields)
2. Shows total rows and total credits to restore, then asks for confirmation
3. For each row, inserts a `refund` credit transaction (positive amount, credits added back) and calls `increment_user_credits`
4. Continues on per-row errors — failed rows are listed in the summary
5. Exits with code 1 if any rows failed

Each refund transaction is recorded with:

- `type: 'refund'`
- `description: "Refund - Double billing (voice call <source_id_prefix>)"`
- `metadata.reason: "Double billing - voice call"`
- `metadata.sourceId`: the full source_id for traceability

### Requirements

- `.env` or `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`

---

## Compile Dispute Evidence Script

Read-only Node.js/TypeScript script (`compile-dispute-evidence.mts`) that compiles
a single user's complete account data to respond to a Stripe payment dispute
(chargeback). It makes **no** database writes and **no** Stripe API calls — it
only reads from Supabase, so it's safe to run against production.

The output serves two audiences at once: a human-readable summary for deciding
whether to contest or refund the dispute, and a Stripe-ready evidence record
proving the user signed up, paid, and actually used the service.

### Usage

```bash
# Run with user ID as argument
pnpm compile-dispute-evidence -- <user-id>

# Or run interactively (will prompt for user ID)
pnpm compile-dispute-evidence
```

The script prints the report to the console **and** writes a Markdown file to
the current directory: `dispute-<user_id>-<YYYY-MM-DD>.md`, which you can attach
to the Stripe dispute response.

### What it gathers (all scoped to the one user)

1. **Account** — `profiles`: email (`username`), Stripe customer ID
   (`stripe_id`), and signup date. Proves identity and when they joined.
2. **Payments** — `credit_transactions` of type `purchase` / `topup` / `refund`:
   date, credits, USD (`metadata.dollarAmount`), Stripe **Payment Intent**
   (`reference_id`) and **subscription** (`subscription_id`). Links each charge
   to Stripe.
3. **Usage** — `usage_events` aggregated by `source_type` (`tts`,
   `voice_cloning`, `live_call`, API…): event count, total quantity, credits
   used, and first/last `occurred_at`. This append-only audit log is the
   strongest proof the service was used.
4. **Delivered artifacts** (metadata only — no `text_content`, no URLs):
   - `audio_files`: count, total duration, models, and the **first/last paid**
     and **first free** generation dates. Paid/free reflects whether the user
     was a paying customer when the file was generated (`usage.userHasPaid`,
     with the `generated-audio/` vs `generated-audio-free/` `storage_key` folder
     as a fallback) — **not** `credits_used`, which is set for free users too.
   - `voices`: count of voice clones created.
   - `call_sessions`: count, billed minutes, duration, credits used.
5. **Totals & reconciliation** — total paid, credits purchased / freemium /
   used / refunded, current balance vs. expected balance, and the delta
   (`✅` when it reconciles).

### Deciding how much to refund

The reconciliation makes it easy to size a fair refund: refund only the **cash
value of the credits from the disputed charge that haven't been consumed yet**,
at that charge's own rate (`dollarAmount / credits`). Credits the user already
turned into delivered audio represent value delivered and shouldn't be refunded
as cash. When the usage profile looks like abuse (new account, large usage, then
chargeback), the `usage_events` + `audio_files` data is strong evidence to
**contest** the dispute instead.

### Requirements

- `.env` or `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`

---

## Check Disposable Emails Script

Node.js script (`check-disposable-emails.mjs`) that fetches the most recently
created `profiles` and checks how many `username` values (which are actually the
user's email) belong to a disposable / temporary email provider. It can
optionally reset the flagged users' credits to 0.

Two independent sources are cross-checked:

1. The `disposable-email-domains-js` npm package (the same one used by the web
   app's signup route, `apps/web/app/auth/signup/route.ts`).
2. The `denyDomains.txt` list from
   [amieiro/disposable-email-domains](https://github.com/amieiro/disposable-email-domains),
   which is shallow-cloned into `scripts/.cache` on first run and `git pull`ed
   on subsequent runs.

### Quick Start

```bash
# Check the last 1000 profiles (default) and write a summary + CSV
pnpm check-disposable-emails

# Check the last 3000 profiles (paginates past Supabase's 1000-row cap)
pnpm check-disposable-emails -- --limit 3000

# Only profiles created in the last 14 days
pnpm check-disposable-emails -- --days 14

# Preview resetting flagged users' credits to 0 (no DB changes)
pnpm check-disposable-emails -- --days 14 --reset-credits --dry-run

# Apply the reset (prompts for a typed "RESET CREDITS" confirmation)
pnpm check-disposable-emails -- --days 14 --reset-credits

# Apply without the prompt (e.g. CI)
pnpm check-disposable-emails -- --days 14 --reset-credits --yes
```

### CLI Options

- `--limit <n>` - Number of most-recent profiles to fetch (default: 1000)
- `--days <n>` - Only consider profiles created in the last `<n>` days
- `--out <dir>` - Output directory for the summary / CSV (default: cwd)
- `--no-clone` - Skip cloning/updating the amieiro repo (use cached copy)
- `--reset-credits` - Reset flagged users' credits to 0
- `--dry-run` - With `--reset-credits`, only report what would change
- `--yes` - Skip the interactive confirmation for a live reset

### Output

- `disposable-emails-summary-<timestamp>.txt` - Counts and percentages by
  source, plus the most common disposable domains (also printed to stdout)
- `disposable-emails-<timestamp>.csv` - Every flagged profile with
  `by_package` / `by_amieiro` columns (gitignored)

### Credit reset

When `--reset-credits` is passed, for each flagged user with a **positive**
balance the script resets their credits. Users are **skipped** when they:

- have ever paid — any `purchase` or `topup` `credit_transactions` row, or
- already have a balance of ≤0.

For each user that is reset, the script:

1. Sets `credits.amount` to 0
2. Inserts an audit `credit_transactions` row with:
   - `type: 'refund'` — the `credit_transaction_type` enum has no `penalty` /
     `ban` value, so this reuses `'refund'` (as
     `reset-freeloader-credits.mts` does) and records the real reason in the
     description / metadata. To change it later, edit the `RESET_TX_TYPE`
     constant (and add the enum value via a migration first).
   - `amount: -<previous balance>`
   - `description: "Credits reset to 0 — disposable email signup (<domain>)"`
   - `metadata.reason: "disposable_email"` plus `domain`, `detected_by`,
     `previous_amount`, and a `timestamp`

> ⚠️ Detection is **domain-based** and the amieiro list is broad. Spot-check the
> generated CSV before a live reset to make sure no legitimate users are caught.

### Requirements

- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` — read
  automatically from `apps/web/.env.local` (then `scripts/.env`)
- `git` (for cloning the amieiro list on first run)

---

## Sync Deny Domains Script

`sync-deny-domains.mjs` regenerates the disposable-domain list bundled into the
web app's signup route. It clones/updates
[amieiro/disposable-email-domains](https://github.com/amieiro/disposable-email-domains)
in `scripts/.cache`, normalizes its deny list (trim, lowercase, dedupe, sort)
and writes it to `apps/web/lib/disposable-email/deny-domains.json` as a minified
JSON array, which the web app imports and turns into a `Set`.

The signup route (`apps/web/app/auth/signup/route.ts`) checks this list **in
addition** to the `disposable-email-domains-js` package, which catches far more
disposable signups (~16% vs ~1.6% of recent profiles in production).

```bash
# Refresh the bundled list (run after amieiro publishes updates)
pnpm sync-deny-domains
```

The generated `deny-domains.json` is ~3 MB; it is committed (so deploys don't
need network access) and excluded from the formatter via `.biomeignore` (kept
minified). TypeScript widens the homogeneous array to `string[]`, so importing it
stays cheap to type-check.

---

## Credit Transactions (Supabase)

### 1. Download Only Paid Transactions

- Display 500 rows
- Export as SQL

<https://supabase.com/dashboard/project/xx/editor/92829?schema=public&sort=created_at%3Adesc&filter=type%3Aneq%3Afreemium>

```bash
export SUPABASE_DB_URL=postgresql://postgres:xxx@db.yyyy.supabase.co:5432/postgres
```

```bash
psql $SUPABASE_DB_URL -c "COPY (select * from public.credit_transactions order by credit_transactions.id asc nulls last) TO STDOUT WITH CSV HEADER DELIMITER ',';" > credit_transactions_rows.csv
```

### 2. Clean

```bash
python scripts/clean-transactions.py backups/credit_transactions_rows_2025-10-25T15-38.csv
Loading CSV file: backups/credit_transactions_rows_2025-10-25T15-38.csv
Successfully loaded 154 rows

First few rows:
                                     id  ...                                    metadata
0  xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  ...                                         NaN
1  xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  ...{"packageId": "standard", "dollarAmount": 5}
2  xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  ...                         {"dollarAmount": 5}
3  xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  ...{"packageId": "starter", "dollarAmount": 10}
4  xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  ...{"packageId": "starter", "dollarAmount": 10}

[5 rows x 10 columns]

Filtered from y to x transactions (only 'purchase' and 'topup' types)

Cleaned data saved to: backups/credit_transactions_rows_2025-10-25T15-38_cleaned.csv
```

### 3. Visualize

```bash
python scripts/visualize-transactions.py backups/credit_transactions_rows_2025-10-25T15-38_cleaned.csv
Loading CSV file: backups/credit_transactions_rows_2025-10-25T15-38_cleaned.csv
Successfully loaded x rows
Filtered from x to x transactions (purchase/topup only)

Creating visualizations for x credit transactions...
============================================================
Dashboard saved to: backups/credit_transactions_rows_2025-10-25T15-38_cleaned_dashboard.png
Weekly MTD comparison chart saved to: backups/credit_transactions_rows_2025-10-25T15-38_cleaned_weekly_mtd_comparison.png
Hourly heatmap saved to: backups/credit_transactions_rows_2025-10-25T15-38_cleaned_hourly_heatmap.png
Monthly trends chart saved to: backups/credit_transactions_rows_2025-10-25T15-38_cleaned_monthly_trends.png
User behavior charts saved to: backups/credit_transactions_rows_2025-10-25T15-38_cleaned_user_behavior.png
Daily patterns chart saved to: backups/credit_transactions_rows_2025-10-25T15-38_cleaned_daily_patterns.png
Transaction types chart saved to: backups/credit_transactions_rows_2025-10-25T15-38_cleaned_transaction_types.png

All visualizations created! 📊
Files saved with prefix: backups/credit_transactions_rows_2025-10-25T15-38_cleaned_
```

---

## Waveform Video Generator

Modern audio visualizer that turns any ffmpeg-compatible audio file into a
gradient waveform video with multiple style presets.

### Usage

```bash
# Neon gradient at 60fps with a custom title
python scripts/generate_waveform_video.py input.wav output.mp4 --style neon --fps 60 --title "Deep Night Session"

# Light mode preview at 720p
python scripts/generate_waveform_video.py song.mp3 preview.mp4 --style minimal --width 1280 --height 720
```

### Options

- `--style`: `neon` (default), `minimal`, `sunset`, `forest`
- `--fps`: Frames per second (default 30)
- `--width` / `--height`: Output resolution
- `--title`: Optional text rendered above the waveform
- `--preset`: ffmpeg x264 preset passed through MoviePy

## Stripe Payments Comparison and Analysis Scripts

```bash
# Set your database URL
export SUPABASE_DB_URL="postgresql://postgres:xxx@db.yyyy.supabase.co:5432/postgres"

# Run complete comparison
./compare-all-payments.sh
```

This will:

1. Fetch 500 Stripe payment intents (with pagination)
2. Export Supabase credit transactions
3. Clean both datasets
4. Detect duplicates in both systems
5. Compare and generate reports including CSV exports

## Credit Transaction Analysis Scripts

Python scripts for analyzing credit transaction data from SexyVoice.ai to extract insights about user purchasing behavior and patterns.

### Basic Analysis

```bash
python analyze-credit-transactions.py path/to/credit_transactions.csv
```

### Create Visualizations

```bash
python visualize-transactions.py path/to/credit_transactions.csv
```

### Clean Data First (Optional)

```bash
python clean-transactions.py path/to/raw_transactions.csv
python analyze-credit-transactions.py path/to/raw_transactions_cleaned.csv
```
