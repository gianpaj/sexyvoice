'use client';

import { useCallback } from 'react';
import { Upload } from 'lucide-react';

interface Props {
  onFileSelect: (file: File) => void;
  dict: {
    title: string;
    description: string;
    supportedFormats: string;
  };
}

export function DropZone({ onFileSelect, dict }: Props) {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('audio/')) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center hover:border-muted-foreground/50 transition-colors cursor-pointer"
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <input
        id="file-input"
        type="file"
        accept="audio/*"
        onChange={handleFileInput}
        className="hidden"
      />
      <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
      <h3 className="text-lg font-semibold mb-2">{dict.title}</h3>
      <p className="text-sm text-muted-foreground mb-1">{dict.description}</p>
      <p className="text-xs text-muted-foreground">{dict.supportedFormats}</p>
    </div>
  );
}
