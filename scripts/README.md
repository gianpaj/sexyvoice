# Scripts

Operator commands for credits, R2 audio, voice samples, clone demos and
production investigations. Deployment configuration lives in
[docs/devops.md](../docs/devops.md).

## Running a command

Run every command from the repository root:

```bash
pnpm <command> [options]
pnpm <command> --help
```

`--help` lists a command's options and defaults; this file does not repeat
them. Relative paths in arguments resolve from the directory you run `pnpm`
in.

Commands read env files from fixed locations, highest precedence first:
`scripts/.env.local`, `apps/web/.env.local`, the repository root `.env.local`,
`scripts/.env`, `apps/web/.env`, then the root `.env`. The first file that
sets a variable wins, and a variable set
in the shell beats every file. A command that takes `--env-file` reads only the
files you name, and a missing file is an error.

## Safety rules

- A command that uses Supabase prints its target before the first request, for
  example `Supabase: abc.supabase.co (PRODUCTION, read-write)`. Check it before
  you confirm a write.
- `compile-dispute-evidence`, `find-truncated-gemini31-tts`,
  `audit-unexplained-credits` and the dry-run flags of the credit commands use
  a read-only client. It rejects every request except `GET` and `HEAD` before
  the request leaves the process.
- Every credit change goes through `adjustCredits` in `lib/ledger.mts`, which
  writes one `refund` ledger row and moves the balance by the same amount. When
  the database rejects the balance change, it deletes the row again.
- Penalty resets never touch a paid user, meaning anyone with a purchase or
  top-up row.
- R2 uploads never overwrite a different object. Backups and the orphan cleanup
  never overwrite a local file.
- Coding agents follow the database rules in
  [AGENTS.md](../AGENTS.md#mandatory-rules) and run no writing command against
  production without explicit approval.

## Writing a command

- Parse arguments, load env files and start `main` with `lib/cli.mts`
  (`parseCliArgs`, `loadScriptEnv`, `inputPath`, `runScript`). `runScript`
  prints the error and sets exit code 1 when `main` throws.
- Create Supabase clients with `createScriptAdminClient()` from
  `lib/supabase.mts`. Pass `readOnly: true` when the command only reads.
- Read and change credits through `lib/ledger.mts`. Use `lib/files.mts`,
  `lib/csv.mts`, `lib/ffmpeg.mts` and `lib/r2-keys.mts` for reports, CSV,
  ffmpeg and R2 keys.
- `tsx` loads web `.ts` modules as CommonJS, so a `tsx` command imports them
  with a default import and destructures. A command run by plain `node` uses
  named imports. A web module that a script imports may only use relative
  imports with `.ts` extensions.
- Add the command to `scripts/package.json`, and alias it in the root
  `package.json` as `pnpm --filter @sexyvoice/scripts <command>`.

## Credits

### Refund credits

Refunds one user interactively, either as cash back against a purchase or as
a credits-only refund for a platform bug. The command asks for every amount and
for confirmation before it writes. `--help` states the refund caps.

```bash
pnpm refund-credits <user-id>
```

A user who never paid cash cannot get a cash refund. A cash refund removes the
credits and stores a negative `metadata.dollarAmount`, with `reference_id` set
to the purchase's payment intent. A platform-bug refund adds credits and stores
the reason you type.

### Batch refund credits

Adds credits back for double-billed voice calls, one CSV row per call. Each
refund row carries an idempotency key built from the call's `source_id`, so a
rerun skips calls this command already refunded. Run it with `--dry-run` first.

```bash
pnpm batch-refund-credits dupes.csv
```

Export the CSV from this query:

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

### Reset freeloader credits

Resets to 0 the balances of users who exploited a bug that skipped credit
deductions. It reads the CSV that `identify-freeloaders.sql` exports, skips
paid users and small balances, and asks you to type `RESET CREDITS` before a
live run.

```bash
pnpm reset-freeloader-credits freeloaders.csv --dryrun
```

### Check disposable emails

Counts recent signups whose email domain is disposable, by the
`disposable-email-domains-js` package and by the amieiro list bundled for
signup. With `--reset-credits` it also resets the flagged users' credits to 0.
Run `pnpm sync-deny-domains` first if you need a fresh list.

```bash
pnpm check-disposable-emails --days 14 --reset-credits --dry-run
```

It writes a summary and a CSV of flagged profiles to the working directory, or
to `--out`. A live reset asks you to type `RESET CREDITS` unless you pass
`--yes`. Detection goes by domain and the amieiro list is broad, so spot-check
the CSV before a live reset. The weekly `sync-deny-domains` workflow runs this
command as a dry run and posts the result in its PR.

### Audit unexplained credits

Finds recently changed balances that the ledger and recorded usage do not
explain. It only reads, and it writes an owner-only CSV report when it flags
anyone.

```bash
pnpm audit-unexplained-credits --days 3
```

The console uses short `snake_case` labels; the CSV uses the matching
`camelCase` names plus timestamps and record counts.

| Console column     | CSV column               | Meaning                                                              |
| ------------------ | ------------------------ | -------------------------------------------------------------------- |
| `classification`   | `classification`         | How the unexplained credits appear to have been used.                |
| `net_ledger`       | `netLedgerCredits`       | Sum of `credit_transactions.amount` through the audit cutoff.        |
| `recorded_usage`   | `recordedUsage`          | Sum of `usage_events.credits_used` through the cutoff.               |
| `expected`         | `expectedBalance`        | Balance the ledger supports after recorded usage.                    |
| `current`          | `currentBalance`         | The whole `credits.amount`; this is not the suspicious amount.       |
| `unexplained`      | `unexplainedGrants`      | Credits in the gap between the current and expected balances.        |
| `minimum_used`     | `minimumUnexplainedUsed` | Lower bound for unexplained credits already spent.                   |
| `remaining`        | `unexplainedRemaining`   | Unexplained credits that may still be in the balance.                |
| `history_coverage` | `historyCoverage`        | `partial_pre_usage_events` when the account predates `usage_events`. |

`unspent` means every unexplained credit may still be in the balance, `used`
means all of them were spent, and `used_and_remaining` means some of each.
`invalid_balance` marks a negative balance. `reconcileCreditAccount` in
`audit-unexplained-credits.mts` computes these columns, and `expectedBalance` in
`lib/ledger.mts` is the ledger equation.

The report lists accounting anomalies. It is not proof of abuse, so never use
it for automatic enforcement. Historical under-debits and missing opening
balances also leave a gap. Accounts that predate `usage_events` miss old usage,
which can understate their gap, and the audit cannot see forged matching ledger
rows.

### Compile dispute evidence

Collects one user's account, payments, usage, delivered audio, voice clones,
calls and ledger reconciliation for a Stripe dispute. It only reads. It prints
the report and writes `dispute-<user-id>-<date>.md` to the working directory.

```bash
pnpm compile-dispute-evidence <user-id>
```

The Markdown file holds production account data. Keep it out of the
repository and delete it when the dispute closes.

- Payments are the `purchase`, `topup` and `refund` rows with their dollar
  amounts, payment intents and subscriptions.
- Usage comes from `usage_events`, grouped by source; it is the strongest proof
  that the service was used.
- Audio counts as paid or free by whether the user had paid when it was
  generated (`usage.userHasPaid`), with the storage folder as a fallback. It is
  not about `credits_used`, which free users also have.
- The reconciliation shows the expected balance and its delta from the actual
  balance. A delta of 0 means the ledger explains the balance.

To size a refund, return the cash value of the credits from the disputed charge
that the user has not spent. `refund-credits` suggests the user's average
credit rate for a partial refund and the purchase's own price for a whole one.
When the usage looks like abuse, such as a new account with heavy usage
followed by a chargeback, the usage and audio evidence supports contesting the
dispute.

### Backfill free calls

Sets `call_sessions.free_call` to true when the user had no purchase or top-up
before the call started (`paidBefore` in `lib/ledger.mts`), and to false
otherwise. It asks for confirmation before it updates rows.

```bash
pnpm backfill-free-call --dryrun
```

## R2 audio

### Upload files to R2

Uploads any files to a bucket under a prefix, keeping their basenames. This
uploads all prepared clone demo MP3s:

```bash
pnpm upload-r2-files --bucket sv-audio-files \
  --prefix demo-clones/voxtral-3 --content-type audio/mpeg \
  --public-url https://files.sexyvoice.ai \
  --env-file apps/web/.env.local \
  apps/web/public/demo-clones/voxtral-3/*.mp3
```

The command uploads by default; `--dry-run` validates the files and prints the
destinations without credentials or network requests. Uploads need
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_ENDPOINT`.

The generic uploader and the speech-sample uploader share their conditional
write and verification. They refuse to overwrite a different object and check
the R2 size, content type and SHA-256 metadata. `--public-url` also checks the
hash and content type of the public download; omit it for private buckets. A
failed file prints an error and makes the exit status nonzero while the other
files continue. Public verification does not test browser CORS, so check
reference fetching from production and preview origins before you switch
runtime URLs. Uploading changes no runtime URL, local file or database row.

### R2 audio backup

Copies missing R2 objects to a local drive. It never deletes R2 objects or
local files, and it never overwrites a local path.

```bash
pnpm backup-r2-audio --download-dir /Volumes/ExternalHD/sexyvoice-r2-bucket
```

Mount the external volume and create the download directory first. The command
checks it before it lists R2, so a missing volume cannot turn into a directory
on the internal disk. A dry run neither needs nor creates the directory.
`--source` limits the scan to exact bucket prefixes, and `--max-download-size`
caps new transfers, which the command fills oldest first.

The package command sets `NODE_ENV=production` before it loads Ink. React's
development reconciler keeps performance measurements for every Ink render and
can exhaust the V8 heap during long transfers.

Files keep their full bucket and key under the destination. An existing file
with a simple ETag gets a size and MD5 check, and one with an opaque or
multipart ETag gets a size check only. The command reports a mismatch and
leaves the file alone.
The command writes `scripts/backups/r2-audio-backup-<timestamp>.json`. It needs
`R2_ENDPOINT`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` with list and read
access; the default sources also need `R2_BUCKET_NAME` and
`R2_SPEECH_API_BUCKET_NAME`.

### R2 orphan audio cleanup

Finds free-user audio objects that are old enough for cleanup and that no
`audio_files.storage_key` references, in the free-user folders only.
`lib/r2-orphan-audio-cleanup.mts` holds the minimum age and the folder
allowlist. Create an inventory manifest first:

```bash
pnpm cleanup-orphaned-r2-audio
```

Review the JSON under `scripts/backups/` without editing it. The action command
validates the candidates and every derived total, so use the manifest as
generated or reject the run. The inventory reports each bucket's totals and,
per cleanup folder, the scanned objects, the objects too young, the old objects
still referenced and the orphan candidates. R2 has no bucket-size response, so
the inventory pages through all object metadata without downloading contents.

Then download one bounded batch to an external drive:

```bash
pnpm cleanup-orphaned-r2-audio \
  --manifest scripts/backups/r2-orphan-candidates-<timestamp>.json \
  --download \
  --download-dir /Volumes/ExternalHD/sexyvoice-r2-bucket \
  --max-download-size 20GB
```

The download directory must already exist, as for the backup. Add
`--delete --yes` to delete only objects with checksum-verified local copies. To
delete without downloading, pass `--delete --force --yes`; `--force` skips the
backup check only. The command still validates the manifest, checks the
allowlist, refetches the database keys and compares live R2 metadata before
each single-object delete. Soft-deleted `audio_files` rows count as references
and keep protecting their objects. After deleting from the main dashboard
bucket, the command evicts the matching Redis cache entry.

The command needs `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` and
`R2_SPEECH_API_BUCKET_NAME`, plus `KV_REST_API_URL` and `KV_REST_API_TOKEN` to
delete. The R2 credentials need list, read and head access, and delete access
for deletion.

## Voice samples

### Gemini 3.8 voice samples

`gemini-38-catalog.json` lists the Gemini 3.8 voices to add. It also lists the
existing non-Gemini identities as unsupported, because selecting their names in
Gemini cannot recreate them. Mexican provider IDs use `es-419` with the
`Mexico Spanish` accent, while catalog labels use `es-MX`. The catalog excludes
Catalan.

```bash
pnpm generate-gemini-speech-samples \
  --catalog scripts/gemini-38-catalog.json \
  --out scripts/generated-speech/gemini-38 \
  --env-file apps/web/.env.local
```

Add `--dry-run` to validate prompts and output paths without calling Google.
The generator needs `GOOGLE_GENERATIVE_AI_API_KEY` and ffmpeg. It sends the
transcript as text and the delivery direction as speech metadata through the
web app's helpers, with the exact regional provider ID. Each output file is
`<provider-name>-gpro38-preview.mp3`, matching the live catalog's root-level,
model-suffixed previews.

`manifest.json` records catalog IDs, transcripts, directions, file hashes,
token usage and provider costs. Open `listen.html` in a browser and listen to
the batch before you upload. `--keep-wav` keeps the intermediate audio. A rerun
verifies and skips completed MP3s; for changed prompts, use a new output
directory. Move any untracked partial output aside before retrying a failed
conversion.

### Upload reviewed samples

The uploader needs a directory with `manifest.json`. `--folder .` is the bucket
root; the live catalog uses `sv-audio-files` and `https://files.sexyvoice.ai`.

```bash
pnpm upload-speech-samples \
  --path scripts/generated-speech/gemini-38 --bucket sv-audio-files \
  --folder . --public-url https://files.sexyvoice.ai \
  --env-file apps/web/.env.local --upload
```

Without `--upload` the command is a dry run with no network requests.
`--voices <uuid,uuid>` selects reviewed catalog entries. Uploads use the shared
R2 client, refuse overwrites, and verify an identical existing object on a
retry. `uploads.json` records the batch's verified URLs and failures, checked
against R2 metadata and the SHA-256 of the public MP3. Final SQL needs the
whole catalog, so rerun with all reviewed IDs after partial batches; identical
objects are only verified again.

### Prepare additive SQL

The checked-in `add-gemini-38-voices.sql` holds the verified catalog with
`is_public = false`. It keeps existing rows and skips existing `gpro38`
identities on reruns. `--draft` prepares guarded SQL before upload. After the
upload, prepare executable SQL:

```bash
pnpm prepare-gemini-voice-sql \
  --catalog scripts/gemini-38-catalog.json \
  --samples scripts/generated-speech/gemini-38 \
  --out scripts/generated-speech/gemini-38/add-voices.sql
```

The command checks the catalog, the generation manifest, the local file hashes
and the verified upload records, and writes SQL without running it. Friendly
labels come from `apps/web/lib/voice-names.ts`; database names, API
identifiers, provider requests, filenames and cache keys keep the provider IDs.
Deploy `gpro38` support before generating with these voices. Database writes
follow the [database rules](../AGENTS.md#mandatory-rules) unless the user
explicitly authorizes an exception.

### Custom Gemini 3.8 voices

Voices designed or replicated in AI Studio have IDs such as
`voice_1n3ne2q96iaf` (Vivienne, created 2026-11-04). Unlike shared library IDs,
a stored voice belongs to the Google project that created it, so
`GOOGLE_GENERATIVE_AI_API_KEY` must come from that project; any other key gets
`404 NOT_FOUND`. Google caps stored voices at 200 per project and gives them a
[1-year TTL](https://aistudio.google.com/docs/voice-design). Recreate the voice
before it expires; a new ID needs a new `voices` row and display label.

Generate a custom voice sample from its own one-voice catalog and output
directory, so the main batch stays unchanged.

### xAI voice samples

Generates MP3 samples of xAI voices with the web app's xAI request
(`apps/web/lib/tts/xai.ts`), so the samples sound like the product. It needs
`XAI_API_KEY`.

```bash
pnpm generate-xai-speech-samples --voices yis75yfp --language es-MX
```

## Clone demos

### Generate prepared cloning demos

The voices, delivery prompts and supported voice and take pairs live in
`apps/web/data/clone-demo-config.ts`. Supply authorized, complete reference
recordings as `kat-reference.mp3` and `heike-reference.mp3` in a local
directory. Use the intended source version; the bundled reference can differ
from the R2 objects `clone-demos/kat-reference.mp3` and
`clone-demos/heike-reference.mp3`.

Frontend-only language slots and translated draft prompts live separately in
`apps/web/data/clone-demo-languages.ts`. They do not enable generation or imply
that recordings exist. To publish a language, configure its actual voice with
its own authorized reference and matching prompt in `clone-demo-config.ts`,
then publish the matching MP3s and manifest entries together. Do not attach a
draft prompt to an existing recording with different text.

```bash
pnpm generate-clone-demos \
  --reference-dir /absolute/path/references \
  --output-dir /absolute/path/new-demo-run
```

`--voice` and `--take` generate one take. `--help` lists the voices and takes,
and the command rejects a pair the config does not support. Copy only the
intended result MP3 and its matching request and asset metadata into
`apps/web/data/clone-demo-assets.json`. Replace a reference preview and its
metadata only when you mean to publish a reference change, and leave unrelated
recordings alone.

The command needs `MISTRAL_API_KEY`, `ffmpeg` and `ffprobe`. It keeps the
complete reference and converts a separate mono 24 kHz WAV copy for Mistral.
Raw generated WAVs stay in the run directory. Previews and results are 128 kbps
MP3s normalized by `lib/clone-demo-audio.mts`, which holds the loudness target,
the true-peak limit and the encode attempts. It never overwrites a source or an
existing output, and a failure publishes no MP3.

`generation.json` records input hashes per request, prompts, full-response
latency, estimated provider cost, output durations and MP3 hashes. The command
saves request metadata before it encodes the MP3, so recover a failed encode
from the retained WAV instead of paying for another generation. An unrecorded latency is
`null`, not an estimate.

Review the clips and confirm that each take speaks the complete prompt before
publishing assets under `apps/web/public/demo-clones/voxtral-3/`. Merge the
matching report entries into `apps/web/data/clone-demo-assets.json`, keeping
per-request source hashes when a voice's reference changes. The web tests check
asset hashes and prompt consistency. The command uploads no file and changes no
database row.

### Generate waveform peaks

Analyze the final, normalized MP3s before uploading those exact files to R2:

```bash
pnpm generate-audio-waveforms
```

With no files, the command processes every asset in
`apps/web/data/clone-demo-assets.json` from
`apps/web/public/demo-clones/voxtral-3/`. It keeps the other manifest fields
and adds `waveform: { sourceSha256, peaks }` to each asset. `peaks` holds one
array of signed, normalized amplitudes per audio channel, rounded to four
decimal places. This is plain JSON, not a WaveSurfer binary format.

For future speaker takes, pass the final local files, for example
`pnpm generate-audio-waveforms path/to/italian-anxious.mp3`. Explicit files add
or update entries keyed by filename, and the command rejects duplicate
filenames from different directories. Adding waveform data does not publish a voice or
connect a pending language to an existing reference.

FFmpeg and FFprobe are needed only for files that need extraction. The command
skips entries whose audio hash, waveform source hash and peak count match, so a
changed recording or resolution triggers regeneration. It replaces the manifest
atomically after every selected file succeeds and checks for concurrent edits
before writing. Audio files are read-only, and the command makes no provider
call or upload.

The demo reads these peaks from the bundled manifest, so take and reference
changes reuse the waveform renderer instead of decoding MP3s to draw them. The
audio element still loads each recording for playback. A missing or stale
waveform hash fails with a command to regenerate the data.

### Audio cleanup comparison

`compare-audio-cleanup` runs local audio through `fal-ai/deepfilternet3`, the
model behind clone reference enhancement, and
[`veed/clean-audio`](https://fal.ai/models/veed/clean-audio), then writes a
side-by-side `listen.html`. It needs `FAL_KEY`, `ffmpeg` and `ffprobe`.

```bash
pnpm compare-audio-cleanup --env-file apps/web/.env.local ~/samples/cloning
```

Clone enhancement stays on DeepFilterNet3. On 2026-09-30, 44 cloning samples
showed no consistent quality gain from VEED, which sounded worse on some clips
and took nearly twice as long per clip.

## Accounts

### Restore account billing

Account deletion blocks checkout during cleanup and releases the block when the
request finishes, including handled failures. Retained Auth users can sign in
and check out again. A terminated request or a failed Redis release can leave
checkout and further deletion requests blocked; both return
`accountBillingBlocked` with support guidance. A competing reservation returns
`accountBillingBusy` and asks the user to wait. Deletion returns these errors
without reporting Sentry exceptions. The coordination rules live in
[Architecture](../ARCHITECTURE.md#identity-and-session-handling).

Support can clear the block so the user can keep the account or finish deleting
it:

1. Identify the exact Supabase Auth user ID and verify that their profile
   exists. Review the failed deletion and any partial cleanup with the user;
   restoring billing does not restore deleted files or characters.
2. Confirm in request logs that every deletion request for this user has
   finished or terminated. Ask the user to stop retrying deletion during
   recovery. An expired Redis reservation alone does not prove the cleanup
   stopped.
3. Run the command below with the intended environment's
   `apps/web/.env.local`, which holds the Upstash variables. Replace the
   placeholder with the verified UUID.

```bash
pnpm restore-account-billing \
  --env-file apps/web/.env.local \
  --user-id 'verified-auth-user-uuid' \
  --cleanup-stopped
```

The command validates the UUID, requires `--cleanup-stopped` after the log
checks above, and calls the shared `restoreAccountBilling` helper.

The helper refuses recovery while a billing or deletion reservation exists. It
deletes only `stripe:account:{userId}:deleted` and also handles legacy blocks
whose value is `1`. Do not force-delete an operation key to get past this
check. If it reports `accountBillingBusy`, wait for the request to finish and
its reservation to clear, then repeat the log checks before retrying.

Have the user retry checkout or deletion, and record the recovery in the
support ticket. Blocked and busy checkout attempts use the Sentry event types
`checkout_billing_blocked` and `checkout_billing_busy`; Stripe failures use
`checkout_session_creation_error`.

## Call transcript analysis

`analyze-call-sessions` analyzes recent calls with xAI Grok and writes one
`call_session_analysis` row per call plus an aggregate `call_session_analytics`
row. `backfill-call-analysis` catches up every completed call without an
analysis. Both import the prompt, schema, transcript extraction, queue rules
and xAI Batch API client from `apps/web/lib/ai/`, so they write the same rows
and follow the same retry rule as the webhook and its batch cron. `--help`
lists their options.

```bash
pnpm analyze-call-sessions --hours=12
pnpm backfill-call-analysis --limit=2 --debug
```

The live path is the `POST /api/call-sessions/analyze` webhook, which enqueues
the session, and the `/api/call-sessions/analyze/batch` cron, which drains the
queue through the xAI Batch API; see [Architecture](../ARCHITECTURE.md) and
[docs/devops.md](../docs/devops.md).

A successful analysis completes the session's `call_analysis_queue` row. A
failure returns the session to the cron's queue until the third failed attempt
(`MAX_CALL_ANALYSIS_ATTEMPTS` in `apps/web/lib/ai/call-analysis-queue.ts`), or
a transcript without messages, parks it as `failed`. Both commands skip parked
sessions unless `--retry-failed` is passed. The minimum call length and the
model come from `apps/web/lib/ai/analyze-call.ts`. The commands need
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `XAI_API_KEY`.

## Sentry issue triage

Use this read-only procedure for issue-level crashes and browser or device
details. For handled generation failures and credit complaints, use the
[Gemini application-log investigation](#2-correlate-sentry-application-logs).

Verify the existing CLI authentication and list issues:

```bash
sentry-cli info
sentry-cli issues --org sexyvoiceai --project sexyvoice-ai list
```

The numeric issue ID is in the issue's dashboard URL or the first column of the
CLI issue list. A short ID such as `SEXYVOICE-AI-6C` is not an API issue ID.

To fetch full events, use a token with `event:read` from `SENTRY_AUTH_TOKEN` or
`~/.sentryclirc`. This keeps the token out of command arguments and output:

```bash
python3 - '<numeric-issue-id>' <<'PY'
import configparser
import json
import os
from pathlib import Path
import sys
from urllib.request import Request, urlopen

issue_id = sys.argv[1]
if not issue_id.isdecimal():
    raise SystemExit("Replace <numeric-issue-id> with the issue's numeric ID")
config = configparser.ConfigParser(interpolation=None)
config.read(Path.home() / ".sentryclirc")
token = os.environ.get("SENTRY_AUTH_TOKEN") or config.get("auth", "token", fallback=None)
if not token:
    raise SystemExit("Configure SENTRY_AUTH_TOKEN or ~/.sentryclirc first")
url = f"https://sentry.io/api/0/organizations/sexyvoiceai/issues/{issue_id}/events/?full=true&per_page=10"
request = Request(url, headers={"Authorization": f"Bearer {token}"})
with urlopen(request, timeout=30) as response:
    print(json.dumps(json.load(response), indent=2))
    print("Pagination:", response.headers.get("Link", "none"), file=sys.stderr)
PY
```

The [issue events API](https://docs.sentry.io/api/events/list-an-issues-events/)
caps full-event pages at 10. Follow its `Link` header's next cursor when
`results="true"`; one page is not the complete incident history. Inspect
`dateCreated`, `tags`, `contexts.device`, `contexts.browser`, `contexts.os` and
`entries` for breadcrumbs, exceptions and request details. Event contents may
include customer data, so keep exports out of the repository and shared
reports. Resolving or muting an issue is a separate action, not part of
diagnosis.

## Investigate Gemini TTS Errors and Credit Charges

Use this runbook when a user reports that Gemini speech requests failed,
returned defective audio, or consumed credits unexpectedly. It is the canonical
workflow for humans and coding agents. The companion agent instructions are in
`skills/investigate-gemini-tts-credit-report/SKILL.md`.

The investigation is read-only. Do not run refund scripts, database mutations,
Supabase RPCs or any other production write while following it. A refund is a
separate action that needs explicit human approval after the evidence and the
amount have been reviewed.

### Inputs and scope

Collect:

- the user's UUID;
- the start and end timestamps in UTC, with enough buffer to catch retries;
- any generation IDs, request IDs, filenames, screenshots or exact error text;
- whether the complaint concerns an error response, the delivered audio, or
  both.

Do not infer a narrow time window from the report when the user or production
records can supply one, and state any assumed window in the final report. Use a
temporary directory outside the repository for logs, downloaded audio,
environment files and generated reports. These artifacts may contain user text,
email addresses, signed URLs or other production data.

### 1. Establish the ledger baseline

Run the read-only dispute evidence command to reconcile the complete account
ledger:

```bash
pnpm compile-dispute-evidence <user-id>
```

It reports the expected balance and the delta between the current and expected
balances; `expectedBalance` in `lib/ledger.mts` defines the equation. A zero
delta means the stored balance agrees with the stored ledger. It does not prove
that every delivered artifact was usable. A non-zero delta is a
billing-integrity finding that must be explained before considering any refund.

The command writes a Markdown report with production account data. Move it to
the temporary investigation directory and remove it after the investigation. Do
not paste irrelevant PII into tickets or the final report.

If the report lacks a detail you need, use the configured Supabase CLI or
database client only for scoped `SELECT` or other read-only queries. Inspect
the query before running it. Never use `INSERT`, `UPDATE`, `DELETE`, DDL, RPC
calls or a command with a write mode during an investigation.

### 2. Correlate Sentry application logs

Sentry is the primary source for application errors and handled Gemini
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
quota exhaustion and responses with no audio. Add terms to `--query` to refine
by `level`, message, model, provider response ID or refund context. Useful
messages include:

- `Gemini voice generation succeeded`;
- `Gemini voice generation returned no audio data`;
- `Gemini voice generation failed`;
- `Gemini provider temporarily unavailable`;
- `Gemini rejected TTS request`;
- `Failed to restore reserved credits`;
- `Failed to refund unused reserved credits`.

`--log-level` controls `sentry-cli`'s own output and does not filter the
returned application logs. Filter application levels inside `--query`, such as
`level:error` or `level:warn`.

The `sentry-cli logs` command is beta and may change. Confirm the installed
syntax before adapting a command:

```bash
sentry-cli logs list --org sexyvoiceai --project 4509116876193872 --help
```

Use an existing authenticated CLI configuration with read access to the
project, and never put an auth token in commands, reports or shared notes. If
the first query returns no rows, keep the same UTC window and broaden the
search by removing `user.id` and using a supplied response ID, known message or
model. Narrow busy windows instead of assuming that the 1000-row result cap
holds every matching attempt.

Correlate attempts by `user.id`, timestamp, message, model, response ID,
artifact ID, and credit reservation or refund context. Read the current
generation route before relying on historical message names or refund
behavior.

### Vercel fallback

Use Vercel only when Sentry has no matching evidence, the request may have
failed before application logging, or you need platform HTTP or request
metadata:

```bash
vercel logs --environment production --since <start-iso> --until <end-iso> --limit 1000 --json
vercel logs --environment production --since <start-iso> --until <end-iso> --query '<user-id>' --json
vercel logs --environment production --request-id <request-id> --json
```

Label Vercel-only timestamp correlations as inferences unless a request ID,
response ID or artifact ID joins them to Sentry or database evidence.

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
pnpm find-truncated-gemini31-tts \
  --user <user-id> \
  --since <start-iso> \
  --until <end-iso> \
  --out <temporary-directory>/truncation-candidates.json
```

The detector produces short-output candidates and review-only long-output
anomalies, not confirmed defects. Long-output anomalies must not enter refund
calculations. For each disputed or flagged artifact, compare its database
status, credits, model, transcript, duration, provider token metadata, storage
object and matching request log. Download audio only when necessary and keep it
in the temporary directory.

Confirm a delivered-audio defect with independent evidence, such as listening
to the complete artifact, verifying that transcript content is missing, or
finding that the file is empty, corrupt or materially shorter than its
transcript can support. One heuristic alone must not decide a refund.

### Audio energy and silence

`ffmpeg`'s `silencedetect` filter finds intervals below a chosen amplitude
threshold for a minimum duration. It does not prove that those intervals are
inaudible. Quiet speech, room tone, compression artifacts, fades and poor
recording levels can all fall below the threshold while staying audible.

For example:

```bash
ffmpeg -i <audio-file> -af silencedetect=noise=-40dB:d=0.5 -f null -
```

Report this result as "approximately N seconds below -40 dBFS for at least 0.5
seconds", not "N seconds of silence". Always state the threshold and the
minimum duration. Do not use low-energy duration by itself to classify audio as
broken or to calculate a refund.

### 4. Separate findings from hypotheses

Use these evidence classes:

- **Proven billing defect.** A debit or usage charge lacks the expected
  delivery or refund and creates an explainable credit shortfall.
- **Confirmed delivered-audio defect.** The artifact was billed and delivered,
  but independent inspection confirms missing, corrupt or unusable output.
- **Suspected quality defect.** A heuristic or subjective review raises
  concern, but the expected content may still be audible or present.
- **No discrepancy found.** The ledger reconciles, failures were refunded, and
  no delivered artifact was independently confirmed defective.
- **Inconclusive.** Required logs or artifacts are unavailable.

Keep these claims separate. A reconciled ledger rules out an unexplained
balance mismatch, but it does not rule out compensation for a confirmed
defective artifact.

### 5. Report and clean up

Return:

1. user ID and UTC investigation window;
2. data sources and exact commands used;
3. ledger equation, current balance, expected balance and delta;
4. request counts by outcome, with request IDs when available;
5. delivered artifacts reviewed and their evidence;
6. proven findings, suspected issues and confidence labels;
7. proposed credit adjustment, if supported, without executing it;
8. missing evidence and recommended next action.

Before finishing, remove or move to the system Trash all temporary environment
files, logs, reports, signed URLs and downloaded user audio. State what was
cleaned up and whether anything remains recoverable in Trash.

## Find truncated Gemini 3.1 Flash TTS

`find-truncated-gemini31-tts` flags `gemini-3.1-flash-tts-preview`
`audio_files` whose measured duration is unusually short or long for the stored
transcript. It only reads. Use it as one signal in the
[Gemini TTS investigation](#investigate-gemini-tts-errors-and-credit-charges),
not as proof of truncation or authorization for a refund.

```bash
pnpm find-truncated-gemini31-tts --user <user-id> --since <start-iso> --until <end-iso>
```

Gemini credits come from the total token count (`creditsFromTokens` in
`apps/web/lib/tts/models.ts`), so a long prompt that the model only partly
voices still costs its prompt tokens. The detector divides the transcript's
characters by the audio duration and flags rates far above natural speech. It
also lists output much longer than expected, for review only. `--help` gives
the thresholds. Speech rate and prompt structure vary, and the detector does not
check the spoken words, the audio quality or whether the user found the
artifact usable. It lists rows with an unmeasured duration as
`unknown-duration` and does not judge them.

The command prints candidate tables, candidate credit exposure by user and
conditional `refund-credits` commands, and writes a JSON report. The exposure
is not a confirmed refund amount. Inspect every candidate and reconcile the
ledger before proposing a refund, and run [`refund-credits`](#refund-credits)
only after a human approves a confirmed amount.

## Other commands

- `pnpm sync-deny-domains` refreshes
  `apps/web/lib/disposable-email/deny-domains.json` from a shallow clone of
  [amieiro/disposable-email-domains](https://github.com/amieiro/disposable-email-domains)
  in `scripts/.cache`. Signup checks this list as well as the
  `disposable-email-domains-js` package. The file is committed so deploys need
  no network access, and `.biomeignore` keeps it minified.
- `pnpm benchmark-daily-stats --label <name> --date YYYY-MM-DD` times the local
  daily stats route; see
  [local benchmarking](../apps/web/app/api/daily-stats/README.md#local-benchmarking).

## Shell, SQL and Python tools

These run directly, not through `pnpm`.

- `db_backups.sh`, `db_local_restore.sh` and `extract_public_data.sh` back up
  the cloud database and restore it locally; see
  [db_back_and_restore_README.md](./db_back_and_restore_README.md).
- `create-release.sh` checks the version, tags the release and creates the
  GitHub release from `Changelog.md`. It pushes the tag.
- `check-markdown-routes.sh [base-url]` checks the `.md` routes and the blog
  Markdown rewrite against a running app.
- `identify-freeloaders.sql` exports the CSV for `reset-freeloader-credits`.
  `inactive-empty-user-profiles-retention.sql` previews inactive empty profiles
  and holds a commented-out delete. Run hand-written SQL only after review,
  through the Supabase SQL editor.
- `get-and-clean-transactions.sh` exports `credit_transactions` with profile
  usernames to `backups/` through `psql` and `SUPABASE_DB_URL`.
  `get-and-clean-stripe-payments.sh` exports succeeded Stripe payment intents
  with the Stripe CLI and cleans them with `clean-stripe-payments.py`.
- `setup-analysis-environment.sh` creates a Python virtual environment outside
  the repository and installs `requirements.txt` for
  `analyze-credit-transactions.py`, `visualize-transactions.py`,
  `compare-payments.py` and `generate_waveform_video.py`. Each prints its usage
  when run without arguments.
