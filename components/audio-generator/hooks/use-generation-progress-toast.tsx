'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { ExternalToast } from 'sonner';

import { toast } from '@/components/services/toast';

export function useGenerationProgressToast(voiceName?: string) {
  const generationToastIdRef = useRef<ExternalToast['id'] | null>(null);

  const showGenerationProgressToast = useCallback(
    (segmentIndex: number, totalSegments: number) => {
      const safeTotal = Math.max(1, totalSegments);
      const progressPercent = Math.round((segmentIndex / safeTotal) * 100);
      const title = voiceName ? `${voiceName} generation` : 'Audio generation';

      const toastId = toast.loading(
        <div className="w-[280px] space-y-2">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <span>{title}</span>
          </div>
          <p className="text-sm">
            Segment {segmentIndex}/{safeTotal}
          </p>
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
    [voiceName],
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
