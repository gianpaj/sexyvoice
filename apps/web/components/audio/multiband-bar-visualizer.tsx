// https://github.com/livekit-examples/realtime-playground/blob/9c091a4e220c4d4410bcb62b9f9ee3fe15e7c152/web/src/components/agent/visualizers/multiband-bar-visualizer.tsx
import { useEffect, useReducer } from 'react';

type VisualizerState = 'listening' | 'idle' | 'speaking' | 'thinking';

interface ThinkingState {
  direction: 'left' | 'right';
  index: number;
}
type ThinkingAction =
  | { center: number; type: 'reset' }
  | { max: number; type: 'tick' };

function thinkingReducer(
  state: ThinkingState,
  action: ThinkingAction,
): ThinkingState {
  if (action.type === 'reset') {
    return { direction: 'right', index: action.center };
  }
  const { direction, index } = state;
  if (direction === 'right') {
    return index === action.max
      ? { direction: 'left', index: index - 1 }
      : { direction: 'right', index: index + 1 };
  }
  return index === 0
    ? { direction: 'right', index: index + 1 }
    : { direction: 'left', index: index - 1 };
}

interface MultibandAudioVisualizerProps {
  barColor?: string;
  barWidth: number;
  borderRadius: number;
  frequencies: Float32Array[] | number[][];
  gap: number;
  maxBarHeight: number;
  minBarHeight: number;
  state: VisualizerState;
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

  const centerIndex = Math.floor(summedFrequencies.length / 2);
  const [thinking, dispatch] = useReducer(thinkingReducer, {
    direction: 'right',
    index: centerIndex,
  });

  // The effect re-runs on each `thinking` change to self-schedule the next
  // animation tick, so `thinking` is a deliberate trigger, not a body reference.
  // biome-ignore lint/correctness/useExhaustiveDependencies: thinking is an intentional re-trigger driving the animation loop
  useEffect(() => {
    if (state !== 'thinking') {
      dispatch({ type: 'reset', center: centerIndex });
      return;
    }
    const timeout = setTimeout(() => {
      dispatch({ type: 'tick', max: summedFrequencies.length - 1 });
    }, 200);
    return () => clearTimeout(timeout);
  }, [state, centerIndex, summedFrequencies.length, thinking]);

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
                state === 'idle'
                  ? 'none'
                  : `${0.1 * barWidth}px ${
                      0.1 * barWidth
                    }px 0px 0px rgba(0, 0, 0, 0.1)`,
            }}
          />
        );
      })}
    </div>
  );
};
