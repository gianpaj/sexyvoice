---
name: investigate-gemini-tts-credit-report
description: Investigate SexyVoice.ai reports that Gemini TTS or speech generation returned errors, produced missing, truncated, silent, low-quality, or otherwise defective audio, or consumed unexpected credits. Use for production incident triage, credit-ledger reconciliation, Sentry application-log correlation with Vercel as a platform fallback, and delivered-audio review for a specific user. Keep production access read-only and leave refunds to a separately approved human action.
---

# Investigate Gemini TTS Credit Reports

Investigate one user's report without modifying production. Treat the shared
runbook in `scripts/README.md`, under “Investigate Gemini TTS Errors and Credit
Charges,” as the source of truth. Read that entire section before taking action.

## Establish Scope

1. Read the repository's `AGENTS.md` and follow its production-data rules.
2. Record the user UUID and a start/end time in UTC. Add a retry buffer.
3. Record supplied request IDs, generation IDs, filenames, and error text.
4. Distinguish an error-response complaint from a delivered-audio complaint.
5. State any assumptions when the report does not provide an exact time window.

## Preserve Production Safety

- Use Sentry, Vercel, Supabase, storage, and database access only for reads.
- Inspect any ad hoc query before running it. Allow only scoped `SELECT` or
  read-only inspection commands.
- Never execute a Supabase RPC, mutation, DDL statement, refund script, or other
  production write during the investigation.
- Never expose secret values in output. Minimize PII in notes and conclusions.
- Store logs, reports, environment files, signed URLs, and downloaded audio in a
  temporary directory outside the repository.
- Preserve unrelated working-tree changes.

If the evidence supports compensation, propose an exact amount and rationale.
Do not execute it. Require explicit human approval as a separate follow-up.

## Follow the Investigation Sequence

1. Run `compile-dispute-evidence` to establish the complete ledger baseline.
2. Calculate and report the expected balance and unexplained delta.
3. Query Sentry logs for the scoped UTC window using the organization and
   project in the runbook. Start without a level filter so handled warnings are
   included.
4. Correlate attempts by user ID, timestamp, message, model, response ID,
   artifact, and credit reservation/refund context. If the user-ID query is
   empty, broaden the Sentry query by response ID, message, or model before
   falling back.
5. Query Vercel only when Sentry has no matching evidence, the request may have
   failed before application logging, or platform request metadata is needed.
   Label Vercel-only timestamp matches as inferences.
6. Classify failed/refunded, failed/unrefunded, successful/delivered,
   successful/disputed, and inconclusive attempts separately.
7. Run `find-truncated-gemini31-tts` with both `--since` and `--until` for Gemini
   3.1 artifacts.
8. Independently inspect every disputed or flagged artifact. Compare database
   metadata, stored transcript, provider token metadata, storage object, and
   matching logs. Listen to downloaded audio when necessary.
9. Classify the evidence using the runbook's evidence classes.
10. Clean up all temporary production artifacts before finishing.

Do not infer lost credits from an error response alone. Do not infer usable
audio from a successful response alone. A zero ledger delta rules out an
unexplained balance mismatch, but it does not prove that delivered audio was
usable.

## Interpret Audio Measurements Carefully

Treat transcript-duration checks and audio-energy measurements as triage
signals. Confirm defects independently.

When using `ffmpeg silencedetect`, report the measured condition, for example:
“approximately 37 seconds below -40 dBFS for at least 0.5 seconds.” Never shorten
that to “37 seconds of silence.” Quiet but audible speech can fall below the
selected threshold. Do not calculate a refund from low-energy duration alone.

## Return an Evidence Report

Include:

1. user ID, UTC window, and assumptions;
2. data sources and exact commands;
3. ledger equation, current balance, expected balance, and delta;
4. request outcomes and relevant IDs;
5. delivered artifacts reviewed and independent evidence;
6. proven findings, suspected issues, confidence, and missing evidence;
7. a proposed adjustment, if supported, explicitly marked as requiring human
   approval;
8. temporary-data cleanup performed.

Never describe a heuristic candidate as a confirmed truncation, silence period,
billing defect, or refund entitlement.
