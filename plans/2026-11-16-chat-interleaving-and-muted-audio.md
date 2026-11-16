# In-call text and microphone mute implementation plan

Status: superseded by the
[chat-first plan](2026-11-16-chat-first-conversations-and-calls.md). Retained as
source research for microphone gating and possible later in-call interleaving.

Let callers type during an active voice call, hear the character's reply, and
switch between typed and spoken turns in one conversation. Browser microphone
mute must also stop Python from forwarding new input audio to STT.

Track delivery against [Sexyvoice #700](https://github.com/gianpaj/sexyvoice/issues/700)
and [Sexycall #92](https://github.com/gianpaj/sexycall/issues/92). Deploy the Python
support before exposing the composer in Sexyvoice. This document authorizes no
deployment and records no completed implementation or live verification.

## Scope and behavior

- Support `inworld-tts`, `mistral-tts`, and the production Grok realtime path.
  Inworld Cascade receives typed text at its configured LLM; Inworld synthesizes
  the answer. Keep the experimental Inworld realtime selector intact and cover
  its shared wiring without making its provider smoke test a production gate.
- Use LiveKit `lk.chat` for complete messages. Keep one AgentSession history,
  transcript collector, memory scope, and billing session.
- Focusing or editing the composer leaves the microphone enabled. Preserve
  voice barge-in while listening is enabled.
- Sending text interrupts an interruptible character reply and supersedes an
  unfinished audio turn. Keep already committed spoken turns in history.
- Muting stops new audio intake. Speech sent before mute can finish and receive
  a reply; a subsequent typed Send supersedes any unfinished speech turn.
- A muted call continues accepting text and playing character audio. Muting
  browser playback is a separate concern and must not change microphone state.
- Keep the existing call layout and controls; add only a compact composer and
  an in-call message area. Draft copy: `Type a message…`, `Send`, and
  `Couldn't send message. Try again.` Translate through existing locale files.
- Starting without microphone permission, text-only output, pricing changes,
  new model selectors, and a redesigned call screen are outside this change.

## Evidence reviewed

Reviewed on 2026-11-16. Sexycall source is at
`23cac3548c49c7aeeeb1f59ac57da761908bdf34`; Sexyvoice source is at
`e0b3f076bb19b09adfbf8f7648db436e4f29fd40`.

Python is locked to LiveKit Agents 1.8.11 and RTC 1.2.0. The 1.8.11 wheel is
available in the local uv cache and its source was inspected directly. Its
published tag resolves to `296f28b0198dea71211f9a5e5cb8187292ab896a`. The older
environment in the main Sexycall checkout contains 1.6.10; do not use that
environment to establish 1.8.11 behavior.

| Source                                                                                                                                                                                                                                                                                                            | Relevant implementation and use                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [LiveKit text documentation](https://docs.livekit.io/agents/multimodality/text/)                                                                                                                                                                                                                                  | Native chat topic, custom text callbacks, and independent input/output toggles.                                                                                                                         |
| [SDK 1.8.11 text callback](https://github.com/livekit/agents/blob/296f28b0198dea71211f9a5e5cb8187292ab896a/livekit-agents/livekit/agents/voice/room_io/types.py)                                                                                                                                                  | Default handling claims the user turn, awaits interruption, and schedules `generate_reply(user_input=...)`. It does not clear pending audio.                                                            |
| [SDK RoomIO](https://github.com/livekit/agents/blob/296f28b0198dea71211f9a5e5cb8187292ab896a/livekit-agents/livekit/agents/voice/room_io/room_io.py)                                                                                                                                                              | `lk.chat` is read as a complete stream. RoomIO filters by its linked participant and awaits asynchronous callbacks.                                                                                     |
| [SDK session](https://github.com/livekit/agents/blob/296f28b0198dea71211f9a5e5cb8187292ab896a/livekit-agents/livekit/agents/voice/agent_session.py)                                                                                                                                                               | `_claim_user_turn()` tracks user activity; it is not a mutex or audio-buffer reset. Disabling audio can trigger end-of-speech handling.                                                                 |
| [SDK audio input](https://github.com/livekit/agents/blob/296f28b0198dea71211f9a5e5cb8187292ab896a/livekit-agents/livekit/agents/voice/room_io/_input.py) and [input controls](https://github.com/livekit/agents/blob/296f28b0198dea71211f9a5e5cb8187292ab896a/livekit-agents/livekit/agents/voice/io.py)          | Disabling session audio detaches input; the RoomIO forwarding loop drops new detached frames. RoomIO has no application mute-state binding to reuse.                                                    |
| [SDK activity](https://github.com/livekit/agents/blob/296f28b0198dea71211f9a5e5cb8187292ab896a/livekit-agents/livekit/agents/voice/agent_activity.py) and [recognition](https://github.com/livekit/agents/blob/296f28b0198dea71211f9a5e5cb8187292ab896a/livekit-agents/livekit/agents/voice/audio_recognition.py) | `clear_user_turn()` resets pending recognition and clears realtime audio. Programmatic text generation bypasses the spoken-turn `on_user_turn_completed` hook.                                          |
| [Grok example](https://github.com/livekit/agents/blob/d256693bcb9eff2befe6eef338e19d56616cf057/examples/voice_agents/grok/grok_voice_agent_api.py)                                                                                                                                                                | Supplies `RoomOptions` to a single `session.start()`. This revision retains the example referenced by #92; the current upstream main tree omits it. It does not demonstrate text/speech overlap policy. |
| [React starter control bar](https://github.com/livekit-examples/agent-starter-react/blob/9e1fc2f40fd7ceaccbe4a872b21765b49eefea80/components/agents-ui/agent-control-bar.tsx)                                                                                                                                     | Uses `useChat().send()`, trims input, guards pending sends, and clears the draft after transport succeeds. Reuse the behavior, without copying its visual system.                                       |
| [React starter session block](https://github.com/livekit-examples/agent-starter-react/blob/9e1fc2f40fd7ceaccbe4a872b21765b49eefea80/components/agents-ui/blocks/agent-session-view-01/components/agent-session-block.tsx)                                                                                         | Combines chat and transcription messages. Its `useSessionMessages()` depends on session context; Sexyvoice uses room context.                                                                           |

Sexyvoice's installed Components React 2.9.24, Components Core 0.12.15, and
livekit-client 2.23.0 source was also inspected. `useChat().send()` sends a text
stream and adds a local message keyed by its stream ID. `useTranscriptions()`
can take the existing room. `LocalAudioTrack.mute()` stops an SDK-owned
microphone track when `stopOnMute` is enabled.

## Current application code

- [SessionManager](../src/session_manager.py) starts and replaces sessions with
  one `session.start(room=..., agent=...)` each. There is no extra manual
  RoomIO to remove. Both paths need the same explicit RoomOptions.
- Its `_session_op_lock` already coordinates replacement, warnings, and
  shutdown. Its conversation event handler stores user messages by item ID.
  Reuse those mechanisms instead of writing a second transcript or turn queue.
- `PlaygroundAgent.on_user_turn_completed()` prepares cascade recall when
  preload is incomplete. A text callback needs to share that preparation.
- [voice_pipeline.py](../src/voice_pipeline.py) creates the common STT/LLM/TTS
  session used by [Inworld](../src/inworld_voice.py) and Mistral.
- Sexyvoice `apps/web/components/call/in-call-view.tsx` already toggles
  `setMicrophoneEnabled()`. `room-wrapper.tsx` sets `audio={true}` and
  `stopMicTrackOnMute: true`. Preserve both for the approved scope.
- `call-experience.test.tsx` mocks the entire in-call view. Add direct tests of
  that view/composer; changing only those parent tests cannot verify sending.
- `apps/web/e2e/call-dashboard.spec.ts` uses mock tokens and never connects to
  LiveKit. It cannot establish provider behavior or microphone-to-STT isolation.

## 1. Establish SDK regression tests before changing behavior

Create `tests/test_call_input.py`, using the pinned SDK with fake STT, LLM,
TTS, and room events. Use existing `make_stores()` and session fixtures where
appropriate. Do not use production credentials or infer success from mocks of
`set_audio_enabled()` alone.

- [ ] Characterize default text handling during idle, character speech, and an
      unfinished STT turn. Write failing application tests for the required policy.
- [ ] Feed distinguishable audio frames and delayed STT finals. Assert what
      reaches the STT stream, which user items enter history, and how many replies
      start. Exercise end-of-speech caused by disabling audio.
- [ ] Show that programmatic text generation bypasses the spoken memory hook;
      write a failing test for incomplete-preload recall on typed input.
- [ ] Exercise the real SDK input attachment path with synthetic frames so
      the test distinguishes a stopped upstream input from hidden transcriptions.

These tests determine the exact cancellation ordering needed in step 3. Do not
claim that `_claim_user_turn()` alone prevents an audio/text race.

## 2. Bind Python input to the authenticated caller's microphone

Implement small, call-scoped helpers in `src/session_manager.py`; keep ownership
with SessionManager. Avoid a general mode controller or new configuration RPC.

- [ ] Register room listeners once per call, before starting its session.
      Retain the participant identity established by admission. Set
      `RoomOptions(participant_identity=...)` to that same caller for audio and text.
- [ ] Derive input eligibility from the current connected caller's subscribed,
      unmuted microphone publication. Missing, unpublished, unsubscribed, or muted
      microphone means disabled. Screen-share audio and other participants cannot
      enable input. A temporary typed-turn handoff also holds input disabled.
- [ ] Apply that derived value with `session.input.set_audio_enabled(...)` to
      each newly created session before its `start()`, then recompute after start.
      Use the same options and synchronization in `replace_session()`.
- [ ] Recompute on microphone publication, subscription, mute/unmute, removal,
      participant changes, and room reconnect events. Re-read current publications
      rather than storing a browser-supplied mute boolean. Closing/reconnecting
      disables intake until current track state establishes eligibility again.
- [ ] Apply mute promptly in the event callback, without waiting behind a
      warning that holds `_session_op_lock`. All enable paths must honor the same
      eligibility rule, including a text callback's `finally` block.
- [ ] Remove this call's listeners during final cleanup. Replacement must not
      duplicate listeners or leave callbacks pointing at a closed session.

Input disable prevents new source frames from being forwarded after the gate
applies. It does not recall audio already sent or promise an immediate stop to
in-flight work. Do not disable output, rebuild the call, or turn silence into
an assumption about provider billing.

## 3. Handle typed turns through the existing session

Use `RoomOptions(text_input=TextInputOptions(text_input_cb=...))` on both start
paths. Keep `lk.chat` enabled while audio input is disabled.

- [ ] Trim and reject empty messages. Proposed limits are 2,000 Unicode code
      points per message and one accepted typed send per second, measured with a
      monotonic clock. Match the frontend length rule, including non-BMP text.
- [ ] Validate the callback's participant, originating session, and current
      call state. Reject a callback from a replaced session; do not redirect it
      into a different character's history. Closing and forced call-end states
      win over queued text. Use existing `pg.toast` for best-effort rejection
      feedback, with a bounded delivery timeout and no message contents in logs.
- [ ] Enter the existing `_session_op_lock`, recheck state, and follow the
      SDK's `_claim_user_turn()` pattern across awaits. Do not create a second lock
      or background message queue.
- [ ] For the send handoff, briefly hold Python audio intake disabled, clear
      the unfinished audio turn, and await interruption. Because input disable can
      start end-of-speech work, the regression tests must also cover a delayed
      final and a turn-completion task already running at this point.
- [ ] Prepare any needed cascade memory as described below, then clear any
      remaining unfinished audio before scheduling exactly one
      `session.generate_reply(user_input=text)`. Do not append the user message
      separately. Keep realtime server-side turn detection unchanged.
- [ ] In `finally`, release the handoff hold and recompute microphone
      eligibility. A mute received during an await must stay muted. Keep this
      transition bounded; do not await the full spoken reply while holding the
      operation lock or keeping input paused.
- [ ] Prove the handoff cancels unfinished audio without deleting committed
      speech. If the SDK tests expose a remaining stale-reply race, fix the narrow
      cancellation boundary before shipping; do not patch provider internals or
      accept duplicate replies as the overlap policy.

Extract the existing memory preparation into one PlaygroundAgent helper that
both spoken-turn handling and the cascade text callback can await. Reuse the
same search, stable memory-block ID, replacement semantics, and 1.5-second
timeout. Complete preload and memory-off calls do no search. Realtime retains
its recall tool. Do not change memory instructions or extract facts mid-call.

Continue using `conversation_item_added` for persisted text turns and normal
LLM/TTS usage reporting. Check the shutdown transcript and memory extraction
input contain each accepted typed turn once. Do not add user text to
`_injected_prompts`, which identifies agent-authored prompts.

## 4. Add the minimal Sexyvoice composer and message display

Work in a suitable Sexyvoice feature worktree when implementation starts.
Primary targets are `apps/web/components/call/in-call-view.tsx`, a small
`call-message-input.tsx` if needed, locale files, and direct component tests.

- [ ] Use `useChat()` from the installed package. Send only on explicit
      submission, over `lk.chat`. Do not send through `pg.updateConfig`, expose
      provider credentials, or construct a second model request in the browser.
- [ ] Disable sending until the room and agent are ready, during transport,
      during the short send cooldown, and for blank or oversized input. Guard
      double clicks synchronously. Enter sends, Shift+Enter inserts a newline,
      and Enter during IME composition does not send.
- [ ] Keep the draft on transport failure; clear it only after send resolves.
      A successful transport is not a model-acceptance acknowledgement. Surface a
      backend rejection through the existing toast mechanism; do not automatically
      retry an ambiguously delivered message.
- [ ] Display typed messages alongside spoken transcripts with `useChat()`
      and `useTranscriptions({ room })`. Follow the starter's stable-ID updates
      and room-scoped lifetime. Filter to the local caller and selected agent,
      update partial transcriptions in place, and retain interrupted reply text
      only to the extent forwarded by LiveKit.
- [ ] Use a small room-based merge helper if needed. Do not introduce a
      SessionProvider migration to obtain the starter's `useSessionMessages()`.
      Render text safely with the existing app conventions and avoid adding a
      markdown-rendering dependency.
- [ ] Leave microphone control independent of composer focus, typing, send
      success, and send failure. Preserve its SDK track toggle and
      `stopMicTrackOnMute`. Keep the draft/message state mounted across a transient
      reconnect, and clear it when the call ends or a new call starts.
- [ ] Check the composer and message area at desktop and mobile widths,
      including an open mobile keyboard, without moving existing call controls
      into a new design.

## 5. Verification and acceptance

Automated Python coverage must include:

- [ ] Idle text, text interrupting character speech, and text during pending
      audio each yield one typed reply and one stored typed turn.
- [ ] A mute before startup, a mute during startup, late track publication,
      unmute, device replacement, unpublication, reconnect, and session replacement
      all produce the derived audio eligibility. Unrelated participant/track events
      have no effect, and listeners disappear on cleanup.
- [ ] Distinguishable post-gate frames do not reach fake STT; unmuting resumes
      fresh input. Muted typed replies still reach the fake LLM and TTS.
- [ ] Mute during the text handoff, cancellation, delayed STT finals, and a
      config replacement or shutdown competing for the lock cannot reopen audio,
      append text to the wrong session, or create an extra reply.
- [ ] Scoped recall works for typed cascade input with incomplete preload.
      Memory-off and complete-preload calls do not search. Search failure still
      permits the text reply, and transcript/memory flush retains accepted text.
- [ ] Inworld and Mistral use their existing LLM/TTS wiring. Grok keeps its
      existing realtime model and server-side turn detection. Credit metering,
      provider usage recording, and first-speech billing behavior remain intact.

Frontend tests must exercise the actual in-call view and verify topic and
payload, whitespace and length handling, IME/newlines, pending/double submit,
failed-send draft retention, independent mic state, stream-ID updates, and
call lifecycle cleanup. Parent tests alone are insufficient. Inspect the
Playwright suite and E2E test plan; add browser assertions only where the
existing mock harness can exercise the real connected UI.

Run focused tests during TDD, then the required repository checks:

```sh
# Sexycall
uv run pytest tests/test_call_input.py tests/test_call_sessions.py tests/test_memory.py tests/test_inworld_voice.py tests/test_mistral_voice.py tests/test_voice_pipeline.py
uv run ruff check
uv run ruff format --check
uv run pytest

# Sexyvoice, from its repository root
pnpm --filter @sexyvoice/web test -- tests/components/call/in-call-view.test.tsx
pnpm fixall
pnpm type-check
pnpm test
pnpm check-translations
```

Review formatter changes for unrelated edits. Run applicable Playwright cases
using the repo's documented setup. Memory extraction live tests and opener
evals are unnecessary unless implementation also changes their prompts/models.

Before exposing the UI, make controlled real calls with Inworld Cascade and
Grok on desktop and mobile. Cover speech → text → speech, interruption, mute →
text → unmute, overlap at Send, and reconnect while muted. Include a sustained
mute of at least two minutes to detect STT idle-timeout/retry problems. Verify
Inworld's saved voice still works and perform a Mistral check where provider
access permits. Mocked browser tests cannot replace these calls.

Measure forwarding at the STT adapter boundary using counts/durations, never
recordings or text. Expect no ongoing new-frame forwarding during mute after
in-flight work settles. Check that the call does not fail or retry continuously
while muted and that unmute resumes without replaying muted-period audio. If
idle STT needs suspension, use the SDK's documented STT-node lifecycle and add
the regression test; keep the same LLM/TTS session and avoid provider-private
patches. Report actual live results separately from automated tests.

## 6. Delivery and limits

- Open paired, ready-for-review PRs for the agent and frontend when each is
  implemented and verified. Link #92 and #700 and name the shared contract.
- Ship the compatible agent before the frontend. Smoke-test agent input
  gating with the existing voice UI first, then expose typed input.
- No new secrets, environment flags, database tables, or migrations are
  required by this design. Keep minute-based customer pricing unchanged.
- Stopping audio forwarding does not establish zero provider spend. Preserve
  unknown/missing usage as unknown; never fabricate zero STT usage to obtain a
  complete cost estimate. Missing-STT accounting can remain a separate task.
- The original decision is retained in the [rejected Agent Note](../.agents/notes/rejected/feature/2026-11-16-in-call-text-and-microphone-mute.md).
  The chat-first proposal owns the current scope and microphone requirements.
