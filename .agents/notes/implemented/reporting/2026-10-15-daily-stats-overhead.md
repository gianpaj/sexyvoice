# Daily stats overhead

## Decision

Use a checked-in invoice baseline to estimate daily infrastructure overhead.
The owner accepts recent invoice averages despite monthly fluctuations and
confirms all Vercel, Fly.io, and Cloudflare charges belong to SexyVoice.
Fly.io belongs specifically to the voice-call server.

The baseline uses July–September invoices from the owner's `Purchases 2026`
CSV export, including the annual Fly.io reservation spread over twelve months.
See [the daily-stats README](../../../../apps/web/app/api/daily-stats/README.md#overhead-estimates)
for sources, allocation rules, confirmed free services, and the Vercel refund
ambiguity. `overhead-costs.json` is the canonical numerical baseline.

Subtract overhead from contribution. Include overhead when deciding whether
costs exceed collections.
Keep provider overhead detail in the feature README rather than repeating it
in the Telegram report.

## Alternatives and consequences

- Reject adding AI-provider monthly totals to estimated usage: they overlap.
- Reject runtime Google Sheets access: a manual baseline needs no credentials,
  external availability, or billing integration.
- Use a stable annualized daily average rather than varying it with month length.
  Historical report dates use this baseline, not reconstructed invoices.
- Keep unconfirmed expenses outside the baseline. The source invoice averages
  remain estimates and need periodic review.

## Verification

Focused daily-stats tests cover overhead on idle days, negative contribution,
call-server attribution, and unrounded allocation
across a 30-day month boundary.

All 102 focused daily-stats tests pass. `pnpm fixall` and `pnpm type-check`
pass across the workspace.
