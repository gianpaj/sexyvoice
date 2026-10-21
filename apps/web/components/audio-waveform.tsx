'use client';

import WavesurferPlayer, { type WavesurferProps } from '@wavesurfer/react';

export function AudioWaveform({
  height = 48,
  waveColor = '#a1a1aa',
  progressColor = '#7c3aed',
  ...props
}: WavesurferProps) {
  return (
    <WavesurferPlayer
      barGap={2}
      barRadius={2}
      barWidth={2}
      cursorColor="transparent"
      height={height}
      progressColor={progressColor}
      waveColor={waveColor}
      {...props}
    />
  );
}
