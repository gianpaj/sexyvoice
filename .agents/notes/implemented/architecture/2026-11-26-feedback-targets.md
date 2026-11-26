# Agent Note: Feedback targets

Status: implemented — calls and generated audio share the feedback table

## Problem

A call rating must identify the call the user just ended. A Generate or Clone
rating must identify the exact audio the user played. A character, voice,
conversation, or cache URL can be shared by multiple results.

## Decision

`feedback` uses a foreign key to either `call_sessions` or `audio_files` and
allows one rating per user and target. Generate and Clone share the audio
target. The dashboard endpoint authenticates the caller and `save_feedback`
checks target ownership before saving in the same transaction.

## Alternatives considered

- Store a rating on each target table. That duplicates reason, note, and access
  rules across calls and audio.
- Store a target type and an unchecked ID. That would move target integrity
  and hard-delete cleanup into application code.

## Consequences

Hard deletion of a call or audio row cascades to its feedback. The
[account cleanup](../security/2026-11-13-account-content-cleanup.md) explicitly
deletes the user's feedback for retained rows. A new target table needs a
migration so its reference and deletion behavior stay enforceable in Postgres.

Cache hits resolve the newest active row with the caller's user ID, storage key,
and audio URL. Playback can still succeed without a matching row. An audio
result can be rated when its generation response includes a saved file ID.
