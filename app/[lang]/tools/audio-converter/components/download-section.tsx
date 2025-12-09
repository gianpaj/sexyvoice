'use client';

import { CheckCircle2, Download, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface Props {
  fileName: string;
  format: string;
  onDownload: () => void;
  onConvertAnother: () => void;
  dict: {
    title: string;
    description: string;
    download: string;
    convertAnother: string;
  };
}

export function DownloadSection({
  fileName,
  format,
  onDownload,
  onConvertAnother,
  dict,
}: Props) {
  const baseName = fileName.split('.').slice(0, -1).join('.');
  const newFileName = `${baseName}.${format}`;

  return (
    <div className="animate-scale-in space-y-6 text-center">
      <div className="flex justify-center">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
      </div>

      <div>
        <h2 className="mb-2 font-bold text-2xl">{dict.title}</h2>
        <p className="text-muted-foreground">{dict.description}</p>
      </div>

      <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
        <p className="font-semibold">{newFileName}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          className="gradient-bg h-14 flex-1 font-semibold transition-opacity hover:opacity-90"
          onClick={onDownload}
        >
          <Download className="h-4 w-4" />
          {dict.download}
        </Button>
        <Button
          className="h-14 flex-1 font-semibold transition-colors hover:bg-muted"
          onClick={onConvertAnother}
          variant="outline"
        >
          <RefreshCw className="h-4 w-4" />
          {dict.convertAnother}
        </Button>
      </div>
    </div>
  );
}
