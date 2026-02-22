'use client';

import { Progress } from '@/components/ui/progress';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import type { DownloadProgress } from '../hooks/use-transcriber';

interface Props {
  progress: DownloadProgress[];
  isTranscribing: boolean;
  dict: (typeof langDict)['transcribe']['progress'];
}

export function ProgressDisplay({ progress, isTranscribing, dict }: Props) {
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
          className="flex items-end gap-[3px] shrink-0"
          style={{ height: '18px' }}
        >
          {([10, 16, 18, 12, 14] as const).map((h, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static decorative array
              key={i}
              className="wave-bar"
              style={{
                height: `${h}px`,
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}
        </div>
        <span className="font-medium text-foreground text-sm">
          {isTranscribing ? dict.transcribing : dict.downloading}
        </span>
      </div>

      {isDownloading && (
        <>
          <Progress value={Math.min(totalProgress, 100)} />
          <p className="text-muted-foreground text-xs">
            {Math.round(totalProgress)}% — {dict.modelCacheHint}
          </p>
        </>
      )}

      {isTranscribing && (
        <p className="text-muted-foreground text-xs">{dict.processingHint}</p>
      )}
    </div>
  );
}
