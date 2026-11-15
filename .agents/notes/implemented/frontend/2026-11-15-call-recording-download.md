# Agent Note: Browser call recording and download

Status: implemented — users record calls locally and download them at the end

## Problem

Users had no way to keep a call's audio. The agent stores the transcript only.

## Decision

`useCallRecording` in `apps/web/hooks/use-call-recording.ts` records a call
in the browser when the user asks. The in-call Record button opens a menu with
Voice only and Voice and video; while recording, the same button stops it. The
recording also stops when the call ends or a recorder reports an error.

- One `AudioContext` merges the local microphone track into the left channel
  and the agent's audio track into the right. A `MediaRecorder` writes that
  stereo mix to the audio file.
- In video mode, an off-DOM 720×720 canvas redraws the in-call screen each
  animation frame: avatar, a violet halo that grows with the mixed voice
  level, the name, the recording time, and `sexyvoice.ai`. A second
  `MediaRecorder` records the canvas stream plus the same audio. Safari ends a
  recording when a track is added to a running recorder, so each file has its
  own recorder.
- Source nodes reconnect when LiveKit replaces a track, for example after a
  microphone switch.
- `CallEndedView` shows Download audio and Download video links to blob URLs.
- Files belong to one call. A new call or a new recording revokes and clears
  them. Recorders report after they stop, so each recording has a token, and
  a report from a replaced recording, or after unmount, is dropped.
- Starting is all or nothing: if the video part fails, the audio recorder
  stops and the `AudioContext` closes.

The pattern follows Haru's conversation recorder
(`higurashi-ai/Haru`, `client/src/pages/Conversation`).

## Alternatives considered

- **Record every call automatically.** No extra control, but users did not
  ask to record every call, and the video costs memory and CPU for the
  whole call. Recording is opt-in, and video is a separate choice.
- **Server-side recording with LiveKit Egress.** This stores intimate audio
  on our infrastructure and needs retention, storage, and billing rules. The
  browser already has both tracks.
- **webm first with `webm-duration-fix`.** Chrome's webm output has no
  duration, so players cannot seek. Chrome 126+ and Safari record mp4, which
  needs no extra dependency. Firefox still records webm without a duration.

## Consequences

- No upload, storage, or privacy surface: the files exist only in the tab.
- Recordings stay in memory until download, with no length limit. The video
  is capped at 1 Mbps, about 450 MB an hour at most; the mostly static frame
  encodes far below that.
- Browsers throttle `requestAnimationFrame` in background tabs, so the video
  freezes while the tab is hidden. The audio keeps recording.
- Firefox webm files have no duration metadata.
- Browsers without `MediaRecorder` or `AudioContext` do not show the Record
  button. If the recorder fails to start, the button returns to Record and a
  warning is logged.
