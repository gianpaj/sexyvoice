# Daily-stats local benchmark

## Decision

Use the same development-only `cache=off` patch on both revisions. It skips
local activity-cache reads and writes. Deleting the cache before each request
was rejected because requests would still include serialization and disk writes.
Usage and safety instructions live in the
[daily-stats README](../../../../../apps/web/app/api/daily-stats/README.md#local-benchmarking).

## Measurement

Measured on 2026-09-12 through `https://sv.dev/api/daily-stats`, with report date
`2026-09-12`, the same running Next.js development server, and unchanged service
configuration. Each batch had one excluded warmup and five sequential requests.
The branch batch ran first, followed by local `main`. No database buffers or
upstream caches were cleared. No migrations were applied.

| Revision                                          | Median |    Min |    Max | Warmup |
| ------------------------------------------------- | -----: | -----: | -----: | -----: |
| main `fd5ceb87410f090eb74df1ff46e31495dd23949a`   | 6.782s | 6.711s | 7.420s | 7.517s |
| branch `f75d7b5d3c635b51b20aa5513caae5289d674bf9` | 6.602s | 6.450s | 7.472s | 9.768s |

The branch median was 0.180s lower, or 2.66%. This small sample does not establish
a speedup beyond ordinary network and database variance. Neither batch failed;
these measurements do not assess retry behavior during gateway failures.

All 12 responses were HTTP 200, confirmed cache bypass, and contained identical
report bytes. Private reports, headers, and JSON timings are stored locally under
`scripts/.cache/daily-stats-benchmark/branch-f75d7b5-18kl2C/` and
`scripts/.cache/daily-stats-benchmark/main-fd5ceb8-kF24vB/`.

## Verification

The original branch was restored and the activity cache SHA-256 was unchanged.
`pnpm fixall`, `pnpm type-check`, all six daily-stats test files, and the runner's
syntax and file-scoped Biome checks passed. The six test files contain 98 tests,
including 12 cache-bypass and production-authentication regression cases.
