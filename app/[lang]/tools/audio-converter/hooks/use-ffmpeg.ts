'use client';

import { useState, useEffect, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'aac' | 'flac' | 'm4a' | 'mp4';

export function useFFmpeg() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        const ffmpeg = new FFmpeg();
        ffmpegRef.current = ffmpeg;

        ffmpeg.on('log', ({ message }) => {
          console.log('[FFmpeg]', message);
        });

        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });

        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load FFmpeg:', err);
        setError('Failed to load FFmpeg');
        setIsLoading(false);
      }
    };

    loadFFmpeg();
  }, []);

  const convert = async (
    file: File,
    outputFormat: AudioFormat,
    onProgress?: (progress: number) => void
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

    const arrayBuffer = typeof data === 'string'
      ? new TextEncoder().encode(data).buffer as ArrayBuffer
      : data.buffer as ArrayBuffer;
    return new Blob([arrayBuffer], { type: mimeTypes[outputFormat] });
  };

  return {
    convert,
    isLoading,
    error,
  };
}
