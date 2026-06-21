'use client';

import { useTranslations } from 'next-intl';

import { Progress } from '@/components/ui/progress';
import type { DownloadProgress } from '../hooks/use-transcriber';

interface Props {
  isTranscribing: boolean;
  progress: DownloadProgress[];
}

export function ProgressDisplay({ progress, isTranscribing }: Props) {
  const t = useTranslations('transcribe.progress');
  const downloadingFiles = progress.filter(
    (p) => p.status === 'progress' && p.progress != null,
  );
  const totalProgress =
    downloadingFiles.length > 0
      ? downloadingFiles.reduce((sum, p) => sum + (p.progress ?? 0), 0) /
        downloadingFiles.length
      : 0;

  const isDownloading = progress.some(
    (p) => p.status === 'progress' || p.status === 'initiate',
  );

  if (!(isDownloading || isTranscribing)) return null;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-center gap-3">
        <div
          className="flex shrink-0 items-end gap-[3px]"
          style={{ height: '18px' }}
        >
          {[
            { key: 'progress-wave-1', height: 10, delay: '0s' },
            { key: 'progress-wave-2', height: 16, delay: '0.12s' },
            { key: 'progress-wave-3', height: 18, delay: '0.24s' },
            { key: 'progress-wave-4', height: 12, delay: '0.36s' },
            { key: 'progress-wave-5', height: 14, delay: '0.48s' },
          ].map((wave) => (
            <div
              className="wave-bar"
              key={wave.key}
              style={{
                height: `${wave.height}px`,
                animationDelay: wave.delay,
              }}
            />
          ))}
        </div>
        <span className="font-medium text-foreground text-sm">
          {isTranscribing ? t('transcribing') : t('downloading')}
        </span>
      </div>

      {isDownloading && (
        <>
          <Progress value={Math.min(totalProgress, 100)} />
          <p className="text-muted-foreground text-xs">
            {Math.round(totalProgress)}% — {t('modelCacheHint')}
          </p>
        </>
      )}

      {isTranscribing && (
        <p className="text-muted-foreground text-xs">{t('processingHint')}</p>
      )}
    </div>
  );
}
