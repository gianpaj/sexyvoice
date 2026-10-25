'use client';

import { useMultibandTrackVolume } from '@/hooks/use-multiband-track-volume';
import { MultibandAudioVisualizer } from './multiband-bar-visualizer';

export function MicrophoneVisualizer({
  mediaStream,
  barColor = '#fff',
}: {
  mediaStream: MediaStream | null;
  barColor?: string;
}) {
  const frequencies = useMultibandTrackVolume(mediaStream, 9);

  return (
    <MultibandAudioVisualizer
      barColor={barColor}
      barWidth={4}
      borderRadius={5}
      frequencies={frequencies}
      gap={2}
      maxBarHeight={16}
      minBarHeight={2}
      state="speaking"
    />
  );
}
