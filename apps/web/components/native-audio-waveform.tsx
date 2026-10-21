'use client';

import { useEffect, useEffectEvent, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';

import { AUDIO_WAVEFORM_DEFAULTS } from '@/components/audio-waveform';

export interface NativeAudioWaveformProps {
  duration: number;
  interact?: boolean;
  media: HTMLMediaElement;
  onError?: (error: Error) => void;
  url: string;
}

export function NativeAudioWaveform({
  media,
  url,
  duration,
  onError,
  interact = false,
}: NativeAudioWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleError = useEffectEvent((error: Error) => {
    onError?.(error);
  });

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const controller = new AbortController();
    const wavesurfer = WaveSurfer.create({
      ...AUDIO_WAVEFORM_DEFAULTS,
      container: containerRef.current,
      media,
      url,
      duration,
      interact,
      fetchParams: { signal: controller.signal },
    });
    const unsubscribeError = wavesurfer.on('error', handleError);

    return () => {
      unsubscribeError();
      // The constructor queues a load that can start after destroy().
      controller.abort();
      wavesurfer.destroy();
    };
  }, [media, url, duration, interact]);

  return <div ref={containerRef} />;
}
