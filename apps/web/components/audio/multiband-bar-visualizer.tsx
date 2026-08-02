// https://github.com/livekit-examples/realtime-playground/blob/9c091a4e220c4d4410bcb62b9f9ee3fe15e7c152/web/src/components/agent/visualizers/multiband-bar-visualizer.tsx

type VisualizerState = 'listening' | 'idle' | 'speaking' | 'thinking';

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

  return (
    <div
      className="flex flex-row items-center"
      style={{
        gap: `${gap}px`,
      }}
    >
      {summedFrequencies.map((frequency, index) => {
        const isCenter = index === centerIndex;
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
