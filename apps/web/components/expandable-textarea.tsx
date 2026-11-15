'use client';

import { Maximize2, Minimize2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { resizeTextarea } from '@/lib/react-textarea-autosize';
import { cn } from '@/lib/utils';

/**
 * A textarea that grows with its text up to ten rows and expands to 30vh from
 * its top-right toggle. The parent positions the toggle (`relative`), and
 * `children` render beside it, such as more overlay buttons.
 */
export function ExpandableTextarea({
  children,
  className,
  compactHeight,
  minRows,
  style,
  value,
  ...props
}: Omit<ComponentProps<typeof Textarea>, 'children' | 'value'> & {
  children?: ReactNode;
  /** Height before the text grows it. */
  compactHeight: string;
  minRows: number;
  value: string | undefined;
}) {
  const t = useTranslations('generate');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the height follows the text
  useEffect(() => {
    if (textareaRef.current && !isFullscreen) {
      resizeTextarea(textareaRef.current, minRows, 10, '--textarea-height');
    }
  }, [isFullscreen, minRows, value]);

  return (
    <>
      <Textarea
        className={cn(
          'textarea-autosize transition-[height] duration-200 ease-in-out',
          className,
        )}
        ref={textareaRef}
        style={
          {
            '--textarea-height': isFullscreen ? '30vh' : compactHeight,
            ...style,
          } as CSSProperties
        }
        value={value}
        {...props}
      />
      <Button
        className="absolute top-2 right-2 h-8 w-8 text-zinc-400 hover:bg-zinc-800 hover:text-white"
        onClick={() => setIsFullscreen(!isFullscreen)}
        size="icon"
        title={t('fullscreenTitle')}
        variant="ghost"
      >
        {isFullscreen ? (
          <Minimize2 className="h-4 w-4" />
        ) : (
          <Maximize2 className="h-4 w-4" />
        )}
      </Button>
      {children}
    </>
  );
}
