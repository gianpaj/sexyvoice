// https://github.com/livekit-examples/realtime-playground/blob/9c091a4e220c4d4410bcb62b9f9ee3fe15e7c152/web/src/components/agent/visualizers/multiband-bar-visualizer.tsx
import { useEffect, useState } from 'react';

type VisualizerState = 'listening' | 'idle' | 'speaking' | 'thinking';

interface MultibandAudioVisualizerProps {
  state: VisualizerState;
  barWidth: number;
  minBarHeight: number;
  maxBarHeight: number;
  frequencies: Float32Array[] | number[][];
  borderRadius: number;
  gap: number;
  barColor?: string;
}

export const MultibandAudioVisualizer = ({
  state,
  barWidth,
  minBarHeight,
  maxBarHeight,
  frequencies,
  borderRadius,
  gap,
  barColor = '#424049',
}: MultibandAudioVisualizerProps) => {
  const summedFrequencies = frequencies.map((bandFrequencies) => {
    const sum = (bandFrequencies as number[]).reduce((a, b) => a + b, 0);
    return Math.sqrt(sum / bandFrequencies.length);
  });

  const [thinkingIndex, setThinkingIndex] = useState(
    Math.floor(summedFrequencies.length / 2),
  );
  const [thinkingDirection, setThinkingDirection] = useState<'left' | 'right'>(
    'right',
  );

  useEffect(() => {
    if (state !== 'thinking') {
      setThinkingIndex(Math.floor(summedFrequencies.length / 2));
      return;
    }
    const timeout = setTimeout(() => {
      if (thinkingDirection === 'right') {
        if (thinkingIndex === summedFrequencies.length - 1) {
          setThinkingDirection('left');
          setThinkingIndex((prev) => prev - 1);
        } else {
          setThinkingIndex((prev) => prev + 1);
        }
      } else if (thinkingIndex === 0) {
        setThinkingDirection('right');
        setThinkingIndex((prev) => prev + 1);
      } else {
        setThinkingIndex((prev) => prev - 1);
      }
    }, 200);

    return () => clearTimeout(timeout);
  }, [state, summedFrequencies.length, thinkingDirection, thinkingIndex]);

  return (
    <div
      className="flex flex-row items-center"
      style={{
        gap: `${gap}px`,
      }}
    >
      {summedFrequencies.map((frequency, index) => {
        const isCenter = index === Math.floor(summedFrequencies.length / 2);
        // let transform;

        return (
          <div
            className={`${
              isCenter && state === 'listening' ? 'animate-pulse' : ''
            }`}
            key={`frequency-${index}`}
            style={{
              backgroundColor: barColor,
              height: `${minBarHeight + frequency * (maxBarHeight - minBarHeight)}px`,
              width: `${barWidth}px`,
              transition:
                'background-color 0.35s ease-out, transform 0.25s ease-out',
              // transform,
              borderRadius: `${borderRadius}px`,
              boxShadow:
                state !== 'idle'
                  ? `${0.1 * barWidth}px ${
                      0.1 * barWidth
                    }px 0px 0px rgba(0, 0, 0, 0.1)`
                  : 'none',
            }}
          />
        );
      })}
    </div>
  );
};
