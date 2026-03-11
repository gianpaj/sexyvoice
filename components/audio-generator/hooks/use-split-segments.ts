'use client';

import { useEffect, useRef, useState } from 'react';

import {
  buildSplitStorageKey,
  type PersistedSplitSegments,
  type SplitSegmentItem,
} from '../split-segments-utils';

interface UseSplitSegmentsParams {
  selectedVoiceName?: string;
  shouldUseSplitMode: boolean;
  splitSegmentTexts: string[];
  text: string;
}

export function useSplitSegments({
  selectedVoiceName,
  text,
  shouldUseSplitMode,
  splitSegmentTexts,
}: UseSplitSegmentsParams) {
  const [splitSegments, setSplitSegments] = useState<SplitSegmentItem[]>([]);
  const [splitGeneratedByText, setSplitGeneratedByText] = useState<
    Record<string, string>
  >({});

  const [splitStorageKey, setSplitStorageKey] = useState('');
  const prevSplitStorageKeyRef = useRef('');

  useEffect(() => {
    if (!(shouldUseSplitMode && selectedVoiceName && text.trim())) {
      setSplitStorageKey('');
      return;
    }
    let cancelled = false;
    buildSplitStorageKey(selectedVoiceName, text).then((key) => {
      if (!cancelled) {
        // Remove the old localStorage entry when the key changes to prevent
        // unbounded growth from unique text hashes accumulating over time.
        const prevKey = prevSplitStorageKeyRef.current;
        if (prevKey && prevKey !== key && typeof window !== 'undefined') {
          window.localStorage.removeItem(prevKey);
        }
        prevSplitStorageKeyRef.current = key;
        setSplitStorageKey(key);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [shouldUseSplitMode, selectedVoiceName, text]);

  useEffect(() => {
    if (!(shouldUseSplitMode && splitStorageKey)) {
      setSplitSegments([]);
      setSplitGeneratedByText({});
      return;
    }

    const baseSegments = splitSegmentTexts.map((segmentText, index) => ({
      id: `${index}-${segmentText.slice(0, 16)}`,
      text: segmentText,
      status: 'idle' as const,
      audioUrl: '',
    }));

    if (typeof window === 'undefined') {
      setSplitSegments(baseSegments);
      return;
    }

    try {
      const raw = window.localStorage.getItem(splitStorageKey);
      if (!raw) {
        setSplitSegments(baseSegments);
        setSplitGeneratedByText({});
        return;
      }

      const parsed = JSON.parse(raw) as PersistedSplitSegments;
      const generatedByText = parsed.generatedByText || {};
      if (!parsed.segments || parsed.segments.length !== baseSegments.length) {
        setSplitSegments(baseSegments);
        setSplitGeneratedByText(generatedByText);
        return;
      }

      const merged = baseSegments.map((segment, index) => {
        const persistedSegment = parsed.segments[index];
        if (!persistedSegment || persistedSegment.text !== segment.text) {
          const cachedUrl = generatedByText[segment.text];
          if (cachedUrl) {
            return {
              ...segment,
              status: 'success' as const,
              audioUrl: cachedUrl,
            };
          }
          return segment;
        }

        if (
          persistedSegment.status === 'success' &&
          persistedSegment.audioUrl
        ) {
          return {
            ...segment,
            status: 'success' as const,
            audioUrl: persistedSegment.audioUrl,
          };
        }

        const cachedUrl = generatedByText[segment.text];
        if (cachedUrl) {
          return {
            ...segment,
            status: 'success' as const,
            audioUrl: cachedUrl,
          };
        }

        return segment;
      });

      setSplitSegments(merged);
      setSplitGeneratedByText(generatedByText);
    } catch {
      setSplitSegments(baseSegments);
      setSplitGeneratedByText({});
    }
  }, [shouldUseSplitMode, splitStorageKey, splitSegmentTexts]);

  useEffect(() => {
    if (
      !(shouldUseSplitMode && splitStorageKey) ||
      typeof window === 'undefined'
    ) {
      return;
    }

    const payload: PersistedSplitSegments = {
      segments: splitSegments.map((segment) => ({
        text: segment.text,
        status: segment.status,
        audioUrl: segment.audioUrl || undefined,
      })),
      generatedByText: splitGeneratedByText,
    };

    window.localStorage.setItem(splitStorageKey, JSON.stringify(payload));
  }, [
    shouldUseSplitMode,
    splitStorageKey,
    splitSegments,
    splitGeneratedByText,
  ]);

  const allSegmentsGenerated =
    splitSegments.length > 0 &&
    splitSegments.every(
      (segment) => segment.status === 'success' && Boolean(segment.audioUrl),
    );

  const markSegmentGenerating = (index: number) => {
    setSplitSegments((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index
          ? { ...item, status: 'generating', audioUrl: '' }
          : item,
      ),
    );
  };

  const markSegmentSuccess = (
    index: number,
    textValue: string,
    url: string,
  ) => {
    setSplitSegments((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index
          ? { ...item, status: 'success', audioUrl: url }
          : item,
      ),
    );
    setSplitGeneratedByText((current) => ({
      ...current,
      [textValue]: url,
    }));
  };

  const markSegmentFailed = (index: number) => {
    setSplitSegments((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index ? { ...item, status: 'failed' } : item,
      ),
    );
  };

  const updateSegmentText = (index: number, nextText: string) => {
    setSplitSegments((current) =>
      current.map((item, currentIndex) => {
        if (currentIndex !== index) {
          return item;
        }

        const cachedUrl = splitGeneratedByText[nextText];
        if (cachedUrl) {
          return {
            ...item,
            text: nextText,
            status: 'success',
            audioUrl: cachedUrl,
          };
        }

        return {
          ...item,
          text: nextText,
          status: 'idle',
          audioUrl: '',
        };
      }),
    );
  };

  return {
    splitSegments,
    allSegmentsGenerated,
    markSegmentGenerating,
    markSegmentSuccess,
    markSegmentFailed,
    updateSegmentText,
  };
}
