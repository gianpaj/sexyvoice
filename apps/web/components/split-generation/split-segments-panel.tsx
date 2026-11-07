'use client';

import { CheckCircle2, Download, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { AudioPlayerWithContext } from '@/components/audio-player-with-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SPLIT_SEGMENT_MAX_LENGTH } from './split-text';
import type {
  SplitGeneration,
  SplitSegmentStatus,
} from './use-split-generation';

const STATUS_LABEL_KEYS = {
  failed: 'split.statusFailed',
  generating: 'split.statusGenerating',
  idle: 'split.statusPending',
  success: 'split.statusGenerated',
} as const satisfies Record<SplitSegmentStatus, string>;

export function SplitSegmentsPanel({
  isGenerating,
  onDownloadSegment,
  onRetrySegment,
  split,
}: {
  isGenerating: boolean;
  onDownloadSegment: (url: string) => void;
  onRetrySegment: (index: number) => void;
  split: SplitGeneration;
}) {
  const t = useTranslations('generate');
  const { isDownloadingAll, isJoining, segments } = split;

  if (segments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-lg border-0 p-0 md:border md:border-input md:p-3">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">{t('split.segmentPreviews')}</p>
        {split.allGenerated && (
          <Button
            className="h-8 text-xs"
            disabled={isDownloadingAll || isJoining}
            onClick={split.downloadAll}
            size="sm"
            variant="outline"
          >
            {isDownloadingAll || isJoining ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                {t('split.joiningWav')}
              </>
            ) : (
              t('split.downloadAll')
            )}
          </Button>
        )}
      </div>
      {segments.map((segment, index) => {
        let segmentStatusIcon: ReactNode = null;
        if (segment.status === 'success') {
          segmentStatusIcon = (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          );
        } else if (segment.status === 'generating') {
          segmentStatusIcon = (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          );
        }

        return (
          <div
            className="space-y-2 rounded-md border border-input px-3 py-2"
            key={segment.id}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {segmentStatusIcon}
                <p className="font-medium text-sm">
                  {t('split.segmentLabel').replace(
                    '__INDEX__',
                    String(index + 1),
                  )}
                </p>
              </div>
              <p className="text-muted-foreground text-xs">
                {t(STATUS_LABEL_KEYS[segment.status])}
              </p>
              {segment.status === 'failed' && (
                <Button
                  className="h-6 px-2 text-xs"
                  disabled={isGenerating}
                  onClick={() => onRetrySegment(index)}
                  size="sm"
                  variant="outline"
                >
                  {t('split.retry')}
                </Button>
              )}
            </div>
            <Textarea
              className="min-h-64 text-sm sm:min-h-32"
              disabled={isGenerating}
              maxLength={SPLIT_SEGMENT_MAX_LENGTH}
              onChange={(event) =>
                split.updateSegmentText(index, event.target.value)
              }
              value={segment.text}
            />
            {segment.audioUrl && (
              <div className="flex items-center gap-2">
                <AudioPlayerWithContext
                  className="rounded-md"
                  playAudioTitle={t('playAudio')}
                  progressColor="#8b5cf6"
                  showWaveform
                  url={segment.audioUrl}
                  waveColor="#888888"
                  waveformClassName="w-40"
                />
                <Button
                  aria-label={t('downloadAudio')}
                  onClick={() => onDownloadSegment(segment.audioUrl)}
                  size="icon"
                  title={t('downloadAudio')}
                  variant="secondary"
                >
                  <Download className="size-5" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
      {split.isJoinerLoading && (
        <p className="text-muted-foreground text-xs">
          {t('split.preparingJoiner')}
        </p>
      )}
    </div>
  );
}
