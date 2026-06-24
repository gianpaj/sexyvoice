'use client';

import { useCallback, useRef, useState } from 'react';

import {
  decodePcmBase64,
  encodeWavFromPcmChunks,
  parseSampleRate,
  WaveformPeakAccumulator,
} from '@/lib/pcm-wav';

export type StreamingPlayerPhase = 'idle' | 'streaming' | 'file';

export interface StreamingWaveformPlayer {
  /** Stream finished: assemble the WAV and arrange the live→file handoff. */
  finalize: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  /** Position + play state captured at the live→file handoff, so the file
   * player can resume seamlessly from where the live engine left off. */
  getHandoff: () => { time: number; wasPlaying: boolean };
  // High-frequency getters — read imperatively from a rAF loop so the host
  // component doesn't re-render every animation frame.
  getPeaks: () => number[];
  /** Whether any PCM chunk actually played (false for cache hits). */
  hadAudio: boolean;
  /** Whether the live (streaming-phase) playback is currently running. */
  isLivePlaying: boolean;
  /** Lifecycle phase. `streaming` = live PCM via Web Audio; `file` = handed off
   * to the persisted WAV for replay/seek. */
  phase: StreamingPlayerPhase;
  /** Decode + schedule + accumulate a streamed PCM chunk (lazily starts the
   * audio engine on the first chunk). */
  pushChunk: (base64: string, mimeType: string) => void;
  /** Tear everything down and return to `idle`. */
  reset: () => void;
  /** Toggle live playback (suspend/resume the AudioContext). */
  togglePlayPause: () => void;
  /** Assembled WAV once the stream finishes (null until `finalize`). */
  wavBlob: Blob | null;
}

const SAMPLE_RATE_FALLBACK = 24_000;
const SAMPLES_PER_PEAK = 512;

export function useStreamingWaveformPlayer(): StreamingWaveformPlayer {
  const [phase, setPhase] = useState<StreamingPlayerPhase>('idle');
  const [isLivePlaying, setIsLivePlaying] = useState(false);
  const [hadAudio, setHadAudio] = useState(false);
  const [wavBlob, setWavBlob] = useState<Blob | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const pcmChunksRef = useRef<Int16Array[]>([]);
  const peakAccRef = useRef<WaveformPeakAccumulator | null>(null);
  const sampleRateRef = useRef(SAMPLE_RATE_FALLBACK);
  const nextStartTimeRef = useRef(0);
  const startTimeRef = useRef(0);
  const finalDurationRef = useRef(0);
  // Playback position + state captured at the live→file handoff so the file
  // player can resume seamlessly from where the live engine left off.
  const handoffTimeRef = useRef(0);
  const handoffPlayingRef = useRef(false);

  const initContext = useCallback((sampleRate: number) => {
    const ctx = new AudioContext({ sampleRate });
    audioCtxRef.current = ctx;
    sourcesRef.current = [];
    pcmChunksRef.current = [];
    peakAccRef.current = new WaveformPeakAccumulator(SAMPLES_PER_PEAK);
    sampleRateRef.current = sampleRate;
    finalDurationRef.current = 0;
    // Created after `await fetch(...)`, i.e. outside the click handler, so the
    // context may start suspended; resume so its clock advances and chunks play.
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }
    nextStartTimeRef.current = ctx.currentTime;
    startTimeRef.current = ctx.currentTime;
    setPhase('streaming');
    setIsLivePlaying(true);
    setHadAudio(true);
    setWavBlob(null);
  }, []);

  const pushChunk = useCallback(
    (base64: string, mimeType: string) => {
      const sampleRate = parseSampleRate(mimeType) || SAMPLE_RATE_FALLBACK;
      if (!audioCtxRef.current) {
        initContext(sampleRate);
      }
      const ctx = audioCtxRef.current;
      const peakAcc = peakAccRef.current;
      if (!(ctx && peakAcc)) return;

      const { int16, float32 } = decodePcmBase64(base64);
      pcmChunksRef.current.push(int16);
      peakAcc.push(float32);

      const audioBuffer = ctx.createBuffer(1, float32.length, sampleRate);
      audioBuffer.copyToChannel(float32, 0);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      const startAt = Math.max(ctx.currentTime, nextStartTimeRef.current);
      source.start(startAt);
      nextStartTimeRef.current = startAt + audioBuffer.duration;
      sourcesRef.current.push(source);
    },
    [initContext],
  );

  const finalize = useCallback(() => {
    const ctx = audioCtxRef.current;
    const peakAcc = peakAccRef.current;
    if (!(ctx && peakAcc) || pcmChunksRef.current.length === 0) {
      // Cache hit (no audio chunks): nothing streamed, let the caller fall back
      // to the normal file player.
      return;
    }

    const sampleRate = sampleRateRef.current;
    finalDurationRef.current = peakAcc.sampleCount / sampleRate;

    // The full clip exists now, so hand off to wavesurfer's media element
    // immediately — that's what makes playback seekable. Waiting for the live
    // playthrough to finish would leave the whole first listen un-seekable.
    // Capture the current position so the file player resumes from here, then
    // stop the Web Audio engine so the two never overlap.
    handoffTimeRef.current = Math.min(
      Math.max(0, ctx.currentTime - startTimeRef.current),
      finalDurationRef.current,
    );
    handoffPlayingRef.current = ctx.state === 'running';
    for (const source of sourcesRef.current) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    sourcesRef.current = [];

    setWavBlob(encodeWavFromPcmChunks(pcmChunksRef.current, sampleRate));
    setPhase('file');
    setIsLivePlaying(false);
  }, []);

  const togglePlayPause = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'running') {
      ctx.suspend().catch(() => undefined);
      setIsLivePlaying(false);
    } else {
      ctx.resume().catch(() => undefined);
      setIsLivePlaying(true);
    }
  }, []);

  const reset = useCallback(() => {
    for (const source of sourcesRef.current) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    sourcesRef.current = [];
    try {
      audioCtxRef.current?.close();
    } catch {
      // already closed
    }
    audioCtxRef.current = null;
    peakAccRef.current = null;
    pcmChunksRef.current = [];
    finalDurationRef.current = 0;
    handoffTimeRef.current = 0;
    handoffPlayingRef.current = false;
    setPhase('idle');
    setIsLivePlaying(false);
    setHadAudio(false);
    setWavBlob(null);
  }, []);

  const getHandoff = useCallback(
    () => ({
      time: handoffTimeRef.current,
      wasPlaying: handoffPlayingRef.current,
    }),
    [],
  );

  const getPeaks = useCallback(() => peakAccRef.current?.getPeaks() ?? [], []);

  const getDuration = useCallback(() => {
    if (finalDurationRef.current > 0) return finalDurationRef.current;
    const peakAcc = peakAccRef.current;
    if (!peakAcc) return 0;
    return peakAcc.sampleCount / sampleRateRef.current;
  }, []);

  const getCurrentTime = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return 0;
    const elapsed = ctx.currentTime - startTimeRef.current;
    const duration = getDuration();
    return duration > 0 ? Math.min(elapsed, duration) : elapsed;
  }, [getDuration]);

  return {
    phase,
    isLivePlaying,
    hadAudio,
    wavBlob,
    pushChunk,
    finalize,
    togglePlayPause,
    reset,
    getPeaks,
    getDuration,
    getCurrentTime,
    getHandoff,
  };
}
