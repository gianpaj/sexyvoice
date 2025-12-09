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
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
      </div>

      <div>
        <h2 className="mb-2 font-bold text-2xl">{dict.title}</h2>
        <p className="text-muted-foreground">{dict.description}</p>
      </div>

      <div className="rounded-lg bg-muted p-4">
        <p className="font-medium">{newFileName}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button className="flex-1" onClick={onDownload} size="lg">
          <Download className="mr-2 h-4 w-4" />
          {dict.download}
        </Button>
        <Button
          className="flex-1"
          onClick={onConvertAnother}
          size="lg"
          variant="outline"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {dict.convertAnother}
        </Button>
      </div>
    </div>
  );
}
