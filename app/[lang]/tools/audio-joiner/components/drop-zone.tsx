'use client';

import { Plus } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DropZoneProps {
  disabled?: boolean;
  compact?: boolean;
  title: string;
  subtitle: string;
  addFilesLabel: string;
  onFilesSelected: (files: File[]) => void;
}

export function DropZone({
  disabled = false,
  compact = false,
  title,
  subtitle,
  addFilesLabel,
  onFilesSelected,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleSelect = useCallback(
    (files: FileList | null) => {
      if (!files) {
        return;
      }

      const audioFiles = Array.from(files).filter((file) =>
        file.type.startsWith('audio/'),
      );

      if (audioFiles.length > 0) {
        onFilesSelected(audioFiles);
      }
    },
    [onFilesSelected],
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleSelect(event.target.files);
      event.currentTarget.value = '';
    },
    [handleSelect],
  );

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: drop zone needs drag events
    // biome-ignore lint/a11y/noStaticElementInteractions: drop zone needs drag events
    <div
      className={cn(
        'rounded-2xl border-2 border-dashed transition-all',
        compact ? 'px-4 py-3' : 'p-8 text-center',
        isDragging
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-primary/50',
        disabled && 'cursor-not-allowed opacity-50',
      )}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) {
          setIsDragging(true);
        }
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragging(false);
      }}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        if (!disabled) {
          handleSelect(event.dataTransfer.files);
        }
      }}
    >
      {compact ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">{subtitle}</p>
          <Button
            className="shrink-0 rounded-full"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            type="button"
            variant="secondary"
          >
            <Plus className="mr-1 h-4 w-4" />
            {addFilesLabel}
          </Button>
        </div>
      ) : (
        <>
          <h2 className="font-semibold text-lg">{title}</h2>
          <p className="mt-1 text-muted-foreground text-sm">{subtitle}</p>
          <Button
            className="mt-4 rounded-full"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            type="button"
            variant="secondary"
          >
            <Plus className="mr-1 h-4 w-4" />
            {addFilesLabel}
          </Button>
        </>
      )}

      <input
        accept="audio/*"
        className="hidden"
        disabled={disabled}
        multiple
        onChange={handleInputChange}
        ref={inputRef}
        type="file"
      />
    </div>
  );
}
