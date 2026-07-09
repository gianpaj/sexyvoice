'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Web Audio API hook that analyses an HTMLAudioElement's frequency data
 * and returns multiband Float32Array[] for waveform visualisation and
 * energy-driven speaking detection.
 *
 * @param audioElement - The audio element to analyse (null = inactive)
 * @param bands - Number of frequency bands to split into (default 5)
 * @param loPass - Low frequency bin index cutoff (default 100)
 * @param hiPass - High frequency bin index cutoff (default 600)
 * @returns Array of Float32Array chunks with normalised 0–1 values per band
 */
export function useAudioAnalyser(
  audioElement: HTMLAudioElement | null,
  bands = 5,
  loPass = 100,
  hiPass = 600,
): Float32Array[] {
  const [frequencyBands, setFrequencyBands] = useState<Float32Array[]>([]);

  // Refs to track Web Audio objects for cleanup
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    // Cancel animation frame
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    // Disconnect source
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // Already disconnected
      }
      sourceRef.current = null;
    }

    // Disconnect analyser
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // Already disconnected
      }
      analyserRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        // Already closed
      }
      audioContextRef.current = null;
    }

    setFrequencyBands([]);
  }, []);

  useEffect(() => {
    if (!audioElement) {
      cleanup();
      return;
    }

    // Create AudioContext
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    audioContextRef.current = ctx;

    // Create AnalyserNode with high-resolution FFT
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    // Connect: audioElement → source → analyser → destination
    // createMediaElementSource is one-shot per element, so we always
    // expect a fresh Audio() element from the caller.
    let source: MediaElementAudioSourceNode;
    try {
      source = ctx.createMediaElementSource(audioElement);
    } catch {
      // If the element was already source'd (shouldn't happen with fresh Audio()),
      // bail out gracefully.
      cleanup();
      return;
    }
    source.connect(analyser);
    analyser.connect(ctx.destination);
    sourceRef.current = source;

    // Frequency data buffer
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    // Clamp the pass range to valid indices
    const lo = Math.max(0, Math.min(loPass, bufferLength - 1));
    const hi = Math.max(lo + 1, Math.min(hiPass, bufferLength));
    const sliceLength = hi - lo;
    const bandSize = Math.max(1, Math.floor(sliceLength / bands));

    // rAF loop: sample frequency data and split into bands
    const tick = () => {
      analyser.getFloatFrequencyData(dataArray);

      const result: Float32Array[] = [];

      for (let b = 0; b < bands; b++) {
        const start = lo + b * bandSize;
        const end = Math.min(start + bandSize, hi);
        const band = new Float32Array(end - start);

        for (let i = start; i < end; i++) {
          // Raw values are in dB (typically -100 to 0).
          // Clamp to [-100, -10], map to 0–1, apply sqrt for perceptual scaling.
          const db = dataArray[i];
          const clamped = Math.max(-100, Math.min(-10, db));
          const normalised = (clamped + 100) / 90; // 0–1
          band[i - start] = Math.sqrt(normalised);
        }

        result.push(band);
      }

      setFrequencyBands(result);
      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    // Cleanup on unmount or audioElement change
    return cleanup;
  }, [audioElement, bands, loPass, hiPass, cleanup]);

  return frequencyBands;
}
