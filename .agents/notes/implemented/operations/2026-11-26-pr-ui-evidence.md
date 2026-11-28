# Agent Note: UI evidence on pull requests

Status: implemented — PR guidance reuses CI comparisons and calls for local captures when needed.

## Problem

Reviewers need to see changes in the running app. Repeating a comparison that
CI already captures adds time to each UI change.

## Decision

The [PR guidance](../../../../AGENTS.md#pull-requests) uses existing Playwright
and Argos comparisons where they show the change. The agent-browser CLI
captures one-off interactions and states outside that coverage.

## Alternatives considered

- An agent-browser streaming client would add frame handling and video encoding.
  The CLI already produces screenshots and clips.
- A dedicated base/head runner could standardize captures. Existing fixtures
  and the CLI are enough while the flows vary by change.

## Consequences

When the PR's E2E run captures the affected state, its Argos build supplies
the comparison. For a one-off comparison, the agent still needs equivalent
data and browser settings on both revisions.
