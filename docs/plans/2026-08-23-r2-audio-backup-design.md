# R2 audio backup

## Status

Approved design. Implementation requires a separate plan and review.

## Problem

The orphan cleanup command downloads only old, unreferenced free-user audio from
a reviewed manifest. It cannot back up complete R2 buckets, and adding a mode
that bypasses its database, age, prefix, and deletion rules would make that
command harder to trust.

Add a separate one-way backup command. It downloads remote objects that have no
matching verified local file. It never deletes from R2, deletes local backups,
or overwrites a local file.

## Command

Add this root command, delegated to `@sexyvoice/scripts`:

```bash
pnpm backup-r2-audio -- [options]
```

A normal backup requires a destination:

```bash
pnpm backup-r2-audio -- \
  --download-dir /Volumes/ExternalHD/sexyvoice-r2-bucket
```

When `--source` is absent, back up both complete buckets named by
`R2_BUCKET_NAME` and `R2_SPEECH_API_BUCKET_NAME`.

`--source` accepts a comma-separated list of R2 locations. Each location uses
`<bucket>[/<key-prefix>]`:

```bash
pnpm backup-r2-audio -- \
  --download-dir /Volumes/ExternalHD/sexyvoice-r2-bucket \
  --source sv-audio-files/generated-audio/,sv-api-speech-audio-files
```

Split each source at the first `/`. The rest is an exact R2 key prefix, not a
filesystem directory. For example, `audio` matches `audio-old/file.wav`, while
`audio/` does not.

Trim source values and remove exact duplicates. Reject empty sources and
sources that overlap. A complete bucket and one of its prefixes overlap, as do
two prefixes when one starts with the other. Rejecting overlap prevents the
same object from being listed, checked, downloaded, and reported twice.

Support these options:

```text
--download-dir <path>       Required local backup directory
--source <locations>        Comma-separated bucket or bucket/prefix sources
--max-download-size <size>  Optional cap for new transfers
--dry-run                   Scan and compare without downloading
-h, --help                  Show help
```

Accept decimal units `KB`, `MB`, `GB`, and `TB`, plus binary units `KiB`, `MiB`,
`GiB`, and `TiB`. Reject zero, negative, fractional-byte, and unsafe integer
results.

When `--source` is present, require `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, and
`R2_SECRET_ACCESS_KEY`. When it is absent, also require `R2_BUCKET_NAME` and
`R2_SPEECH_API_BUCKET_NAME`.

The command has no deletion or force flags.

## Local layout and safety

Preserve the literal bucket name and complete R2 key:

```text
<download-dir>/
├── <bucket-one>/<complete-r2-key>
└── <bucket-two>/<complete-r2-key>
```

A prefix limits the remote listing. It does not get removed from the local
path.

Reject an empty key, absolute key, empty or `.` or `..` segment, backslash,
path that escapes its bucket directory, or symlinked path component beneath
that directory. Empty segments include repeated and trailing slashes. These
keys cannot map to a local path without normalization or platform-dependent
collisions. Run this check before reading or writing the destination.

Never overwrite an existing local path. A mismatch is an error for the user to
resolve.

## Backup flow

### List every source

Paginate `ListObjectsV2` for every source and record each object's bucket,
requested prefix, complete key, size, ETag, and `LastModified` value.

Finish listing all sources before downloading. If any listing fails, write a
source failure report and make no downloads. A partial listing must not look
like a complete backup.

Sort the combined object list from oldest to newest. This gives objects closest
to lifecycle expiration priority when a transfer cap applies.

### Compare local files

Resolve each object to its local path and classify it:

- `missing` when no local file exists;
- `existing-checksum` when size and a simple ETag MD5 match;
- `existing-size` when an opaque ETag and local size match;
- `local-mismatch` when size or a usable checksum differs;
- `local-read-failure` when the path cannot be inspected; or
- `unsafe-path` when the key cannot map safely to the destination.

A simple ETag is exactly 32 hexadecimal characters after removing surrounding
quotes. Treat multipart and other ETags as opaque.

This backup is stateless. For opaque ETags, equal size is the only available
comparison. A five-object production sample from
`sv-api-speech-audio-files/generated-audio/` had simple ETags, and every ETag
matched the downloaded file's MD5. That sample does not prove that all objects
in either bucket have simple ETags.

### Select transfers

Existing files do not count against `--max-download-size`. Apply the cap only
to missing objects, from oldest to newest. If one object does not fit, defer it
and continue looking for smaller objects. Without the option, select every
missing object.

A deferred object is not a failure because a later run can resume the backup.

### Download

Download up to four objects concurrently. For each object:

1. create its parent directory;
2. request it with `If-Match` set to the listed ETag;
3. stream it to a uniquely named temporary file beside the destination;
4. stop if the stream exceeds the listed size;
5. reject a stream that finishes short;
6. compare local MD5 when the ETag is simple;
7. accept exact size when the ETag is opaque; and
8. move the temporary file into place only if the destination still does not
   exist.

Remove the temporary file after a handled failure. A process kill may leave a
`.partial-<uuid>` file. Later runs ignore partial files and never treat them as
completed backups.

Classify download outcomes as `downloaded-checksum`, `downloaded-size`,
`changed-in-r2`, `missing-from-r2`, or `download-failure`. An `If-Match` failure
means the object changed after listing. Do not retry it against stale metadata.
The AWS SDK may perform its normal bounded request retries.

Continue after individual download failures so the report accounts for every
listed object. Return a nonzero exit code for unsafe paths, local mismatches,
local read failures, changed or missing remote objects, and download failures.

`--dry-run` performs source listing, local comparison, transfer selection, and
reporting. It does not create destination directories or download objects.

## Progress and summaries

Before downloading, print total objects and bytes for each source. Then print
counts and bytes for existing, missing, deferred, and selected objects.

Use `effective-progress` for an interactive download run. Wrap each Promise
based download with `Effect.tryPromise()`, build one effect per object, and run
the effects through `Progress.all()`:

```ts
Progress.all(objects.map(downloadObject), {
  concurrency: 4,
  description: 'Downloading R2 objects',
  mode: 'result',
});
```

`effective-progress@0.12.0` supports `mode: 'result'` on `Progress.all()`, not
`Progress.forEach()`. Result mode runs every download and displays successful
and failed object counts. Use the built-in progress bar, elapsed time, and ETA.
Include the total selected bytes in the description. Do not add nested per-file
tasks, custom columns, or manual per-chunk progress.

Mount the Ink renderer only when `process.stdout.isTTY` is true. For redirected
output and CI, run the same effects with `Effect.all()` at concurrency four and
`mode: 'result'`. Print the plan, individual failures, and completion summary
without ANSI rendering.

At completion, print:

- downloaded objects and bytes;
- checksum-verified objects and bytes;
- size-verified objects and bytes;
- failed objects and bytes;
- elapsed time and average transfer rate; and
- the report path.

A dry run prints source totals and the transfer plan without mounting the
progress renderer.

Pin these dependencies in the workspace catalog because `effective-progress`
is pre-1.0 and Effect v4 is a release candidate:

```yaml
effective-progress: 0.12.0
effect: 4.0.0-rc.111
```

Consume both with `catalog:` in `scripts/package.json`. Keep Effect and
`effective-progress` in `backup-r2-audio.mts`; shared R2 modules remain
Promise-based. Ink and React stay transitive dependencies of
`effective-progress`.

## Reports

Write `scripts/backups/r2-audio-backup-<timestamp>.json`. It contains:

- a schema version and creation time;
- requested and resolved sources;
- dry-run and transfer-cap settings;
- source object and byte totals;
- one final status for every listed object;
- local destination paths relative to `--download-dir`;
- failure reasons; and
- counts and bytes grouped by source, bucket, and status.

The report contains no credentials, authorization headers, or signed requests.
A listing failure report names the failed source and error but cannot contain a
complete object inventory.

## Shared code

Add `scripts/lib/r2-client.mts` for the AWS SDK adapter:

- environment validation and `S3Client` construction;
- list, get, and head requests; and
- batch deletion used by the cleanup command.

Add `scripts/lib/r2-transfer.mts` for Promise-based transfer rules:

- R2 object metadata and client interfaces;
- pagination;
- byte-size parsing and formatting;
- transfer-cap selection;
- safe local path resolution;
- ETag normalization and simple MD5 detection;
- local file verification;
- streaming download and byte-count enforcement; and
- no-overwrite finalization.

Keep cleanup policy in `scripts/lib/r2-orphan-audio-cleanup.mts`:

- free-user bucket and prefix allowlists;
- the 45-day cutoff;
- database-reference protection;
- candidate analysis and manifests;
- stale-object rechecks;
- deletion eligibility; and
- cleanup reports.

The command files coordinate these modules:

- `cleanup-orphaned-r2-audio.mts` combines Supabase, cleanup policy, and shared
  R2 code;
- `backup-r2-audio.mts` combines source selection, local comparison, progress,
  and shared R2 code.

## Files

Add:

- `scripts/backup-r2-audio.mts`
- `scripts/r2-audio-backup.test.mts`
- `scripts/lib/r2-client.mts`
- `scripts/lib/r2-transfer.mts`

Update:

- `scripts/cleanup-orphaned-r2-audio.mts`
- `scripts/lib/r2-orphan-audio-cleanup.mts`
- `scripts/r2-orphan-audio-cleanup.test.mts`
- `scripts/package.json`
- root `package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `scripts/README.md`

Update `scripts/.gitignore` only if its current JSON rule does not cover backup
reports.

## Tests

Use Node's test runner through `tsx`. Keep tests offline with small R2 and
filesystem interfaces. Cover:

- default environment sources;
- bucket and exact-prefix source parsing;
- duplicate normalization and overlapping-source rejection;
- paginated listing;
- path traversal and symlink rejection;
- decimal and binary size parsing;
- oldest-first transfer selection;
- fitting a later small object after deferring a larger one;
- simple ETag MD5 verification;
- opaque ETag size verification;
- local mismatch and local read failures;
- no-overwrite finalization;
- conditional downloads;
- changed and missing remote objects;
- partial download cleanup;
- four-object concurrency;
- dry-run behavior;
- listing failures that prevent all downloads;
- mixed download results that continue processing;
- report totals and exit-code decisions; and
- existing orphan cleanup and deletion behavior after extraction.

Do not snapshot Ink output. Put progress orchestration behind a narrow function
and test its selected inputs and returned results.

## Validation

Run focused checks first:

```bash
pnpm --filter @sexyvoice/scripts test
pnpm --filter @sexyvoice/scripts type-check
pnpm exec biome check scripts/backup-r2-audio.mts \
  scripts/cleanup-orphaned-r2-audio.mts \
  scripts/lib/*.mts \
  scripts/*r2*.test.mts
```

Then run the repository checks:

```bash
pnpm fixall
pnpm type-check
pnpm test
```

Run a production read-only dry run against a narrow source. Do not start the
full backup as automated validation:

```bash
pnpm backup-r2-audio -- \
  --download-dir /Volumes/ExternalHD/sexyvoice-r2-bucket \
  --source sv-api-speech-audio-files/generated-audio/ \
  --dry-run
```

## Done when

- The default command covers both configured complete buckets.
- `--source` accepts any accessible bucket or exact key prefix without duplicate
  work.
- Repeated runs skip matching local files and never overwrite a local path.
- Simple ETags receive MD5 verification and opaque ETags receive explicit
  size-only verification.
- An optional cap limits new transfer bytes and prioritizes older objects.
- Interactive runs use `effective-progress`; redirected output has no Ink
  rendering.
- Every listed object receives one final report status.
- The cleanup command keeps its allowlist, database, age, manifest, and deletion
  protections after generic R2 code moves out.
- Focused tests, `pnpm fixall`, `pnpm type-check`, and `pnpm test` pass.
