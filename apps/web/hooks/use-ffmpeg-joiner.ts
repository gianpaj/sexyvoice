'use client';

import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { useRef, useState } from 'react';

import { useFFmpegInstance } from '@/hooks/use-ffmpeg';
import { type AudioOutputFormat, encodeAudio } from '@/lib/ffmpeg';

export type JoinerOutputFormat = Extract<
  AudioOutputFormat,
  'm4a' | 'mp3' | 'wav'
>;

export interface JoinerSegmentInput {
  endSec: number;
  file: File;
  startSec: number;
}

const CANCELLED_ERROR = 'CANCELLED';

async function cleanupTempFiles(ffmpeg: FFmpeg, tempFiles: string[]) {
  for (const fileName of tempFiles) {
    try {
      await ffmpeg.deleteFile(fileName);
    } catch {
      // best-effort cleanup for temp files
    }
  }
}

function assertNotCancelled(cancelRequestedRef: React.RefObject<boolean>) {
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
  cancelRequestedRef: React.RefObject<boolean>;
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

export function useFFmpegJoiner() {
  const instance = useFFmpegInstance({ lazyLoad: true });
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [joinError, setJoinError] = useState<string | null>(null);
  const cancelRequestedRef = useRef(false);

  const cancel = () => {
    cancelRequestedRef.current = true;
    instance.terminate();
    setIsProcessing(false);
    setProgress(0);
  };

  const join = async (
    segments: JoinerSegmentInput[],
    outputFormat: JoinerOutputFormat,
  ) => {
    if (segments.length === 0) {
      throw new Error('At least one segment is required.');
    }

    cancelRequestedRef.current = false;
    setIsProcessing(true);
    setProgress(0);
    setJoinError(null);

    let ffmpeg: FFmpeg | undefined;
    const tempFiles: string[] = [];
    // Encoding reports the second half of the progress bar.
    const onProgress = ({ progress: encoded }: { progress: number }) => {
      setProgress(Math.min(0.5 + encoded * 0.5, 0.99));
    };

    try {
      ffmpeg = await instance.ensureLoaded();
      ffmpeg.on('progress', onProgress);
      await trimSegmentsToWav({
        cancelRequestedRef,
        ffmpeg,
        segments,
        setProgress,
        tempFiles,
      });

      const concatListName = await concatSegments(ffmpeg, segments);
      tempFiles.push(concatListName, 'joined.wav');

      const outputBlob = await encodeAudio(ffmpeg, 'joined.wav', outputFormat);
      setProgress(1);

      return outputBlob;
    } catch (err) {
      if (cancelRequestedRef.current) {
        throw new Error(CANCELLED_ERROR, { cause: err });
      }

      setJoinError(err instanceof Error ? err.message : 'Join failed');
      throw err;
    } finally {
      if (ffmpeg) {
        ffmpeg.off('progress', onProgress);
        await cleanupTempFiles(ffmpeg, tempFiles);
      }
      setIsProcessing(false);
    }
  };

  return {
    cancel,
    ensureLoaded: instance.ensureLoaded,
    error: joinError ?? instance.error,
    isLoading: instance.isLoading,
    isProcessing,
    join,
    progress,
  };
}
