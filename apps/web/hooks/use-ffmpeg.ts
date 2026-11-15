'use client';

import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { useCallback, useEffect, useRef, useState } from 'react';

import { type AudioOutputFormat, encodeAudio, loadFFmpeg } from '@/lib/ffmpeg';

/**
 * One FFmpeg instance for the calling component. Concurrent `ensureLoaded`
 * calls share one load. Eager callers start loading on mount; lazy callers
 * load on their first `ensureLoaded`.
 */
export function useFFmpegInstance({ lazyLoad = false } = {}) {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const loadPromiseRef = useRef<Promise<FFmpeg> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable identity is required for correctness: callers preload FFmpeg from
  // effects that depend on this callback, and failures update local state.
  const ensureLoaded = useCallback(async (): Promise<FFmpeg> => {
    if (ffmpegRef.current) {
      return ffmpegRef.current;
    }

    let loadPromise = loadPromiseRef.current;
    if (!loadPromise) {
      setIsLoading(true);
      loadPromise = loadFFmpeg();
      loadPromiseRef.current = loadPromise;
    }

    try {
      const ffmpeg = await loadPromise;
      ffmpegRef.current = ffmpeg;
      setError(null);
      return ffmpeg;
    } catch (err) {
      setError(
        `Failed to load FFmpeg: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
      throw err;
    } finally {
      if (loadPromiseRef.current === loadPromise) {
        loadPromiseRef.current = null;
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (lazyLoad) {
      return;
    }
    ensureLoaded().catch((loadError: unknown) => {
      console.error('Initial FFmpeg load failed:', loadError);
    });
  }, [ensureLoaded, lazyLoad]);

  /** Stops any running command and drops the instance. */
  const terminate = () => {
    ffmpegRef.current?.terminate();
    ffmpegRef.current = null;
  };

  return { ensureLoaded, error, isLoading, terminate };
}

/** Converts a recording or upload to another audio format in the browser. */
export function useFFmpeg(options?: { lazyLoad?: boolean }) {
  const { ensureLoaded, error, isLoading } = useFFmpegInstance(options);

  const convert = async (
    file: File | Blob,
    outputFormat: AudioOutputFormat,
    onProgress?: (progress: number) => void,
  ): Promise<Blob> => {
    const ffmpeg = await ensureLoaded();
    const handleProgress = ({ progress }: { progress: number }) =>
      onProgress?.(progress);
    ffmpeg.on('progress', handleProgress);
    try {
      await ffmpeg.writeFile('input', await fetchFile(file));
      const audio = await encodeAudio(ffmpeg, 'input', outputFormat);
      await ffmpeg.deleteFile('input');
      return audio;
    } finally {
      ffmpeg.off('progress', handleProgress);
    }
  };

  return { convert, ensureLoaded, error, isLoading };
}
