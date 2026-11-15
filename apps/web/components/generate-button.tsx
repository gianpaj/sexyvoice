import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { TextShimmer } from './motion-primitives/text-shimmer';
import { Button, type ButtonIconProps } from './ui/button';

/**
 * A page's primary action. Cmd/Ctrl+Enter anywhere on the page presses it;
 * a disabled button ignores the press.
 */
export function GenerateButton({
  className,
  disabled,
  isGenerating,
  ctaText,
  generatingText,
  ...rest
}: ButtonIconProps & {
  isGenerating: boolean;
  generatingText: string;
  ctaText: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [shortcutKey, setShortcutKey] = useState('⌘+Enter');

  useEffect(() => {
    const isMac =
      navigator.platform.toUpperCase().indexOf('MAC') >= 0 ||
      navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
    setShortcutKey(isMac ? '⌘+Enter' : 'Ctrl+Enter');
  }, []);

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!((event.metaKey || event.ctrlKey) && event.key === 'Enter')) return;
    event.preventDefault();
    buttonRef.current?.click();
  });

  // onKeyDown is a useEffectEvent, so its identity is stable.
  useEffect(() => {
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <Button
      {...rest}
      className={cn('disabled:opacity-70', className)}
      disabled={disabled}
      ref={buttonRef}
    >
      {/* TODO: animate between states with motion.dev */}
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
