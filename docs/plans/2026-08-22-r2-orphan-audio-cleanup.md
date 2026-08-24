# R2 orphan audio cleanup

## Status

Proposed for review. Inventory must run before deletion. A human must inspect the
manifest before using it.

## Problem

The free-account retention cron deletes `public.audio_files` rows after 45 days.
It does not delete R2 objects.

The main R2 bucket expires `generated-audio-free/` and `cloned-audio-free/`
after 30 days. The API speech bucket has no audio expiration rule. Most useful
findings will probably come from the API bucket or from objects missed by a
lifecycle rule.

Once the cron deletes a row, its `storage_key` is gone. The script cannot prove
why an unreferenced object exists. It will call these objects "orphan
candidates," not confirmed cron deletions.

## Candidate rules

Scan only these locations:

- `R2_BUCKET_NAME/generated-audio-free/`
- `R2_BUCKET_NAME/cloned-audio-free/`
- `R2_SPEECH_API_BUCKET_NAME/generated-audio-free/`

Never scan paid prefixes, `clone-voice-input/`, or an unknown prefix.

An object is a candidate when:

1. it belongs to one of the bucket and prefix pairs above;
2. R2 says it is at least 45 days old; and
3. no `public.audio_files` row has the same `storage_key`.

Fetch every current `storage_key`, including active and soft-deleted rows. Use
one set of keys for both buckets. This may keep an object when two buckets share
a key, which is safer than deleting the wrong object.

The script reads Supabase. It never writes to it.

## Command

Add this root command, delegated to `@sexyvoice/scripts`:

```bash
pnpm cleanup-orphaned-r2-audio -- [options]
```

The command has two steps. Inventory creates evidence. An action run consumes
that evidence and checks live state again.

### Inventory

```bash
pnpm cleanup-orphaned-r2-audio
```

Inventory writes
`scripts/backups/r2-orphan-candidates-<timestamp>.json`. The manifest contains:

- a schema version and creation time;
- the 45-day cutoff;
- configured bucket names;
- each candidate's bucket, prefix, key, size, `LastModified`, and ETag; and
- counts and bytes grouped by bucket and prefix.

The manifest contains no credentials.

### Download

```bash
pnpm cleanup-orphaned-r2-audio -- \
  --manifest scripts/backups/r2-orphan-candidates-<timestamp>.json \
  --download \
  --download-dir /Volumes/ExternalHD/sexyvoice-r2-bucket \
  --max-download-size 20GB
```

`--download` requires `--manifest`, `--download-dir`, and
`--max-download-size`. Reject `--download-dir` and `--max-download-size` when
`--download` is absent.

Require the exact download directory to exist with write and traversal access
before reading the manifest or touching R2. Do not create the download root.
This makes an unmounted removable volume fail at startup instead of creating
its mount path on the internal disk.

Accept decimal units `KB`, `MB`, `GB`, and `TB`, plus binary units `KiB`, `MiB`,
`GiB`, and `TiB`.

Sort candidates from oldest to newest. Select whole files until the download
cap is full. If one file does not fit, defer it and continue looking for smaller
files. Defer any single file larger than the cap.

An existing verified file needs no transfer and does not count against the cap.
Never overwrite an existing file.

Keep the bucket and R2 key in the local path:

```text
<download-dir>/
├── <R2_BUCKET_NAME>/generated-audio-free/...
└── <R2_SPEECH_API_BUCKET_NAME>/generated-audio-free/...
```

Reject any key whose resolved path escapes its bucket directory.

Stream a new download to a temporary file beside its destination. Check the
byte count. When R2 returns a simple ETag, compare it with the local MD5. Treat
multipart and other opaque ETags as unverifiable. Rename the temporary file
only when the destination does not exist.

For an existing file, compare its size and any usable checksum. A mismatch
blocks deletion. A downloaded object without a usable remote checksum remains
in the report, but normal deletion cannot remove its R2 copy.

### Delete after download

```bash
pnpm cleanup-orphaned-r2-audio -- \
  --manifest scripts/backups/r2-orphan-candidates-<timestamp>.json \
  --download \
  --download-dir /Volumes/ExternalHD/sexyvoice-r2-bucket \
  --max-download-size 20GB \
  --delete \
  --yes
```

Normal deletion removes only selected objects with verified local copies.
Deferred files, checksum failures, download failures, and local mismatches stay
in R2.

### Delete without download

```bash
pnpm cleanup-orphaned-r2-audio -- \
  --manifest scripts/backups/r2-orphan-candidates-<timestamp>.json \
  --delete \
  --force \
  --yes
```

`--force` skips downloading and local verification. It does not skip the
manifest check, prefix allowlist, 45-day cutoff, database lookup, or R2 metadata
check.

If `--download` and `--force` appear together, follow the download path and
ignore `--force`. Reject `--delete` unless either `--download` or `--force` is
present. Every deletion requires `--yes`; destructive runs do not prompt.

## Checks before an action

Validate the manifest before reading or deleting an object. Then fetch current
Supabase and R2 state.

For every manifest entry:

1. Match the bucket to `R2_BUCKET_NAME` or `R2_SPEECH_API_BUCKET_NAME`.
2. Match the key to the allowed prefixes for that bucket.
3. Skip the object if a current database row references its key.
4. Call `HeadObject`. Treat an absent object as skipped, not failed.
5. Confirm the object is still at least 45 days old.
6. Confirm size, ETag, and `LastModified` still match the manifest.

These checks prevent a stale manifest from deleting a replacement object.
Delete in bounded batches and record each R2 result. Do not retry successful
items after a partial failure.

## Reports and exit codes

Write an action report next to the inventory manifest. Give each object one
final status, such as:

- verified download;
- verified existing file;
- deferred by the size cap;
- referenced by the database;
- changed in R2;
- missing from R2;
- local mismatch;
- unverifiable checksum;
- deleted;
- download failure; or
- deletion failure.

Print counts and bytes by bucket and prefix. Exit with a nonzero code after
writing the report if a requested download or deletion failed.

Never print secrets or signed R2 requests.

## Shared script code

The `.mts` scripts contain five copies of the Supabase admin-client factory:

- `backfill-free-call.mts`
- `batch-refund-credits.mts`
- `compile-dispute-evidence.mts`
- `refund-credits.mts`
- `reset-freeloader-credits.mts`

They also repeat the same dotenv setup. Add two narrow modules:

- `scripts/lib/env.mts` exports `loadScriptEnv()`;
- `scripts/lib/supabase.mts` exports `createScriptAdminClient()`.

`loadScriptEnv()` loads `.env` and `.env.local` without replacing variables
already set by the shell. `createScriptAdminClient()` checks
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`, disables token refresh,
and accepts a `persistSession` option. Its default is `false`.

Move the five scripts to these helpers without changing their database work.
`reset-freeloader-credits.mts` must pass `persistSession: true` to preserve its
current setting. Keep local-versus-production warnings in each command because
their placement and wording differ.

Several scripts also contain the same three-line `promptUser()` wrapper. Do not
extract it in this change. The R2 command is noninteractive, and a generic
prompt helper would add an import without giving us one place for meaningful
safety rules. Extract confirmation handling when two commands need the same
confirmation policy.

Document one rule in `scripts/README.md`: new TypeScript maintenance scripts
must use the shared environment and Supabase helpers. This prevents the copy
from returning.

## Files

Add:

- `scripts/cleanup-orphaned-r2-audio.mts`
- `scripts/lib/env.mts`
- `scripts/lib/supabase.mts`
- `scripts/lib/r2-orphan-audio-cleanup.mts`
- `scripts/r2-orphan-audio-cleanup.test.mts`

Update:

- the five `.mts` scripts listed above;
- `scripts/package.json`;
- the root `package.json`;
- `scripts/README.md`;
- `pnpm-lock.yaml`; and
- `scripts/.gitignore` only if its existing `*.json` rule does not cover the
  reports.

Use `@aws-sdk/client-s3` at the version already used by `apps/web`.

The R2 command reads these variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_SPEECH_API_BUCKET_NAME`

R2 credentials need list, read, head, and delete access for deletion mode.

## Tests

Use Node's test runner through `tsx`. Cover:

- decimal and binary size parsing;
- invalid and zero download limits;
- the 45-day boundary;
- database key protection across both buckets;
- bucket and prefix allowlists;
- oldest-first selection under the byte cap;
- fitting a later small file after deferring a large one;
- manifest validation;
- path traversal rejection;
- CLI option dependencies;
- no-overwrite behavior;
- simple and opaque ETags;
- paginated Supabase and R2 reads;
- changed and missing R2 objects; and
- partial deletion failures.

Use small client interfaces so tests do not contact Supabase or R2.

## Validation

Run focused checks first:

```bash
pnpm --filter @sexyvoice/scripts test
pnpm --filter @sexyvoice/scripts type-check
pnpm exec biome check scripts/cleanup-orphaned-r2-audio.mts \
  scripts/lib/*.mts \
  scripts/r2-orphan-audio-cleanup.test.mts
```

Then run the repository checks:

```bash
pnpm fixall
pnpm type-check
pnpm test
```

Run inventory against the configured buckets and inspect the JSON. Do not run
`--download` or `--delete` as part of automated validation.

## Done when

- Inventory writes a complete manifest and makes no remote changes.
- The command never scans a paid, clone-input, or unknown prefix.
- Any current database row protects its key in both buckets.
- Downloads stay within the requested cap and never replace a local file.
- Normal deletion requires a verified local copy.
- `--delete --force --yes` skips only the backup requirement.
- Every attempted action appears in the report.
- The five existing `.mts` scripts use the shared environment and Supabase
  modules without behavior changes.
- Focused tests, `pnpm fixall`, `pnpm type-check`, and `pnpm test` pass.
