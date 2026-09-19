# R2 orphan audio cleanup

## State

The cleanup command and shared script helpers are implemented. The approved plan is
`docs/plans/2026-08-22-r2-orphan-audio-cleanup.md`.

## Decisions

- Inventory and action runs stay separate. An action always consumes a manifest.
- Each allowed location records a mutually exclusive funnel: younger than the cutoff, old and database-referenced, or an orphan candidate. Zero-object locations remain visible.
- R2 has no aggregate bucket-size response. Inventory lists all object metadata once per configured bucket and sums object count and bytes. Objects outside the cleanup prefixes contribute only to bucket totals.
- Candidate checks use one set of live `audio_files.storage_key` values across both R2 buckets.
- The command scans only the three approved bucket and prefix pairs.
- Normal deletion requires a verified local file. `--force` skips only that backup check.
- Existing local files are never overwritten. Finalization uses an atomic no-clobber hard link, with exclusive copy as a fallback for filesystems without hard links. POSIX `rename` can replace an existing destination.
- Objects with opaque or multipart ETags may be downloaded, but they remain ineligible for normal deletion because the local copy cannot be verified against an MD5 checksum.
- Downloads send `If-Match` and stop writing if R2 exceeds the manifest size. This keeps changed objects from consuming the rest of the drive.
- Download actions require an existing writable and traversable root before reading the manifest or touching R2. A missing removable volume cannot be replaced by a directory on the internal disk.
- Deletion handles one object at a time. It verifies the local checksum first, then performs an exact database key lookup and a fresh `HeadObject` immediately before the delete request.
- R2 documents conditional reads but not conditional deletes. A replacement or new database reference can still appear in the short gap between the final checks and deletion. Removing that race requires a server-side conditional delete or a coordinated retention state in the database.
- Shared script modules stay narrow: environment loading, Supabase client creation, and R2 cleanup logic.

## Findings

- `scripts/.gitignore` already ignores `*.json`, so inventory manifests and action reports under `scripts/backups/` need no new ignore rule.
- `scripts/tsconfig.json` type-checks the TypeScript maintenance commands and their shared modules.
- `reset-freeloader-credits.mts` is the only migrated command that enables Supabase session persistence.

## Verification

- `pnpm --filter @sexyvoice/scripts test` passes 51 tests.
- `pnpm --filter @sexyvoice/scripts type-check` passes.
- The focused Biome check for the cleanup command, helpers, and tests passes.
- `pnpm fixall` passes with five existing Sentry namespace-import warnings.
- `pnpm type-check` passes for all packages.
- The normal `pnpm test` run passes all 63 web test files and all script tests, then waits in Vitest watch mode until the command timeout.
- `CI=1 pnpm test` exits but fails the 35 Stripe webhook tests because the shared Redis connection closes. The Stripe webhook file passes all 35 tests when run alone.
- Read-only inventory completed against both configured buckets. `sv-audio-files` contained 29,290 objects and 34,825,931,807 bytes. `sv-api-speech-audio-files` contained 5,132 objects and 2,226,824,512 bytes. The free prefixes contained only objects younger than 45 days, and the manifest contained zero orphan candidates.
