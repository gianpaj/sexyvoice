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
- Safe path resolution must inspect existing components with `lstat`, not only reject lexical traversal.
- `effective-progress@0.12.0` does not support `mode: 'result'` on `Progress.forEach`. It supports that mode on `Progress.all`. Use `Progress.all` for TTY runs and `Effect.all` for non-TTY runs so all downloads finish and the progress bar reports success and failure counts accurately.
- The approved spec was moved by the user from `docs/superpowers/specs/` to `docs/plans/`; preserve the move.

## Verification record

- Shared extraction: cleanup tests pass, scripts type-check passes, and focused Biome checks pass.

Do not run a full backup.
