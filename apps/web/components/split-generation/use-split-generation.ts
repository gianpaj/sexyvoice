'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import {
  type JoinerSegmentInput,
  useFFmpegJoiner,
} from '@/app/[lang]/tools/audio-joiner/hooks/use-ffmpeg-joiner';
import { toast } from '@/components/services/toast';
import { downloadBlob } from '@/lib/download';
import { randomSeed } from '@/lib/tts/generation-input';
import {
  estimateSpeech,
  generateSpeech,
  type SpeechParams,
  speechErrorMessage,
  speechRequestFields,
} from '@/lib/tts/speech-client';
import {
  SPLIT_SEGMENT_MAX_COUNT,
  splitLongTextIntoSegments,
} from './split-text';
import { useGenerationProgressToast } from './use-generation-progress-toast';

export type SplitSegmentStatus = 'idle' | 'generating' | 'success' | 'failed';

export interface SplitSegment {
  audioUrl: string;
  id: string;
  status: SplitSegmentStatus;
  text: string;
}

/**
 * One split run: the full text and the request fields it renders with. Any
 * change starts a new session, so segments never keep audio made with other
 * settings.
 */
interface SplitSession {
  /** Audio URLs by trimmed segment text, for segments edited back. */
  generated: Record<string, string>;
  key: string;
  segments: SplitSegment[];
}

// The latest session survives reloads; older ones are overwritten.
const STORAGE_KEY = 'generate-split-session';

function isSegmentDone(segment: SplitSegment): boolean {
  return segment.status === 'success' && Boolean(segment.audioUrl);
}

/** Stable while a segment's text is edited; repeated texts stay distinct. */
function segmentIds(texts: string[]): string[] {
  const seen = new Map<string, number>();
  return texts.map((text) => {
    const occurrence = seen.get(text) ?? 0;
    seen.set(text, occurrence + 1);
    return `${occurrence}:${text}`;
  });
}

function readStoredSession(): SplitSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SplitSession) : null;
  } catch {
    return null;
  }
}

function storeSession(session: SplitSession) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage is full or blocked; the session lives on in memory.
  }
}

function openSession(key: string, texts: string[]): SplitSession {
  const ids = segmentIds(texts);
  const segments = texts.map(
    (text, index): SplitSegment => ({
      audioUrl: '',
      id: ids[index],
      status: 'idle',
      text,
    }),
  );
  const stored = readStoredSession();
  if (stored?.key !== key) {
    return { generated: {}, key, segments };
  }

  return {
    generated: stored.generated,
    key,
    segments: segments.map((segment, index) => {
      const saved = stored.segments[index];
      const audioUrl =
        (saved?.text === segment.text && isSegmentDone(saved)
          ? saved.audioUrl
          : undefined) ?? stored.generated[segment.text.trim()];
      return audioUrl ? { ...segment, audioUrl, status: 'success' } : segment;
    }),
  };
}

function audioDurationSeconds(file: File) {
  return new Promise<number>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const element = new Audio(objectUrl);

    const settle = (duration?: number) => {
      URL.revokeObjectURL(objectUrl);
      element.removeEventListener('loadedmetadata', onLoadedMetadata);
      element.removeEventListener('error', onError);
      if (duration === undefined) {
        reject(new Error('Unable to read segment duration'));
      } else {
        resolve(duration);
      }
    };
    const onLoadedMetadata = () =>
      settle(
        Number.isFinite(element.duration) && element.duration > 0
          ? element.duration
          : undefined,
      );
    const onError = () => settle();

    element.addEventListener('loadedmetadata', onLoadedMetadata);
    element.addEventListener('error', onError);
    element.load();
  });
}

/**
 * Split mode for paid users: long text becomes segments generated one by one,
 * skipping segments already generated and stopping at the first failure, and
 * the generated segments join into one download.
 */
export function useSplitGeneration({
  enabled,
  params,
  text,
  voiceName,
}: {
  /** The user turned split mode on. */
  enabled: boolean;
  params: SpeechParams | null;
  text: string;
  voiceName?: string;
}) {
  const queryClient = useQueryClient();
  const t = useTranslations('generate');
  const translateErrorCode = useTranslations('errorCodes');
  const progress = useGenerationProgressToast(voiceName);
  const joiner = useFFmpegJoiner();
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [session, setSession] = useState<SplitSession | null>(null);

  const texts = params
    ? splitLongTextIntoSegments(text, {
        preserveGrokWrappingTags: params.model.provider === 'grok',
      })
    : [];
  const active = Boolean(params) && enabled && texts.length > 1;
  const key =
    active && params
      ? JSON.stringify({ request: speechRequestFields(params), text })
      : null;

  if ((session?.key ?? null) !== key) {
    setSession(
      key ? openSession(key, texts.slice(0, SPLIT_SEGMENT_MAX_COUNT)) : null,
    );
  }

  useEffect(() => {
    if (session) storeSession(session);
  }, [session]);

  const segments = session?.segments ?? [];
  const allGenerated = segments.length > 0 && segments.every(isSegmentDone);

  const updateSegment = (
    sessionKey: string,
    index: number,
    patch: Partial<SplitSegment>,
    generated?: Record<string, string>,
  ) =>
    setSession((current) =>
      current?.key === sessionKey
        ? {
            ...current,
            generated: { ...current.generated, ...generated },
            segments: current.segments.map((segment, segmentIndex) =>
              segmentIndex === index ? { ...segment, ...patch } : segment,
            ),
          }
        : current,
    );

  /** Generates one segment of `run`; throws when it fails or is cancelled. */
  const generateSegment = async (
    run: { params: SpeechParams; session: SplitSession; signal: AbortSignal },
    index: number,
    seed?: number,
  ) => {
    const segmentText = run.session.segments[index].text.trim();
    updateSegment(run.session.key, index, {
      audioUrl: '',
      status: 'generating',
    });
    try {
      const { url } = await generateSpeech(
        run.params,
        { seed, split: true, text: segmentText },
        {
          fallback: t('error'),
          queryClient,
          signal: run.signal,
          translateErrorCode,
        },
      );
      updateSegment(
        run.session.key,
        index,
        { audioUrl: url, status: 'success' },
        { [segmentText]: url },
      );
    } catch (error) {
      updateSegment(
        run.session.key,
        index,
        run.signal.aborted
          ? { audioUrl: '', status: 'idle' }
          : { status: 'failed' },
      );
      throw error;
    }
  };

  const generate = async (signal: AbortSignal) => {
    if (!(params && session)) return;
    if (texts.length > SPLIT_SEGMENT_MAX_COUNT) {
      toast.error(
        t('split.tooManySegments').replace(
          '__COUNT__',
          String(SPLIT_SEGMENT_MAX_COUNT),
        ),
      );
      return;
    }
    if (session.segments.some((segment) => !segment.text.trim())) {
      toast.error(t('split.segmentCannotBeEmpty'));
      return;
    }

    const run = { params, session, signal };
    const pending = session.segments.flatMap((segment, index) =>
      isSegmentDone(segment) ? [] : [index],
    );
    // A single pending segment needs no progress toast.
    const showProgress = pending.length > 1;
    try {
      for (const [position, index] of pending.entries()) {
        if (showProgress) progress.show(position + 1, pending.length);
        try {
          await generateSegment(run, index);
        } catch (error) {
          if (!signal.aborted) {
            toast.error(
              speechErrorMessage(
                error,
                t('split.segmentFailed').replace(
                  '__INDEX__',
                  String(index + 1),
                ),
              ),
            );
          }
          return;
        }
      }
      if (showProgress) progress.show(pending.length, pending.length, true);
      toast.success(t('success'));
    } finally {
      progress.dismiss();
    }
  };

  /** Generates a failed segment again with a fresh seed. */
  const retry = async (index: number, signal: AbortSignal) => {
    if (!(params && session?.segments[index])) return;
    try {
      await generateSegment({ params, session, signal }, index, randomSeed());
      toast.success(
        t('split.segmentGenerated').replace('__INDEX__', String(index + 1)),
      );
    } catch (error) {
      if (!signal.aborted) {
        toast.error(
          speechErrorMessage(
            error,
            t('split.segmentRetryFailed').replace(
              '__INDEX__',
              String(index + 1),
            ),
          ),
        );
      }
    }
  };

  const estimate = async () => {
    if (!params) return 0;
    const options = { fallback: t('errorEstimating'), translateErrorCode };
    const credits = await Promise.all(
      segments.map((segment) => estimateSpeech(params, segment.text, options)),
    );
    return credits.reduce((total, value) => total + value, 0);
  };

  const updateSegmentText = (index: number, nextText: string) =>
    setSession(
      (current) =>
        current && {
          ...current,
          segments: current.segments.map((segment, segmentIndex) => {
            if (segmentIndex !== index) return segment;
            const audioUrl = current.generated[nextText.trim()] ?? '';
            return {
              ...segment,
              audioUrl,
              status: audioUrl ? 'success' : 'idle',
              text: nextText,
            };
          }),
        },
    );

  const downloadAll = async () => {
    if (!(params && allGenerated) || isDownloadingAll) return;

    setIsDownloadingAll(true);
    try {
      const inputs: JoinerSegmentInput[] = [];
      for (const [index, segment] of segments.entries()) {
        const response = await fetch(segment.audioUrl);
        if (!response.ok) {
          throw new Error('Could not fetch generated segment');
        }
        const blob = await response.blob();
        const mimeType = blob.type || 'audio/wav';
        const file = new File(
          [blob],
          `segment-${index + 1}.${mimeType.includes('mpeg') ? 'mp3' : 'wav'}`,
          { type: mimeType },
        );
        inputs.push({
          endSec: await audioDurationSeconds(file),
          file,
          startSec: 0,
        });
      }

      const format = params.model.formats[0];
      downloadBlob(
        await joiner.join(inputs, format),
        `generated-audio.${format}`,
      );
    } catch (error) {
      console.error('Failed to download all segments:', error);
      toast.error(t('split.downloadAllFailed'));
    } finally {
      setIsDownloadingAll(false);
    }
  };

  return {
    /** Split mode is on and the text makes more than one segment. */
    active,
    allGenerated,
    downloadAll,
    estimate,
    generate,
    isDownloadingAll,
    isJoinerLoading: joiner.isLoading,
    isJoining: joiner.isProcessing,
    retry,
    /** Segments the text splits into, including any past the cap. */
    segmentCount: texts.length,
    segments,
    updateSegmentText,
  };
}

export type SplitGeneration = ReturnType<typeof useSplitGeneration>;
