# Jev review gate

## Decision

`.github/workflows/claude.yml` judges `pull_request.synchronize` changes with
`cachix/jev-action`, pinned to the v1.0.0 commit, using `TYPESAFE_API_KEY`.
Initial and explicit reviews bypass the judge. Existing draft and bot-author
exclusions apply to automatic reviews.

The gate compares the event head against the last recorded completed review.
Skipped pushes accumulate. Claude reviews the full PR using pinned base and
head SHAs, not just the incremental patch sent to Jev.

Claude posts its final assessment as a PR conversation comment. A `claude[bot]`
comment must contain the completion marker for the current workflow run/attempt,
head, and base before the workflow records its baseline in a hidden
`github-actions[bot]` PR comment. Missing completion evidence keeps the previous
baseline. Custom Claude App identities require updating this check.

## Policy and trade-offs

- Every job requires both `github.actor` and `github.triggering_actor` to be
  `gian0pa` or `gianpaj`. This includes rerunning the review job independently.
  Outsider events are skipped; a maintainer must post a fresh request rather
  than rerun an outsider-triggered event.
- Comment-triggered runs refuse fork PRs. A comment event carries no PR SHA,
  so a fork could push between the maintainer's request and the checkout that
  runs `pnpm install`. Only collaborators can push same-repo branches. The
  actor allowlist is not a sandbox for PR code.
- Scores below 0.5 skip review; scores at or above 0.5 run Claude.
- Missing/invalid judgments and gate preparation errors request review.
- Missing baselines, changed bases, rewritten history, binary patches, and
  patches over 200,000 bytes request review without sending a diff to Jev.
- Review setup runs only after the gate approves it.
- A PR runs one Claude review at a time. Newer approved reviews queue rather
  than cancel, so a push never aborts a manual review mid-comment; GitHub keeps
  only the newest pending review.
- Jev receives repository diff content through the TypeSafe API. Usage may cost
  credits; the workflow does not expose the API key in the state.
- Fork PR secret restrictions remain; do not switch this code-executing
  workflow to `pull_request_target` to bypass them.

Latest-push-only comparisons were rejected because skipped changes could be
lost. Whole-PR gating was rejected because reviewed changes would repeatedly
trigger reviews. Action success alone is insufficient completion evidence.

## Verification

Local checks cover YAML parsing, Bash syntax for workflow run blocks, and
score threshold/fallback behavior. The pinned action manifest was checked
against its published inputs. Live GitHub/TypeSafe execution is not validated
locally; the first eligible run without a baseline performs a full review.
