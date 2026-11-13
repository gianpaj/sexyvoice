// https://github.com/livekit-examples/realtime-playground/blob/9c091a4e220c4d4410bcb62b9f9ee3fe15e7c152/web/src/components/agent/visualizers/multiband-bar-visualizer.tsx

interface MultibandAudioVisualizerProps {
  barColor: string;
  barWidth: number;
  borderRadius: number;
  frequencies: Float32Array[] | number[][];
  gap: number;
  maxBarHeight: number;
  minBarHeight: number;
}

export const MultibandAudioVisualizer = ({
  barColor,
  barWidth,
  borderRadius,
  frequencies,
  gap,
  maxBarHeight,
  minBarHeight,
}: MultibandAudioVisualizerProps) => (
  <div className="flex flex-row items-center" style={{ gap: `${gap}px` }}>
    {frequencies.map((band, index) => {
      const sum = (band as number[]).reduce((a, b) => a + b, 0);
      const level = Math.sqrt(sum / band.length);
      return (
        <div
          key={`frequency-${index}`}
          style={{
            backgroundColor: barColor,
            borderRadius: `${borderRadius}px`,
            boxShadow: `${0.1 * barWidth}px ${0.1 * barWidth}px 0px 0px rgba(0, 0, 0, 0.1)`,
            height: `${minBarHeight + level * (maxBarHeight - minBarHeight)}px`,
            transition: 'background-color 0.35s ease-out',
            width: `${barWidth}px`,
          }}
        />
      );
    })}
  </div>
);
