'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { useCallback, useRef, useState } from 'react';

export type JoinerOutputFormat = 'mp3' | 'wav' | 'm4a';

export interface JoinerSegmentInput {
  file: File;
  startSec: number;
  endSec: number;
}

const FFMPEG_CORE_VERSION = '0.12.6';
const CANCELLED_ERROR = 'CANCELLED';

async function loadFFmpegCore(): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg();
  const baseURL = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
}

function getFormatArgs(outputFormat: JoinerOutputFormat, outputName: string) {
  const joinedWavName = 'joined.wav';

  const args: Record<JoinerOutputFormat, string[]> = {
    mp3: [
      '-i',
      joinedWavName,
      '-codec:a',
      'libmp3lame',
      '-q:a',
      '2',
      outputName,
    ],
    wav: ['-i', joinedWavName, '-codec:a', 'pcm_s16le', outputName],
    m4a: ['-i', joinedWavName, '-codec:a', 'aac', '-b:a', '192k', outputName],
  };

  return args[outputFormat];
}

function getMimeType(outputFormat: JoinerOutputFormat) {
  const mimeTypes: Record<JoinerOutputFormat, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
  };

  return mimeTypes[outputFormat];
}

async function cleanupTempFiles(ffmpeg: FFmpeg, tempFiles: string[]) {
  for (const fileName of tempFiles) {
    try {
      await ffmpeg.deleteFile(fileName);
    } catch (_err) {
      // best-effort cleanup for temp files
    }
  }
}

function assertNotCancelled(
  cancelRequestedRef: React.MutableRefObject<boolean>,
) {
  if (cancelRequestedRef.current) {
    throw new Error(CANCELLED_ERROR);
  }
}

async function trimSegmentsToWav({
  ffmpeg,
  segments,
  tempFiles,
  cancelRequestedRef,
  setProgress,
}: {
  ffmpeg: FFmpeg;
  segments: JoinerSegmentInput[];
  tempFiles: string[];
  cancelRequestedRef: React.MutableRefObject<boolean>;
  setProgress: React.Dispatch<React.SetStateAction<number>>;
}) {
  for (let index = 0; index < segments.length; index++) {
    assertNotCancelled(cancelRequestedRef);

    const segment = segments[index];
    const inputName = `input_${index}_${segment.file.name}`;
    const trimmedName = `trimmed_${index}.wav`;

    tempFiles.push(inputName, trimmedName);

    await ffmpeg.writeFile(inputName, await fetchFile(segment.file));

    await ffmpeg.exec([
      '-i',
      inputName,
      '-ss',
      segment.startSec.toFixed(3),
      '-to',
      segment.endSec.toFixed(3),
      '-vn',
      '-acodec',
      'pcm_s16le',
      '-ar',
      '44100',
      // normalizing during the trim step
      '-ac',
      '2',
      trimmedName,
    ]);

    setProgress(((index + 1) / segments.length) * 0.5);
  }
}

async function concatSegments(ffmpeg: FFmpeg, segments: JoinerSegmentInput[]) {
  const concatListName = 'concat_list.txt';

  const concatListContent = segments
    .map((_, index) => `file 'trimmed_${index}.wav'`)
    .join('\n');

  await ffmpeg.writeFile(
    concatListName,
    new TextEncoder().encode(concatListContent),
  );

  await ffmpeg.exec([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatListName,
    '-c',
    'copy',
    'joined.wav',
  ]);

  return concatListName;
}

async function encodeOutput(
  ffmpeg: FFmpeg,
  outputFormat: JoinerOutputFormat,
): Promise<Blob> {
  const outputName = `output.${outputFormat}`;

  await ffmpeg.exec(getFormatArgs(outputFormat, outputName));

  const data = await ffmpeg.readFile(outputName);
  const arrayBuffer =
    typeof data === 'string'
      ? new TextEncoder().encode(data).buffer
      : (data.buffer as ArrayBuffer);

  return new Blob([arrayBuffer], { type: getMimeType(outputFormat) });
}

export function useFFmpegJoiner() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cancelRequestedRef = useRef(false);

  const ensureLoaded = useCallback(async () => {
    if (ffmpegRef.current) {
      return ffmpegRef.current;
    }

    setIsLoading(true);

    try {
      const ffmpeg = await loadFFmpegCore();
      ffmpegRef.current = ffmpeg;
      setError(null);
      return ffmpeg;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load FFmpeg core';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    cancelRequestedRef.current = true;

    if (ffmpegRef.current) {
      await ffmpegRef.current.terminate();
      ffmpegRef.current = null;
    }

    setIsProcessing(false);
    setProgress(0);
  }, []);

  const progressHandlerRef = useRef<
    (({ progress: p }: { progress: number }) => void) | null
  >(null);

  const join = useCallback(
    async (
      segments: JoinerSegmentInput[],
      outputFormat: JoinerOutputFormat,
    ) => {
      if (segments.length === 0) {
        throw new Error('At least one segment is required.');
      }

      cancelRequestedRef.current = false;
      setIsProcessing(true);
      setProgress(0);
      setError(null);

      const ffmpeg = await ensureLoaded();
      const tempFiles: string[] = [];

      try {
        // Remove any stale listener from a previous join call to prevent
        // handler accumulation causing redundant/noisy progress updates.
        if (progressHandlerRef.current) {
          ffmpeg.off('progress', progressHandlerRef.current);
        }
        // Ensure we don't accumulate multiple 'progress' listeners across joins
        (ffmpeg as any).removeAllListeners?.('progress');

        const onProgress = ({
          progress: currentProgress,
        }: {
          progress: number;
        }) => {
          setProgress(Math.min(0.5 + currentProgress * 0.5, 0.99));
        };
        progressHandlerRef.current = onProgress;
        ffmpeg.on('progress', onProgress);

        await trimSegmentsToWav({
          ffmpeg,
          segments,
          tempFiles,
          cancelRequestedRef,
          setProgress,
        });

        const concatListName = await concatSegments(ffmpeg, segments);
        tempFiles.push(concatListName, 'joined.wav', `output.${outputFormat}`);

        const outputBlob = await encodeOutput(ffmpeg, outputFormat);
        setProgress(1);

        return outputBlob;
      } catch (err) {
        if (cancelRequestedRef.current) {
          throw new Error(CANCELLED_ERROR);
        }

        const message = err instanceof Error ? err.message : 'Join failed';
        setError(message);
        throw err;
      } finally {
        await cleanupTempFiles(ffmpeg, tempFiles);
        setIsProcessing(false);
      }
    },
    [ensureLoaded],
  );

  return {
    ensureLoaded,
    join,
    cancel,
    isLoading,
    isProcessing,
    progress,
    error,
  };
}
