# Agent Note: In-call text and microphone mute

Status: rejected — user selected chat first and a separate voice-call mode

Superseded by [chat-first conversations](../../proposed/feature/2026-11-16-chat-first-conversations.md).
The user chose a chat entry view, explicit call start, and token-based chat
pricing. In-call typing is deferred. The original proposal follows; its SDK
research still informs microphone gating.

## Problem

Callers cannot type during a Sexyvoice call. Browser microphone mute stops
capture, but the agent has no application binding between the caller's
microphone publication and Python audio-input eligibility. Pending speech and
typed input can also compete to produce replies.

## Proposal

Use LiveKit `lk.chat` to accept typed turns in the active session and derive
Python audio-input eligibility from the authenticated caller's microphone.
Keep the browser microphone independent of typing. A typed Send supersedes
unfinished speech; muted calls retain typed input and character voice output.

The [implementation plan](../../../../plans/2026-11-16-chat-interleaving-and-muted-audio.md)
owns the source references, runtime contract, task sequence, and test matrix
for both repositories. Starting without microphone permission is outside scope.

## Alternatives considered

- A custom text RPC duplicates LiveKit's supported transport and adds a client
  contract without a demonstrated need.
- Muting on composer focus or keystrokes makes listening depend on editing and
  contradicts the approved hybrid call behavior.
- A separate chat/model session splits conversation history and memory.
- Migrating the frontend to SessionProvider solely for the starter's message
  hook expands the change; the installed room-based hooks cover the need.

## Acceptance criteria

Typed and spoken turns share history, scoped memory, and transcripts. Sending
text produces one reply, including during speech overlap. Muting prevents new
audio forwarding after the gate applies, without disabling text or voice output.
Replacement and reconnect preserve the current microphone state.

## Risks

Audio already sent can still finish recognition. Input disable can trigger
end-of-speech handling, so overlap requires SDK-level regression tests.
Programmatic text bypasses the spoken memory hook and must share its preparation.
STT idle behavior and interrupted transcripts require controlled live calls.
