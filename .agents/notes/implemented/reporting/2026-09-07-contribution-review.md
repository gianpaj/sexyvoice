# Contribution review

Lifecycle: implemented.

Coverage remains incomplete for any unpriced or unclassified record. The alert
uses a separate threshold of more than 5% unpriced records, or any unclassified
usage. Record share limits alert noise; it does not estimate missing dollars.
A generic Replicate credit/character rate was rejected because it would imply
provider-cost coverage without model-specific evidence.

ID lookups use four concurrent 100-ID batches per lookup. Small batches avoid
large UUID filter URLs; bounded concurrency avoids an unbounded database burst.
Sessions matched to in-window events need no additional cross-window link query.

Cross-window calls follow the usage event timestamp. An adjacent-period test
checks that the event cost is counted once. Assigning those costs to session end
time would change the agreed reporting definition.

Contribution usage stays paired with the purchase history read alongside it:
both fresh, or both from the same local cache. Pairing fresh usage with cached
transactions could misclassify customer usage or understate collections.

API source types reach pricing unchanged. Linked audio token counts win over
event metadata, with validated metadata used for missing linked counts.
Unused diagnostic aggregation fields are removed; reporting definitions live in
the daily-stats README.
