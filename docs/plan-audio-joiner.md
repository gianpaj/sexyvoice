# Audio Joiner Tool Design Plan

Date: 2026-03-02
Status: Draft approved for implementation planning
Scope: Free `/tools/audio-joiner` browser tool (client-only FFmpeg)

## 1. Goal

Add a free audio editing tool that lets users upload one or more audio files,
trim each segment with start/end cut lines, reorder segments vertically, and
join them into one downloadable output file.

## 2. Confirmed Product Decisions

- Processing is fully in-browser with `ffmpeg.wasm` (no server uploads).
- Trim transitions are hard cuts only for v1.
- Mid-process cancel must immediately stop and discard the active join job.
- Output formats for v1: `mp3`, `wav`, `m4a`.

## 3. UX Requirements (v1)

### 3.1 Upload and list

- Users can upload 1+ audio files via drop zone / file picker.
- Uploaded segments render as waveform rows.
- Segments are stacked vertically.

### 3.2 Segment actions (right side)

Per segment row:

- Up arrow: move segment up (disabled for first row).
- Down arrow: move segment down (disabled for last row).
- Trash icon: remove the segment.

### 3.3 Trimming

- Each waveform has two draggable cut lines:
  - Start trim handle
  - End trim handle
- Each handle includes a 3-dot vertical grip affordance.
- Constraint: `0 <= start < end <= duration`.

### 3.4 Playback and controls

- Bottom-left play/pause button for preview playback.
- Space key toggles play/pause (except when focused in inputs/selects).
- Output format select: `mp3`, `wav`, `m4a`.
- `Join` button starts processing and download flow.
- `Cancel` button appears during processing and aborts immediately.

## 4. Technical Approach

## 4.1 Route and page structure

Create a new tool route consistent with existing tools:

- `app/[lang]/tools/audio-joiner/page.tsx`
- `app/[lang]/tools/audio-joiner/audio-joiner.client.tsx`
- `app/[lang]/tools/audio-joiner/audio-joiner.css`
- `app/[lang]/tools/audio-joiner/hooks/use-ffmpeg-joiner.ts`
- `app/[lang]/tools/audio-joiner/components/*`

### 4.2 Reuse strategy

- Follow architecture and metadata patterns from `audio-converter` and
  `transcribe` pages.
- Reuse installed waveform dependencies already in repo:
  - `wavesurfer.js`
  - `@wavesurfer/react`
- Reuse FFmpeg loading pattern from current `use-ffmpeg` hook, but provide
  join-specific commands, progress, and cancellation.

### 4.3 Client state model

Use a segment model similar to:

- `id: string`
- `file: File`
- `name: string`
- `durationSec: number`
- `startSec: number`
- `endSec: number`
- `waveformReady: boolean`

Global UI state:

- `segments: TrackSegment[]`
- `selectedFormat: 'mp3' | 'wav' | 'm4a'`
- `isProcessing: boolean`
- `progress: number`
- `error: string | null`
- `outputUrl: string | null`
- `isPlayingPreview: boolean`

## 5. FFmpeg Processing Flow (Browser)

1. Ensure FFmpeg core is loaded in client.
2. For each segment in current order:
   - Write original file to virtual FS.
   - Trim segment into normalized temp WAV (based on start/end).
3. Build concat list file in virtual FS using trimmed temp outputs.
4. Concatenate all trimmed segments.
5. Encode final output to selected format:
   - `mp3` via `libmp3lame`
   - `wav` via `pcm_s16le`
   - `m4a` via `aac`
6. Read output from virtual FS, create Blob URL, trigger download.
7. Cleanup FFmpeg temp files and old object URLs.

### 5.1 Cancellation behavior

- Keep a cancellable FFmpeg execution context.
- On `Cancel`:
  - terminate active FFmpeg run immediately,
  - clear in-progress state,
  - preserve edited segment list and trims,
  - do not produce output file.

## 6. Validation and Error Handling

### 6.1 Input validation

- Accept audio files only.
- Gracefully reject unsupported MIME/codec combinations.
- Require at least one valid segment to enable Join.

### 6.2 Runtime errors

Show user-friendly errors for:

- FFmpeg load failure,
- decode/trim/join failures,
- cancellation acknowledgment,
- invalid segment trim ranges.

### 6.3 Resource cleanup

- Revoke all created object URLs on removal/unmount.
- Destroy waveform instances when segment rows unmount.
- Remove temp FFmpeg virtual files after every run (success/cancel/failure).

## 7. Accessibility and Interaction

- Buttons/selects use existing shadcn primitives and keyboard support.
- Spacebar handler must not hijack typing in input/select controls.
- Icon-only controls include accessible labels (`aria-label`, `title`).
- Focus states should remain visible and consistent with project styles.

## 8. i18n, SEO, and navigation updates

- Add `audioJoiner` dictionary section in locale files.
- Add new `/tools/audio-joiner` key under pages navigation labels.
- Add tool link where tools are listed (dashboard tools, footer/tool crosslinks).
- Add page metadata and JSON-LD (`WebApplication`, `BreadcrumbList`) following
  existing tool page pattern.

## 9. Components Breakdown (planned)

- `drop-zone.tsx`: add files, drag-drop, basic validation.
- `track-list.tsx`: ordered segment container.
- `track-row.tsx`: waveform + trim handles + up/down/delete actions.
- `join-controls.tsx`: play/pause, format select, join/cancel.
- `processing-progress.tsx`: progress/error display.

## 10. Testing Strategy

### 10.1 Unit tests

- reorder logic (up/down edge cases),
- trim bound clamping,
- FFmpeg command argument builder,
- cancel state transitions.

### 10.2 Component tests

- multiple upload renders stacked rows,
- delete/reorder reflects in UI and internal order,
- format selection updates state,
- join/cancel button states during processing.

### 10.3 Manual QA

- Space toggles play/pause correctly,
- trim handles are draggable and constrained,
- cancellation works mid-run,
- output downloads and plays in all three formats.

## 11. Out of Scope for v1

- Crossfade/fade controls,
- multi-track overlap mixing,
- server-side processing,
- persistent project save/load,
- advanced timeline zoom/snapping.

## 12. Risks and Mitigations

- Large files may be memory-heavy in browser.
  - Mitigation: show practical limits and clear failure messaging.
- Codec compatibility may vary per source file.
  - Mitigation: normalize through temp WAV intermediates.
- FFmpeg cancellation API behavior can differ by core version.
  - Mitigation: encapsulate run lifecycle in join hook and test cancel path early.

## 13. Acceptance Criteria

- User can upload multiple audio files and see waveform rows vertically.
- User can reorder rows up/down and delete rows.
- User can trim each row with start/end cut handles.
- User can play/pause preview using button and Space key.
- User can choose output format (`mp3`, `wav`, `m4a`).
- User can join and download resulting file.
- User can cancel join while processing and job stops immediately.
- Tool behaves as browser-only processing (no server upload required).
