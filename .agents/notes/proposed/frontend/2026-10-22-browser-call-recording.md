# Browser call recording

## Decision

Use Web Audio to mix existing LiveKit microphone and received audio tracks,
then record the mixed stream through the shared `useMediaRecorder` hook.
Keep state in a persistent recording component under Chat, outside the keyed
connection controls. This lets a completed download survive call disconnects.

The implementation contract and verification checklist are in the
[browser recording plan](../../../../plans/2026-10-22-browser-call-recording.md).
The feature is proposed; implementation and audio verification are pending.

## Rationale and alternatives

Reusing the shared recorder avoids a second implementation of blob collection
and finalization. Its stop handlers must remain attached through the browser's
final events. The fix also needs Clone regression coverage because Clone is
an existing caller.

LiveKit's LocalTrackRecorder accepts one local track and still requires mixing
for this use case. Egress requires server recording and storage, which exceed
the requested browser-only scope. Screen or tab capture would add a permission
prompt even though both required audio tracks are already available.

## Consequences

Only `record=1` reveals the controls; recording requires a click. Downloads
remain local and last until replacement or page unmount. A reload loses the
file. Long recordings use more browser memory. MIME negotiation determines
the file format, and real browser checks must verify both speakers and track
replacement before release.
