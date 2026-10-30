'use client';

import { useEffect, useEffectEvent, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';

import { AUDIO_WAVEFORM_DEFAULTS } from '@/components/audio-waveform';

export interface NativeAudioWaveformProps {
  duration: number;
  interact?: boolean;
  media: HTMLMediaElement;
  onError?: (error: Error) => void;
  peaks: number[][];
  ready?: boolean;
  reloadKey?: number;
  url: string;
}

export function NativeAudioWaveform({
  media,
  url,
  duration,
  peaks,
  ready = true,
  reloadKey = 0,
  onError,
  interact = false,
}: NativeAudioWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<{
    wavesurfer: WaveSurfer;
    controller: AbortController;
    unsubscribeError: () => void;
  } | null>(null);
  const handleError = useEffectEvent((error: Error) => {
    onError?.(error);
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: Only media and interaction changes replace the instance owner.
  useEffect(() => {
    return () => {
      const instance = instanceRef.current;
      if (!instance) {
        return;
      }
      instance.unsubscribeError();
      // The constructor queues a load that can start after destroy().
      instance.controller.abort();
      instance.wavesurfer.destroy();
      instanceRef.current = null;
    };
  }, [media, interact]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey explicitly requests reloading unchanged source data.
  useEffect(() => {
    if (!(ready && containerRef.current)) {
      return;
    }

    if (instanceRef.current) {
      // WaveSurfer emits the error before rejecting; report it only via the listener.
      instanceRef.current.wavesurfer
        .load(url, peaks, duration)
        .catch(() => undefined);
      return;
    }

    const controller = new AbortController();
    const wavesurfer = WaveSurfer.create({
      ...AUDIO_WAVEFORM_DEFAULTS,
      container: containerRef.current,
      media,
      url,
      peaks,
      duration,
      interact,
      fetchParams: { signal: controller.signal },
    });
    instanceRef.current = {
      wavesurfer,
      controller,
      unsubscribeError: wavesurfer.on('error', handleError),
    };
  }, [media, interact, url, duration, peaks, ready, reloadKey]);

  return <div ref={containerRef} />;
}
