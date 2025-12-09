'use client';

import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface Props {
  onClick: () => void;
  isConverting: boolean;
  disabled: boolean;
  progress: number;
  dict: {
    convert: string;
    converting: string;
    progress: string;
  };
}

export function ConvertButton({
  onClick,
  isConverting,
  disabled,
  progress,
  dict,
}: Props) {
  return (
    <div className="space-y-2">
      <Button
        className="w-full"
        disabled={disabled}
        onClick={onClick}
        size="lg"
      >
        {isConverting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {dict.converting}
          </>
        ) : (
          dict.convert
        )}
      </Button>
      {isConverting && (
        <div className="space-y-1">
          <div className="flex justify-between text-muted-foreground text-sm">
            <span>{dict.progress}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
