# Feedback for calls and generated audio

Let users rate a finished call or the exact audio they generated. Start with the
call-ended screen for linked Inworld calls, then add thumbs up and down beside
the result players on Generate and Clone. [Linked calls PR #712](https://github.com/gianpaj/sexyvoice/pull/712) · [Audio ratings issue #228](https://github.com/gianpaj/sexyvoice/issues/228)

Dashboard ideas and Crisp support have their own entry point in the dashboard
feedback proposal. [GitHub #135](https://github.com/gianpaj/sexyvoice/issues/135)

## Phase 1. Shared storage and submission

Create a Supabase `feedback` table with `user_id`, `rating` (`up` or `down`),
optional `reason_code` and `note`, and `created_at` and `updated_at`.

| Rating target                            | Foreign key                            |
| ---------------------------------------- | -------------------------------------- |
| A finished call                          | `call_session_id` → `call_sessions.id` |
| A TTS result or a generated clone result | `audio_file_id` → `audio_files.id`     |

- Require exactly one target. Enforce one rating per user per target in the
  database. Update the existing row when the user changes their rating or
  retries a submission.
- Use one authenticated dashboard endpoint. Resolve the target on the server,
  verify ownership and eligibility, and validate the rating, reason, and note.
  Enable row-level security for the user's own feedback and keep writes behind
  the endpoint. Return the saved rating so the control can show its active state.
- Store the report fields and target ID. Cascade feedback removal on a hard
  delete of either target. Explicitly erase the user's feedback during account
  deletion, which retains call rows and soft-deletes audio.

## Phase 2. Linked Inworld calls

- Put a **Rate call** menu under the duration on the call-ended screen. Show it
  after a connected call ends for the existing linked Inworld cohort. Users can
  skip it and go straight to **Chat** or **Call again**.
- **Good call** saves a thumbs up and shows **Thanks for the feedback**. **Leave
  feedback** opens **What went wrong?** in a bottom sheet on mobile and a dialog
  on desktop.
- Offer **Misheard me**, **Interrupted me**, **Audio sounded off**,
  **Conversation felt awkward**, **Call dropped**, and **Something else** as
  single-select reasons.
  Show an optional note for **Something else** and use **Send feedback** to
  submit. Keep the form available for retry if the save fails.
- Resolve the ended call by its LiveKit room reference and store its session ID.
  If the worker is still finalizing the call, allow the user to retry with the
  same call reference. **Call again** gets its own rating.

## Phase 3. TTS results on Generate

- Make the persisted `audio_file_id` available to the result player for both
  JSON and streamed generation responses. The JSON path currently saves the
  audio row after responding. [Generate route](../apps/web/app/api/generate-voice/route.ts#L1084)
- On a cache hit, offer the rating when the server can resolve a saved file row
  owned by the caller. Cache hits can return audio without creating a row for
  that user. In split mode, rate each saved segment beside its own player.
  [TTS cache path](../apps/web/app/api/generate-voice/route.ts#L592)
- Add thumbs up and down beside playback. Give each button an accessible label
  and show the saved selection. Use the shared endpoint and localize the labels
  and status messages.

## Phase 4. Generated audio on Clone

- Make the saved `audio_file_id` available when Clone finishes and reuse the
  Generate controls beside the output player. The feedback target is the audio
  rendered from the user's text, including output from a saved cloned voice.
  [Clone route](../apps/web/app/api/clone-voice/route.ts#L1169)

## Phase 5. Verification and rollout

- Apply the migration with `supabase migration up --local` and run `pnpm test:db`.
  Cover target constraints, account erasure, and concurrent retries. Test the
  endpoint for signed-out users, another user's targets, and invalid input.
- Check desktop and mobile submission, selected state, and retry. Verify two
  consecutive calls get distinct ratings. Exercise JSON and streamed TTS,
  cached audio with and without an owned row, split segments, and Clone output.
  Run `pnpm fixall`, `pnpm type-check`, `pnpm check-translations`, and the focused
  web and Playwright tests.
- Land shared storage and call feedback on the branch for PR #712. Apply the
  schema before deploying the endpoint. Ship the Generate and Clone controls
  as the follow-up for #228 once the shared endpoint is available.
