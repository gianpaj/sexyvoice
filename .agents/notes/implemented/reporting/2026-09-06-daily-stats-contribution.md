# Daily stats usage contribution

Lifecycle: implemented.

The report compares collections after cash refunds against measured usage for
paid and free customers. Definitions and limits live in
[daily-stats README](../../../../apps/web/app/api/daily-stats/README.md).

Recorded costs plus supported model-specific estimates preserve useful telemetry
without treating unknown costs as zero. A blanket credit multiplier was rejected
because user credit pricing is not provider cost. Invoice reconciliation and a
shared cross-repository package are deferred.

Usage events remain primary for ordinary calls by both free and paid customers.
Session-only estimates cover short calls and missing inserts. Cross-window ID
lookups prevent duplicate session estimates. Customer status follows the first
cash purchase timestamp; this does not track promotional-credit provenance.

The local activity cache stores contribution usage with the credit transactions
read alongside it, so a cached report never mixes stale costs with newly
recorded usage. Existing 14-day activity reads retain their window; contribution
keeps its own 30-day usage read rather than widening theirs.

Provider references confirm explicit call model rates and Gemini token rates.
Call duration estimates exclude text/tool charges; stored call costs can use
customer billing buckets. Unknown model/dimension combinations remain visible.

Verification is covered by aggregation/cost tests and mocked query tests.
