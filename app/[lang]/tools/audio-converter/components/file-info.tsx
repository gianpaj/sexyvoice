'use client';

import { FileAudio, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface Props {
  file: File;
  onRemove: () => void;
  disabled: boolean;
  dict: {
    remove: string;
  };
}

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toUpperCase() || 'AUDIO';
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

export function FileInfo({ file, onRemove, disabled, dict }: Props) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/50 p-4">
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center">
        <FileAudio className="h-6 w-6 text-primary-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground" title={file.name}>
          {file.name}
        </p>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-brand-purple text-xs">
            {getFileExtension(file.name)}
          </span>
          <span className="text-nowrap">{formatFileSize(file.size)}</span>
        </div>
      </div>
      <Button
        aria-label={dict.remove}
        className="flex-shrink-0 hover:bg-destructive/10 hover:text-destructive"
        disabled={disabled}
        onClick={onRemove}
        size="icon"
        variant="ghost"
      >
        <X className="h-5 w-5" />
      </Button>
    </div>
  );
}
