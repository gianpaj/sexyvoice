# Gemini TTS Credit Investigation Design

Date: 2026-08-12  
Status: Approved

## Goal

Make Gemini TTS error and credit investigations repeatable for a human engineer
directing Codex, Claude, or another coding agent while keeping production access
read-only.

## Design

Use `scripts/README.md` as the agent-neutral source of truth. It contains the
investigation sequence, commands, evidence standards, reporting format, and
cleanup requirements.

Use `skills/investigate-gemini-tts-credit-report/SKILL.md` as a concise
agent-facing wrapper. It triggers for the relevant reports, enforces read-only
guardrails, directs the agent to the canonical runbook, and defines the required
output. It does not duplicate changing command details.

Keep `scripts/find-truncated-gemini31-tts.mjs` focused on deterministic
transcript-duration triage. Bound scans by both start and end timestamps, and
label results as heuristic candidates requiring independent confirmation and
human approval before a refund.

## Log Sources

Use Sentry structured logs as the primary source for application errors and
handled Gemini failures. Query the production project with `sentry-cli logs
list`, organization `sexyvoiceai`, and project `4509116876193872`. Bound the
query by exact UTC timestamps and search first by `user.id`. Refine the results
by message, level, model, provider response ID, and credit reconciliation
context. Do not restrict the first query to `level:error`; the application logs
some handled Gemini failures at `warn`.

Use Vercel logs only when Sentry has no matching evidence, a request may have
failed before application logging, or the investigation needs platform HTTP or
request metadata. Treat Vercel-only timestamp correlations as inferences unless
a request ID, response ID, or artifact ID joins the records.

The runbook must state that `sentry-cli logs` is a beta interface and that the
investigator should confirm its installed help before adapting a query after a
CLI change.

## Evidence Rules

- Reconcile the stored ledger independently of request or audio quality.
- Correlate Sentry logs, database records, and stored artifacts before assigning
  an outcome. Use Vercel only for the documented fallback cases.
- Separate proven billing defects, confirmed delivered-audio defects, suspected
  quality problems, clean findings, and inconclusive cases.
- Describe `silencedetect` results as time below an explicit amplitude threshold,
  not literal silence.
- Never let a heuristic alone authorize a production write or refund.

## Validation

- Validate the skill structure with the skill validator.
- Exercise a scoped, read-only Sentry query against the configured organization
  and project.
- Syntax-check and exercise the detector's help and time-bound validation paths.
- Review documentation links, commands, safety language, and working-tree scope.
