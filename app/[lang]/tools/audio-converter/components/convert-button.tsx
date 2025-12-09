'use client';

import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
        className={cn(
          'relative h-14 w-full overflow-hidden font-semibold text-md transition-all duration-300',
          'gradient-bg hover:opacity-90 hover:shadow-glow',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isConverting && 'cursor-wait',
        )}
        disabled={disabled || isConverting}
        onClick={onClick}
      >
        {/* Progress bar background */}
        {isConverting && (
          <div
            className="absolute inset-0 bg-primary-foreground/20 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        )}
        {isConverting ? (
          <span className="relative flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {dict.converting} {progress > 0 && `${Math.round(progress)}%`}
          </span>
        ) : (
          <span>{dict.convert}</span>
        )}
      </Button>
    </div>
  );
}
