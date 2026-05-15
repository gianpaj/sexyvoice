'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { ExternalToast } from 'sonner';

import { toast } from '@/components/services/toast';

interface SplitProgressDict {
  progressSegment: string;
  progressTitle: string;
  progressTitleWithVoice: string;
}

export function useGenerationProgressToast(
  voiceName?: string,
  dict?: SplitProgressDict,
) {
  const generationToastIdRef = useRef<ExternalToast['id'] | null>(null);

  const showGenerationProgressToast = useCallback(
    (segmentNumber: number, totalSegments: number, isComplete = false) => {
      const safeTotal = Math.max(1, totalSegments);
      const safeSegmentNumber = Math.max(1, segmentNumber);
      // Show (segmentNumber - 1) / total while a segment is in progress so we
      // only reach 100% once the final segment has actually finished.
      const progressPercent = isComplete
        ? 100
        : Math.max(0, Math.round(((safeSegmentNumber - 1) / safeTotal) * 100));
      const title = voiceName
        ? (dict?.progressTitleWithVoice ?? `${voiceName} generation`).replace(
            '__VOICE__',
            voiceName,
          )
        : (dict?.progressTitle ?? 'Audio generation');
      const segmentLabel = (
        dict?.progressSegment ?? 'Segment __CURRENT__/__TOTAL__'
      )
        .replace('__CURRENT__', String(safeSegmentNumber))
        .replace('__TOTAL__', String(safeTotal));

      const toastId = toast.loading(
        <div className="w-[280px] space-y-2">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <span>{title}</span>
          </div>
          <p className="text-sm">{segmentLabel}</p>
          <div className="h-2 w-full rounded bg-muted">
            <div
              className="h-2 rounded bg-primary transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-muted-foreground text-xs">{progressPercent}%</p>
        </div>,
        {
          duration: Number.POSITIVE_INFINITY,
          id: generationToastIdRef.current || undefined,
        },
      );

      generationToastIdRef.current = toastId;
    },
    [
      voiceName,
      dict?.progressTitle,
      dict?.progressTitleWithVoice,
      dict?.progressSegment,
    ],
  );

  const dismissGenerationProgressToast = useCallback(() => {
    if (!generationToastIdRef.current) {
      return;
    }

    toast.dismiss(generationToastIdRef.current);
    generationToastIdRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      dismissGenerationProgressToast();
    };
  }, [dismissGenerationProgressToast]);

  return {
    showGenerationProgressToast,
    dismissGenerationProgressToast,
  };
}
