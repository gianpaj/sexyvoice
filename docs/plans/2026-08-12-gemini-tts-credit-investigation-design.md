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

## Evidence Rules

- Reconcile the stored ledger independently of request or audio quality.
- Correlate Vercel logs, database records, and stored artifacts before assigning
  an outcome.
- Separate proven billing defects, confirmed delivered-audio defects, suspected
  quality problems, clean findings, and inconclusive cases.
- Describe `silencedetect` results as time below an explicit amplitude threshold,
  not literal silence.
- Never let a heuristic alone authorize a production write or refund.

## Validation

- Validate the skill structure with the skill validator.
- Syntax-check and exercise the detector's help and time-bound validation paths.
- Review documentation links, commands, safety language, and working-tree scope.
