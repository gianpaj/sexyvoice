'use client';

import { FileAudio, Music, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

const SUPPORTED_FORMATS = ['MP3', 'WAV', 'AAC', 'OGG', 'FLAC', 'M4A', 'MP4'];

// Browsers report MP4 as video/mp4 and leave `type` empty for some FLAC and
// M4A files, so a listed extension counts as audio too.
const ACCEPT = [
  'audio/*',
  ...SUPPORTED_FORMATS.map((format) => `.${format.toLowerCase()}`),
].join(',');

function isSupportedFile(file: File) {
  const extension = file.name.split('.').pop()?.toUpperCase() ?? '';
  return (
    file.type.startsWith('audio/') || SUPPORTED_FORMATS.includes(extension)
  );
}

interface Props {
  disabled?: boolean;
  onFileSelect: (file: File) => void;
}

export function DropZone({ onFileSelect, disabled = false }: Props) {
  const t = useTranslations('audioConverter.dropZone');
  const tErrors = useTranslations('audioConverter.errors');
  const [isDragging, setIsDragging] = useState(false);

  const selectFile = (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (isSupportedFile(file)) {
      onFileSelect(file);
    } else {
      toast.error(tErrors('unsupportedFormat'));
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    selectFile(e.dataTransfer.files[0]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    selectFile(e.target.files?.[0]);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragIn = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragOut = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: we need a div, not a button
    <div
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
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onKeyDown={() => document.getElementById('file-input')?.click()}
      role="button"
      tabIndex={0}
    >
      <input
        accept={ACCEPT}
        className="hidden"
        id="file-input"
        onChange={handleFileInput}
        type="file"
      />
      <div className="pointer-events-none flex flex-col items-center gap-4">
        <div className="relative h-20 w-20">
          <div
            className={cn(
              'gradient-bg absolute inset-0 rounded-full opacity-20 blur-xl transition-all duration-300',
              isDragging && 'scale-125 opacity-40',
            )}
          />
          <div
            className={cn(
              'relative flex h-20 w-20 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-accent/20',
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

          <Music className="absolute -top-2 -right-2 h-5 w-5 animate-float text-teal-700 opacity-70" />
          <Music className="absolute -bottom-1 -left-3 h-4 w-4 animate-float-delayed text-brand-purple opacity-60" />
        </div>

        <div className="space-y-2 text-center">
          <p className="font-semibold text-foreground text-lg md:text-xl">
            {t('title')}
          </p>

          <p className="font-medium text-primary text-sm hover:underline">
            {t('description')}
          </p>
        </div>

        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {SUPPORTED_FORMATS.map((format) => (
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
