'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { useCallback, useEffect, useRef, useState } from 'react';

type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'aac' | 'flac' | 'm4a' | 'mp4';

const FFMPEG_CORE_VERSION = '0.12.6';

interface UseFFmpegOptions {
  lazyLoad?: boolean;
}

async function loadFFmpegCore(): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  const baseURL = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  console.info('FFmpeg loaded successfully');
  return ffmpeg;
}

export function useFFmpeg(options?: UseFFmpegOptions) {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [isLoading, setIsLoading] = useState(options?.lazyLoad);
  const [error, setError] = useState<string | null>(null);
  const lazyLoad = options?.lazyLoad ?? false;

  useEffect(() => {
    if (lazyLoad) {
      return;
    }

    const loadFFmpeg = async () => {
      try {
        setIsLoading(true);
        ffmpegRef.current = await loadFFmpegCore();
      } catch (err) {
        console.error('Failed to load FFmpeg:', err);
        setError('Failed to load FFmpeg');
      } finally {
        setIsLoading(false);
      }
    };

    loadFFmpeg();
  }, [lazyLoad]);

  const ensureLoaded = useCallback(async (): Promise<void> => {
    if (ffmpegRef.current) {
      return;
    }

    try {
      setIsLoading(true);
      ffmpegRef.current = await loadFFmpegCore();
      setError(null);
    } catch (err) {
      const errorMsg = `Failed to load FFmpeg: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error(errorMsg);
      setError(errorMsg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const convert = async (
    file: File | Blob,
    outputFormat: AudioFormat,
    onProgress?: (progress: number) => void,
  ): Promise<Blob> => {
    if (!ffmpegRef.current) {
      throw new Error('FFmpeg not loaded');
    }

    const ffmpeg = ffmpegRef.current;
    const inputName = 'input';
    const outputName = `output.${outputFormat}`;

    ffmpeg.on('progress', ({ progress }) => {
      onProgress?.(progress);
    });

    await ffmpeg.writeFile(inputName, await fetchFile(file));

    const formatArgs: Record<AudioFormat, string[]> = {
      mp3: ['-i', inputName, '-codec:a', 'libmp3lame', '-q:a', '2', outputName],
      wav: ['-i', inputName, '-codec:a', 'pcm_s16le', outputName],
      ogg: ['-i', inputName, '-codec:a', 'libvorbis', '-q:a', '4', outputName],
      aac: ['-i', inputName, '-codec:a', 'aac', '-b:a', '192k', outputName],
      flac: ['-i', inputName, '-codec:a', 'flac', outputName],
      m4a: ['-i', inputName, '-codec:a', 'aac', '-b:a', '192k', outputName],
      mp4: ['-i', inputName, '-codec:a', 'aac', '-b:a', '192k', outputName],
    };

    await ffmpeg.exec(formatArgs[outputFormat]);

    const data = await ffmpeg.readFile(outputName);
    const mimeTypes: Record<AudioFormat, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      aac: 'audio/aac',
      flac: 'audio/flac',
      m4a: 'audio/mp4',
      mp4: 'audio/mp4',
    };

    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    const arrayBuffer =
      typeof data === 'string'
        ? new TextEncoder().encode(data).buffer
        : (data.buffer as ArrayBuffer);
    return new Blob([arrayBuffer], { type: mimeTypes[outputFormat] });
  };

  return {
    convert,
    ensureLoaded,
    isLoading,
    error,
  };
}
