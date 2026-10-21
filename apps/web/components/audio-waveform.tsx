'use client';

import WavesurferPlayer, { type WavesurferProps } from '@wavesurfer/react';

export const AUDIO_WAVEFORM_DEFAULTS = {
  height: 48,
  barGap: 2,
  barRadius: 2,
  barWidth: 2,
  cursorColor: 'transparent',
  waveColor: '#a1a1aa',
  progressColor: '#7c3aed',
};

export function AudioWaveform({
  height = AUDIO_WAVEFORM_DEFAULTS.height,
  waveColor = AUDIO_WAVEFORM_DEFAULTS.waveColor,
  progressColor = AUDIO_WAVEFORM_DEFAULTS.progressColor,
  ...props
}: WavesurferProps) {
  return (
    <WavesurferPlayer
      {...AUDIO_WAVEFORM_DEFAULTS}
      height={height}
      progressColor={progressColor}
      waveColor={waveColor}
      {...props}
    />
  );
}
