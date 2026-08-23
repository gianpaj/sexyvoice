# R2 audio backup implementation

## Scope

Implement the approved design in `docs/plans/2026-08-23-r2-audio-backup-design.md` without changing the cleanup command's deletion policy.

## Invariants

- Backup never reads Supabase or deletes remote or local data.
- Existing local paths are verified but never replaced.
- Cleanup keeps its bucket/prefix allowlist, 45-day cutoff, manifest validation, database checks, and fresh pre-delete R2 check.
- Opaque ETags count as size-verified for backup but remain insufficient to authorize cleanup deletion.
- Shared R2 modules stay Promise-based. Effect remains in the backup command.

## Implementation sequence

1. Extract the AWS SDK adapter and generic transfer helpers. Keep cleanup tests green.
2. Add source parsing, planning, downloads, reports, and offline tests for the backup command.
3. Add `effective-progress@0.12.0` and `effect@4.0.0-rc.111`, wire the root command, and document operation.
4. Run focused checks, repository checks, and one narrow production dry run.

## Decisions and learnings

- Shared metadata stores normalized ETags. The AWS adapter adds quotes for `If-Match`.
- The adapter classifies conditional GET failures as `changed` or `missing`; other failures reject.
- Safe path resolution inspects existing components with `lstat` and rejects keys with empty or dot segments or backslashes because filesystem normalization could collapse distinct R2 keys.
- Node does not expose an `openat`-style API for no-follow directory traversal. The command rechecks path components before writes and finalization, but it assumes no hostile process mutates the destination tree during a run.
- `effective-progress@0.12.0` does not support `mode: 'result'` on `Progress.forEach`. It supports that mode on `Progress.all`. Use `Progress.all` for TTY runs and `Effect.all` for non-TTY runs so all downloads finish and the progress bar reports success and failure counts accurately.
- The approved spec was moved by the user from `docs/superpowers/specs/` to `docs/plans/`; preserve the move.
- Effect's optional `msgpackr-extract` dependency does not need native acceleration for this command, so its install script is disabled in `allowBuilds`.
- Main-bucket cleanup deletion evicts the object's Redis URL cache key after R2 confirms deletion. Cache eviction failures return a nonzero result because a stale URL would break repeated generation requests.
- The cleanup entry point is import-safe. `runAction()` accepts injected R2, database, cache, clock, logging, and report dependencies so tests cover destructive ordering and backup eligibility.
- Soft-deleted `audio_files` rows remain references. Cleanup must not add an active-status filter because user-deleted history still protects its R2 key.
- Database inventory orders by `storage_key` and then `id` so duplicate content-derived keys cannot make offset pages ambiguous.
- `runBackup()` treats every defined transfer cap as a cap, so a direct caller cannot turn zero into an uncapped run.
- Manifest path resolution checks access without reading the document; validation performs the only full manifest read.
- Cleanup manifests are approval artifacts, not editable candidate lists. Derived totals make any hand-edited subset invalid.
- Each destructive candidate has an outer error boundary. Unexpected per-object errors become `deletion-failure`, later candidates continue, and the final report retains earlier confirmed deletions.
- Cleanup deletion stays sequential by design. Batching would widen the gap between each final database check and its R2 deletion.
- Effect result order is load-bearing because report entries map outcomes back to selected objects by index; tests force out-of-order completion and assert input-order results.

## Verification record

- Shared extraction: cleanup tests pass, scripts type-check passes, and focused Biome checks pass.
- Backup implementation: 39 offline tests pass, scripts type-check passes, and focused Biome checks pass.
- Repository gates: `pnpm fixall` passes with five existing Sentry namespace-import warnings. `pnpm type-check` passes.
- Full tests: all 45 scripts tests and 62 of 63 web test files pass. The 35 Stripe webhook tests fail on the existing closed Redis connection in `tests/utils/redis-test-utils.ts`; the focused file fails for the same reason.
- Production dry run: `sv-api-speech-audio-files/generated-audio/` lists 5,132 objects and 2.1 GiB, selects all objects without downloading, and writes the ignored report.
- Review fixes: 45 scripts tests pass, repository type-check passes, focused Biome checks pass, and `Redis.fromEnv()` accepts the project's `KV_REST_API_URL` and `KV_REST_API_TOKEN` variables.

Do not run a full backup.
