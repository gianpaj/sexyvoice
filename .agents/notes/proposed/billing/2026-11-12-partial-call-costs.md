# Partial call costs in Daily Stats

Daily Stats includes validated known provider components as a lower bound when
an Inworld or Mistral call lacks a complete cost. The call stays unpriced.
Recorded totals and supported duration estimates take precedence. Realtime
subtotals are excluded because they repeat the individual components.

The November 11 report has ten customer calls with incomplete cost coverage:
four manually closed Grok calls without measured duration, one zero-duration
Grok call, and five Inworld calls without final speech usage. Four of the Inworld
usage events were discarded because they had no customer credit charge and no
complete price. Their numeric usage snapshots survive in Axiom.

Sexycall finalizes one cumulative usage event per call, including replacement
sessions. Daily Stats deduplicates linked retries, preferring complete costs and
then the latest snapshot. Metering heartbeats write only the credit ledger.

Provider-cost snapshots must be server-written. All application usage inserts
use the admin client; Sexycall uses its service-role key. The permission
migration removes the client INSERT policy and revokes INSERT from PUBLIC,
anon and authenticated. The existing owner SELECT policy and service-role
INSERT access remain. This also prevents a forged retry from replacing a real
cost in Daily Stats.

Historical restoration uses retained numeric usage, never conversation text or
cleanup timestamps as a substitute for missing provider measurements. Missing
speech usage keeps totals NULL. Cached-input repricing changes provider-cost
estimates, never customer credits. Database changes require user approval. All 82 pgTAP assertions pass against
an isolated local database with the permission migration applied. Production
migration and historical repair are pending separate approval.
