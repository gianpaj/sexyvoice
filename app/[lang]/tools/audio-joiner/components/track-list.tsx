'use client';

import { useMemo } from 'react';

import { TrackRow } from './track-row';

interface TrackItem {
  id: string;
  name: string;
  url: string;
  durationSec: number;
  startSec: number;
  endSec: number;
}

interface TrackListProps {
  tracks: TrackItem[];
  disabled?: boolean;
  currentTimeSec?: number;
  onMoveUp: (trackId: string) => void;
  onMoveDown: (trackId: string) => void;
  onDelete: (trackId: string) => void;
  onTrimChange: (trackId: string, startSec: number, endSec: number) => void;
  onDurationReady: (trackId: string, durationSec: number) => void;
  onSeek: (globalTimeSec: number) => void;
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
function usePlayheadPercents(
  tracks: TrackItem[],
  currentTimeSec: number,
): (number | null)[] {
  return useMemo(() => {
    let globalOffset = 0;

    return tracks.map((track) => {
      const trimmedDuration = track.endSec - track.startSec;

      if (trimmedDuration <= 0 || track.durationSec <= 0) {
        globalOffset += Math.max(0, trimmedDuration);
        return null;
      }

      const trackGlobalStart = globalOffset;
      const trackGlobalEnd = globalOffset + trimmedDuration;
      globalOffset = trackGlobalEnd;

      // Playhead is not yet in this track, or has already passed it.
      if (
        currentTimeSec < trackGlobalStart ||
        currentTimeSec > trackGlobalEnd
      ) {
        return null;
      }

      // How far into the trimmed region is the playhead?
      const localSec = track.startSec + (currentTimeSec - trackGlobalStart);

      // Express as a percentage of the full (untrimmed) waveform width.
      return (localSec / track.durationSec) * 100;
    });
  }, [tracks, currentTimeSec]);
}

/**
 * Pre-compute the global timeline offset (in seconds) at which each track's
 * trimmed region begins — i.e. the sum of trimmed durations of all preceding
 * tracks.
 */
function useGlobalOffsets(tracks: TrackItem[]): number[] {
  return useMemo(() => {
    const offsets: number[] = [];
    let accumulated = 0;
    for (const track of tracks) {
      offsets.push(accumulated);
      accumulated += Math.max(0, track.endSec - track.startSec);
    }
    return offsets;
  }, [tracks]);
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
  const playheadPercents = usePlayheadPercents(tracks, currentTimeSec);
  const globalOffsets = useGlobalOffsets(tracks);

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
