'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useEffectEvent, useRef } from 'react';
import type { ExternalToast } from 'sonner';
import { toast } from 'sonner';

/** The loading toast that tracks a split run, segment by segment. */
export function useGenerationProgressToast(voiceName?: string) {
  const t = useTranslations('generate.split');
  const toastIdRef = useRef<ExternalToast['id'] | null>(null);

  const show = (
    segmentNumber: number,
    totalSegments: number,
    isComplete = false,
  ) => {
    const safeTotal = Math.max(1, totalSegments);
    const safeSegmentNumber = Math.max(1, segmentNumber);
    // Show (segmentNumber - 1) / total while a segment is in progress so we
    // only reach 100% once the final segment has actually finished.
    const progressPercent = isComplete
      ? 100
      : Math.max(0, Math.round(((safeSegmentNumber - 1) / safeTotal) * 100));
    const title = voiceName
      ? t('progressTitleWithVoice').replace('__VOICE__', voiceName)
      : t('progressTitle');
    const segmentLabel = t('progressSegment')
      .replace('__CURRENT__', String(safeSegmentNumber))
      .replace('__TOTAL__', String(safeTotal));

    toastIdRef.current = toast.loading(
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
        id: toastIdRef.current || undefined,
      },
    );
  };

  const dismiss = () => {
    if (!toastIdRef.current) {
      return;
    }

    toast.dismiss(toastIdRef.current);
    toastIdRef.current = null;
  };

  const dismissOnUnmount = useEffectEvent(dismiss);
  useEffect(() => () => dismissOnUnmount(), []);

  return { dismiss, show };
}
