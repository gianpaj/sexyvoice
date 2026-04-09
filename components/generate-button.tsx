import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { TextShimmer } from './motion-primitives/text-shimmer';
import { Button, type ButtonProps } from './ui/button';

export function GenerateButton({
  className,
  disabled,
  isGenerating,
  ctaText,
  generatingText,
  ...rest
}: ButtonProps & {
  isGenerating: boolean;
  generatingText: string;
  ctaText: string;
}) {
  const [shortcutKey, setShortcutKey] = useState('⌘+Enter');

  useEffect(() => {
    const isMac =
      navigator.platform.toUpperCase().indexOf('MAC') >= 0 ||
      navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
    setShortcutKey(isMac ? '⌘+Enter' : 'Ctrl+Enter');
  }, []);
  return (
    <Button
      {...rest}
      className={cn('disabled:bg-primary/60 disabled:opacity-100', className)}
      disabled={disabled}
    >
      {isGenerating ? (
        <span className="flex items-center">
          <TextShimmer
            className="text-sm [--base-color:var(--color-blue-500)] [--base-gradient-color:var(--color-blue-300)]"
            duration={3}
          >
            {generatingText}
          </TextShimmer>
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {ctaText}
          <span className="rounded-sm border border-gray-400 p-1 text-gray-300 text-xs opacity-70">
            {shortcutKey}
          </span>
        </span>
      )}
    </Button>
  );
}
