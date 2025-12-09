'use client';

import { FileAudio, Music, Upload } from 'lucide-react';
import { useCallback, useState } from 'react';

import type langDict from '@/lib/i18n/dictionaries/en.json';
import { cn } from '@/lib/utils';

interface Props {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  dict: (typeof langDict)['audioConverter']['dropZone'];
}

export function DropZone({ onFileSelect, dict, disabled = false }: Props) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith('audio/')) {
        onFileSelect(file);
      }
    },
    [onFileSelect],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect],
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  return (
    // biome-ignore lint/a11y/useSemanticElements: we need a div, not a button
    <div
      // className="cursor-pointer rounded-lg border-2 border-muted-foreground/25 border-dashed p-12 text-center transition-colors hover:border-muted-foreground/50"
      className={cn(
        'group relative cursor-pointer transition-all duration-300 ease-out',
        'rounded-2xl border-2 border-dashed',
        'p-8 md:p-12',
        disabled && 'cursor-not-allowed opacity-50',
        isDragging
          ? 'scale-[1.02] border-primary bg-primary/10 shadow-glow'
          : 'border-border hover:border-primary/50 hover:bg-muted/50',
      )}
      onClick={() => document.getElementById('file-input')?.click()}
      // onDragOver={handleDragOver}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onKeyDown={() => document.getElementById('file-input')?.click()}
      role="button"
      tabIndex={0}
    >
      <input
        accept="audio/*"
        className="hidden"
        id="file-input"
        onChange={handleFileInput}
        type="file"
      />
      <div className="pointer-events-none flex flex-col items-center gap-4">
        {/* Animated Icons */}
        <div className="relative h-20 w-20">
          <div
            className={cn(
              'gradient-bg absolute inset-0 rounded-full opacity-20 blur-xl transition-all duration-300',
              isDragging && 'scale-125 opacity-40',
            )}
          />
          <div
            className={cn(
              'relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20',
              'transition-transform duration-300',
              isDragging ? 'scale-110' : 'group-hover:scale-105',
            )}
          >
            {isDragging ? (
              <FileAudio className="h-10 w-10 animate-bounce-subtle text-primary" />
            ) : (
              <Upload className="h-10 w-10 text-primary group-hover:animate-bounce-subtle" />
            )}
          </div>

          {/* Floating music notes */}
          <Music className="-top-2 -right-2 absolute h-5 w-5 animate-float text-teal-700 opacity-70" />
          <Music className="-bottom-1 -left-3 absolute h-4 w-4 animate-float-delayed text-brand-purple opacity-60" />
        </div>

        {/* Text */}
        <div className="space-y-2 text-center">
          <p className="font-semibold text-foreground text-lg md:text-xl">
            {dict.title}
          </p>

          <p className="font-medium text-primary text-sm hover:underline">
            {dict.description}
          </p>
        </div>

        {/* Supported formats */}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {['MP3', 'WAV', 'AAC', 'OGG', 'FLAC', 'M4A', 'MP4'].map((format) => (
            <span
              className="rounded-full bg-muted px-2 py-1 font-medium text-muted-foreground text-xs"
              key={format}
            >
              {format}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
