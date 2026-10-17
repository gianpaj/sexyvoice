# Review-only Long Gemini TTS Detection

## Context

`scripts/find-truncated-gemini31-tts.mjs` finds audio that is too short for its
stored transcript. The same duration comparison can reveal output that is much
longer than expected. Long output is a quality signal, not proof of a billing
defect, so it must not increase refund exposure.

## Detection

Add `--long-factor <n>` with a default of `2`. For clips covered by the existing
`--min-chars` guard, flag an output when:

```text
actual duration > expected duration * long factor
expected duration = spoken characters / normal cps
```

Evaluate categories in this order:

1. Unknown duration
2. Zero or negative duration
3. Truncated output
4. Abnormally long output
5. Unflagged output

Record the ratio of actual to expected duration so reviewers can judge the
severity of each anomaly.

## Output and refund policy

Print long outputs in a separate `REVIEW-ONLY LONG OUTPUTS` table. Add them to
the JSON report as `abnormallyLong` and include their count in the summary.

Keep long outputs out of the per-user refund rollup, candidate credit exposure,
and generated refund commands. The report must state that these anomalies need
artifact review and cannot independently justify a refund.

## Documentation

Update the script header and `scripts/README.md` with the new option, detection
rule, report fields, and review-only policy.

## Verification

Check the script's syntax and help output. Exercise the classification logic
with representative normal, truncated, abnormally long, unknown-duration, and
short-transcript cases. Confirm that long outputs never enter refund plans.

## Non-goals

- Do not analyze silence or audio content.
- Do not infer that a long output is defective.
- Do not automate refunds for long outputs.
- Do not add cohort-based statistical detection.
