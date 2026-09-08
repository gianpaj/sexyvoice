# Gemini provider usage

Status: Code prepared; migration application and database tests pending.

Gemini usage must survive missing audio rows, blocked responses, fallback, and
storage failures. Store one provider attempt in `usage_events` before persistence.
Keep customer credit events separate and correlate with `request_id`.

Provider attempts own token counts and estimated supplier costs. Customer events
own credits. Copying costs to both would inflate sums. Storing tokens only in
`audio_files.usage` loses them when files are deleted or never created. Dedicated
numeric columns support aggregation; metadata retains the provider breakdown.

HTTP 400 and 500 failures are excluded at the user's request. Unknown token counts
and costs remain NULL. A recorded estimate does not establish that Google charged
for a failed or blocked generation.

The migration filters provider attempts out of customer operation counts while
including their costs in API spend. It preserves historical rows and append-only
semantics. Existing zero-credit support needs no change.

See `docs/devops.md` for the mechanism and deployment order.

Verification: 158 relevant Vitest tests passed; 16 existing tests remain skipped.
The new streaming suite exercises the disabled route with a test-only flag.
Workspace type-check and fixall passed with existing warnings. Checks used the
installed pnpm 11.7 and Node 26.7 because the pinned pnpm version could not be
fetched; repository runtime settings remain unchanged. Database tests await
user application of the migration, as required by AGENTS.md.
