'use client';

interface DemoWaveformProps {
  frequencyBands: number[];
  isActive: boolean;
}

/**
 * Frequency-driven visualizer bars powered by `useAudioAnalyser`.
 *
 * Renders one bar per band in `frequencyBands` (typically 5 bars).
 * Each bar's height is mapped from the precomputed average band value.
 * Uses inline `style` with CSS transition for smooth interpolation.
 * When `isActive` is false, all bars render at minimum height (4px).
 *
 * Purely decorative — `aria-hidden="true"`.
 */
export function DemoWaveform({ frequencyBands, isActive }: DemoWaveformProps) {
  const bandCount =
    isActive && frequencyBands.length > 0 ? frequencyBands.length : 5;
  const minHeight = 4;
  const maxHeight = 40;

  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center gap-[3px]"
    >
      {Array.from({ length: bandCount }, (_, i) => {
        let height = minHeight;

        if (isActive && frequencyBands[i] !== undefined) {
          const avg = frequencyBands[i];
          height = Math.max(minHeight, Math.round(avg * maxHeight));
        }

        return (
          <div
            className="w-[3px] rounded-full bg-gradient-to-t from-purple-500 to-fuchsia-400"
            key={i}
            style={{
              height: `${height}px`,
              transition: 'height 80ms ease-out',
            }}
          />
        );
      })}
    </div>
  );
}
