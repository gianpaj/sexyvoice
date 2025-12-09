'use client';

import { File, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface Props {
  file: File;
  onRemove: () => void;
  disabled: boolean;
  dict: {
    remove: string;
  };
}

export function FileInfo({ file, onRemove, disabled, dict }: Props) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round(bytes / k ** i)} ${sizes[i]}`;
  };

  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
      <div className="flex items-center gap-3">
        <File className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="font-medium">{file.name}</p>
          <p className="text-muted-foreground text-sm">
            {formatFileSize(file.size)}
          </p>
        </div>
      </div>
      <Button
        aria-label={dict.remove}
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
