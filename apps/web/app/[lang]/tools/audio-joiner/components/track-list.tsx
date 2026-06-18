'use client';

import { TrackRow } from './track-row';

interface TrackItem {
  durationSec: number;
  endSec: number;
  id: string;
  name: string;
  startSec: number;
  url: string;
}

interface TrackListProps {
  currentTimeSec?: number;
  disabled?: boolean;
  onDelete: (trackId: string) => void;
  onDurationReady: (trackId: string, durationSec: number) => void;
  onMoveDown: (trackId: string) => void;
  onMoveUp: (trackId: string) => void;
  onSeek: (globalTimeSec: number) => void;
  onTrimChange: (trackId: string, startSec: number, endSec: number) => void;
  tracks: TrackItem[];
}

/**
 * For each track, compute what percentage (0–100) of its full waveform width
 * the global playhead sits at, or `null` when the playhead is outside the
 * track's active (trimmed) window.
 *
 * The "global timeline" is the concatenation of each track's trimmed region
 * [startSec, endSec] in order.  `currentTimeSec` is an offset into that joined
 * sequence.  The returned value is passed directly to `TrackRow`'s
 * `playheadPct` prop and used as a CSS `left` percentage.
 */
function computePlayheadPercents(
  tracks: TrackItem[],
  globalOffsets: number[],
  currentTimeSec: number,
): (number | null)[] {
  return tracks.map((track, index) => {
    const trimmedDuration = track.endSec - track.startSec;

    if (trimmedDuration <= 0 || track.durationSec <= 0) {
      return null;
    }

    const trackGlobalStart = globalOffsets[index];
    const trackGlobalEnd = trackGlobalStart + trimmedDuration;

    // Playhead is not yet in this track, or has already passed it.
    if (currentTimeSec < trackGlobalStart || currentTimeSec > trackGlobalEnd) {
      return null;
    }

    // How far into the trimmed region is the playhead?
    const localSec = track.startSec + (currentTimeSec - trackGlobalStart);

    // Express as a percentage of the full (untrimmed) waveform width.
    return (localSec / track.durationSec) * 100;
  });
}

/**
 * Pre-compute the global timeline offset (in seconds) at which each track's
 * trimmed region begins — i.e. the sum of trimmed durations of all preceding
 * tracks.
 */
function computeGlobalOffsets(tracks: TrackItem[]): number[] {
  return tracks.reduce<{ offsets: number[]; sum: number }>(
    (acc, track) => ({
      offsets: [...acc.offsets, acc.sum],
      sum: acc.sum + Math.max(0, track.endSec - track.startSec),
    }),
    { offsets: [], sum: 0 },
  ).offsets;
}

export function TrackList({
  tracks,
  disabled = false,
  currentTimeSec = 0,
  onMoveUp,
  onMoveDown,
  onDelete,
  onTrimChange,
  onDurationReady,
  onSeek,
}: TrackListProps) {
  const globalOffsets = computeGlobalOffsets(tracks);
  const playheadPercents = computePlayheadPercents(
    tracks,
    globalOffsets,
    currentTimeSec,
  );

  return (
    <div className="space-y-4">
      {tracks.map((track, index) => (
        <TrackRow
          canMoveDown={index < tracks.length - 1}
          canMoveUp={index > 0}
          disabled={disabled}
          durationSec={track.durationSec}
          endSec={track.endSec}
          globalOffsetSec={globalOffsets[index]}
          key={track.id}
          name={`${index + 1}. ${track.name}`}
          onDelete={() => onDelete(track.id)}
          onMoveDown={() => onMoveDown(track.id)}
          onMoveUp={() => onMoveUp(track.id)}
          onReady={(durationSec) => onDurationReady(track.id, durationSec)}
          onSeek={onSeek}
          onTrimChange={(startSec, endSec) =>
            onTrimChange(track.id, startSec, endSec)
          }
          playheadPct={playheadPercents[index]}
          startSec={track.startSec}
          url={track.url}
        />
      ))}
    </div>
  );
}
