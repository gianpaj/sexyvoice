# Browser call recording

## Scope

Add optional call recording at `/dashboard/call?record=1`. The user clicks
Record, Stop, and Download to save one file containing their microphone and
the received agent audio. Call termination finalizes an active recording and
leaves its download available while the call page stays mounted.

Recording files stay in browser memory. This change adds no uploads, backend
routes, database writes, Egress jobs, dependencies, or environment variables.
Native sharing, public links, pause/resume, audio conversion, and recording
history are outside scope. Leaving or reloading the page discards the file;
memory use grows with recording duration.

Status: proposed. Implementation belongs on `codex/browser-call-recording`,
stacked on `feat/voxtral-3-comparison`.

## Existing code and references

- `apps/web/components/call/chat.tsx` survives call disconnects; its keyed
  `SessionControls` child unmounts. Recording state must live outside that child.
- `apps/web/components/call/room-wrapper.tsx` supplies the LiveKit room and
  sets `stopMicTrackOnMute: true`. Unmuting can replace the browser mic track.
- `apps/web/hooks/use-media-recorder.ts` serves Clone and accepts a custom
  stream. Its stop path removes listeners before asynchronous final events.
- `apps/web/lib/playground-state-helpers.ts` preserves unrelated query params,
  so character selection should retain `record=1` without changing URL policy.
- [LiveKit LocalTrackRecorder](https://docs.livekit.io/reference/client-sdk-js/classes/LocalTrackRecorder.html)
  wraps one local track. It does not mix caller and agent audio.
- [MDN mixer-output recording sample](https://github.com/mdn/webaudio-examples/blob/main/create-media-stream-destination/index.html)
  demonstrates `AudioContext.createMediaStreamDestination()` with `MediaRecorder`.
- [MediaRecorder format detection](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static)
  supports runtime selection of the output container and codec.

## Implementation

### 1. Make the shared recorder finalize reliably

- [ ] Keep final `dataavailable`, `stop`, and error handlers attached until
      finalization. Make repeated Stop calls harmless and deliver one result.
- [ ] Catch constructor and start failures. Clear stale recorder and stream
      references so a later take can use a fresh custom stream.
- [ ] Keep stream ownership explicit: release acquired microphone tracks for
      Clone, but leave caller-supplied tracks to their owner. Clean up listeners
      on failure and unmount without late React updates.
- [ ] Preserve Clone's existing API and verify its microphone recording path.
      Reuse this hook for call recording rather than duplicate chunk handling.

### 2. Mix the existing LiveKit audio tracks

- [ ] Add `apps/web/lib/call-audio-mixer.ts` for the Web Audio graph and cleanup.
      Create and resume its AudioContext from the Record click. Connect each
      source to one stable MediaStreamAudioDestinationNode for the entire take.
- [ ] Use the published local microphone's `mediaStreamTrack` and subscribed
      remote audio tracks directly. Do not request another microphone, capture
      the screen, inspect audio elements, or route the mic to speaker output.
- [ ] Reconcile sources when tracks subscribe, unsubscribe, mute, unmute, end,
      restart, change device, or change processor. Compare underlying browser
      track identities as well as publications; a publication can retain its ID.
- [ ] Remove muted sources and add replacements without restarting the
      recorder or changing its destination stream. Record received call audio
      once, independently of how many RoomAudioRenderer components are mounted.
- [ ] Disconnect nodes, close the AudioContext, and stop only mixer-owned
      output tracks after finalization. Never stop LiveKit-owned input tracks.

### 3. Keep recording state independent of call controls

- [ ] Add `apps/web/hooks/use-call-recording.ts` to combine room events, the
      mixer, and the shared recorder. Keep the latest completed blob and its
      object URL separate from active recording state.
- [ ] Model starting, recording, and stopping explicitly to prevent overlapping
      takes. Record is enabled during a connected call with an available audio
      source; Stop is enabled while recording. Recording starts only on click.
- [ ] Finalize on manual Stop, hangup, agent-driven termination, or terminal
      room disconnect. Keep the same take during temporary reconnects.
- [ ] Wait for the final recorder event before publishing a download or
      disposing the mixer. A failed or empty take must not replace a valid file.
- [ ] Retain the latest completed file across disconnects and subsequent calls.
      A successful later take replaces it and revokes the old object URL.
      Unmount revokes the retained URL and releases recording resources.

### 4. Add the hidden controls and translated copy

- [ ] Add `apps/web/components/call/call-recording.tsx` as a persistent sibling
      of the connection controls in Chat, outside their changing React key.
      Wrap its query-reading gate in local Suspense with a null fallback. The
      gate renders the recorder only for `useSearchParams().get('record') === '1'`;
      disabled pages must not run the recording hook.
- [ ] Show Record, Stop, Download, an accessible recording status, and a short
      browser-storage notice. Download remains enabled whenever a completed
      file exists, including after hangup and during a later call.
- [ ] Detect MediaRecorder and Web Audio support before starting. Pick a
      supported audio MIME type, preferring WebM/Opus then MP4/AAC then Ogg/Opus;
      allow the browser default when appropriate. Derive the blob MIME and file
      extension from the actual recorder output. Do not promise MP3 output.
- [ ] Use a timestamped filename without character prompts or user identifiers.
      Show localized unsupported-browser and recording errors without ending
      the call. Add copy under `call` in all six message files.

### 5. Verify behavior and document the feature

- [ ] Add focused shared-hook tests for final-chunk ordering, repeated Stop,
      failed starts, stream ownership, fresh streams, and unmount cleanup.
- [ ] Add mixer/hook tests for both audio inputs, late agent subscription,
      mute/unmute track replacement, device changes, processor changes,
      reconnects, automatic stop, empty results, and object URL cleanup.
- [ ] Add component tests proving the exact query gate, manual start, control
      states, download after SessionControls unmounts, latest-file replacement,
      and retention after a failed take or a new call. Verify preset changes
      preserve `record=1` in `tests/hooks/use-playground-state-url.test.tsx`.
- [ ] Run `pnpm fixall`, `pnpm type-check`, `pnpm check-translations`, and
      `pnpm test`. Run each changed test file during development.
- [ ] Manually check real recordings in Chrome, Firefox, and Safari: both voices
      are audible, the downloaded file plays, mute/unmute and device switching
      work, and hangup retains Download. Include a mobile Safari check where
      available. Existing call E2E mocks do not connect to LiveKit and cannot
      establish audio correctness. Record any untested browser explicitly.
- [ ] Update the real-time calls section of `ARCHITECTURE.md` with the query
      gate, manual controls, post-call download lifetime, and local-only storage.
      Update the linked decision note with implementation and verification
      results; move it to implemented only when the feature ships.

## Acceptance

Without `record=1`, the call page creates no recording resources or controls.
With the flag, a user can record both sides of a call, stop it, and download a
playable file after disconnecting. Recording leaves call playback, microphone
controls, credits, and token requests unchanged. The recording feature sends
no recorded bytes over the network.
