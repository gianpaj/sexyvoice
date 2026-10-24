# Claude publication probes

Status: implemented for review; live validation requires merge to the default branch.

## Decision

Use two explicit dispatch modes in the existing Claude workflow: a posting-only
smoke test, followed by a plain-instruction review/delegation comparison.
Preserve the normal slash-command path, authentication, tool permissions, pinned
commits, and authoritative publication check. Use a separate diagnostic marker
for smoke comments so they cannot count as completed reviews.

Publish only fixed-label diagnostic aggregates. Registration, tool requests,
final-response presence, and marker detection separate prompt/delegation failures
from publication failures without exposing execution contents.

## Constraints and alternatives

- The pinned SDK lets Actions debug mode override full-output suppression. Set
  `ACTIONS_STEP_DEBUG=false` on the review action as well as disabling full output.
- Dispatch has no PR entity context. Restore its eight sensitive configuration
  paths from the trusted workflow SHA before starting a direct review. Smoke
  uses trusted workflow code and does not install target-PR dependencies.
- Dispatch lacks the action-provided inline-comment server. The comparison is
  about top-level publication and delegation, not identical effective tools.
- Reject blanket permissions and raw trace artifacts: neither is justified by an
  SDK success, an unclassified denial, or an absent publication request.
- Defer workflow-owned assessment publication until a validated completion
  contract distinguishes a finished review from an ordinary final response.

Operating commands and output semantics are canonical in
[deployment verification](../../../../docs/devops.md#controlled-claude-publication-probes).

## Verification

Synthetic tests execute the inline workflow programs, check privacy sentinels,
and restore configuration in disposable Git repositories, including a symlink
case. No live dispatch is run before merge; the App-token service validates
workflow content against the default branch.
