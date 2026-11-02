'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  buildSplitGeneratedByTextKey,
  buildSplitStorageKey,
  type PersistedSplitSegments,
  type SplitSegmentItem,
} from '../split-segments-utils';

// Returns a stable UUID for each unique segment text, generating one on first
// encounter and reusing it on subsequent renders. This prevents React from
// unmounting/remounting segment components when surrounding text changes but
// the segment content itself hasn't.
function useStableSegmentIds() {
  const idMapRef = useRef<Map<string, string>>(new Map());

  return useCallback((segmentText: string): string => {
    const existing = idMapRef.current.get(segmentText);
    if (existing) return existing;
    const id = crypto.randomUUID();
    idMapRef.current.set(segmentText, id);
    return id;
  }, []);
}

interface UseSplitSegmentsParams {
  generationContext?: string;
  selectedVoiceName?: string;
  shouldUseSplitMode: boolean;
  splitSegmentTexts: string[];
  text: string;
}

export function useSplitSegments({
  generationContext = '',
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
  const getStableId = useStableSegmentIds();

  useEffect(() => {
    if (!(shouldUseSplitMode && selectedVoiceName && text.trim())) {
      setSplitStorageKey('');
      return;
    }
    setSplitStorageKey('');
    let cancelled = false;
    buildSplitStorageKey(selectedVoiceName, text, generationContext)
      .then((key) => {
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
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [generationContext, shouldUseSplitMode, selectedVoiceName, text]);

  useEffect(() => {
    if (!(shouldUseSplitMode && splitStorageKey)) {
      setSplitSegments([]);
      setSplitGeneratedByText({});
      return;
    }

    const baseSegments = splitSegmentTexts.map((segmentText) => ({
      audioUrl: '',
      id: getStableId(segmentText),
      status: 'idle' as const,
      text: segmentText,
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
        const generatedByTextKey = buildSplitGeneratedByTextKey(
          segment.text,
          generationContext,
        );
        if (!persistedSegment || persistedSegment.text !== segment.text) {
          const cachedUrl = generatedByText[generatedByTextKey];
          if (cachedUrl) {
            return {
              ...segment,
              audioUrl: cachedUrl,
              status: 'success' as const,
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
            audioUrl: persistedSegment.audioUrl,
            status: 'success' as const,
          };
        }

        const cachedUrl = generatedByText[generatedByTextKey];
        if (cachedUrl) {
          return {
            ...segment,
            audioUrl: cachedUrl,
            status: 'success' as const,
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
  }, [
    generationContext,
    getStableId,
    shouldUseSplitMode,
    splitStorageKey,
    splitSegmentTexts,
  ]);

  useEffect(() => {
    if (
      !(shouldUseSplitMode && splitStorageKey) ||
      typeof window === 'undefined'
    ) {
      return;
    }

    const payload: PersistedSplitSegments = {
      generatedByText: splitGeneratedByText,
      segments: splitSegments.map((segment) => ({
        audioUrl: segment.audioUrl || undefined,
        status: segment.status,
        text: segment.text,
      })),
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
          ? { ...item, audioUrl: '', status: 'generating' }
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
          ? { ...item, audioUrl: url, status: 'success' }
          : item,
      ),
    );
    setSplitGeneratedByText((current) => ({
      ...current,
      [buildSplitGeneratedByTextKey(textValue, generationContext)]: url,
    }));
  };

  const markSegmentIdle = (index: number) => {
    setSplitSegments((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index
          ? { ...item, audioUrl: '', status: 'idle' }
          : item,
      ),
    );
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

        const cachedUrl =
          splitGeneratedByText[
            buildSplitGeneratedByTextKey(nextText, generationContext)
          ];
        if (cachedUrl) {
          return {
            ...item,
            audioUrl: cachedUrl,
            status: 'success',
            text: nextText,
          };
        }

        return {
          ...item,
          audioUrl: '',
          status: 'idle',
          text: nextText,
        };
      }),
    );
  };

  return {
    allSegmentsGenerated,
    markSegmentFailed,
    markSegmentGenerating,
    markSegmentIdle,
    markSegmentSuccess,
    splitSegments,
    updateSegmentText,
  };
}
