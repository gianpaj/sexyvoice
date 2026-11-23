'use client';

import { ArrowDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type Ref,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface VoiceChatMessage {
  id: string;
  text: string;
  user: boolean;
}

export interface VoiceChatTranscriptHandle {
  scrollToLatest: () => void;
}

interface VoiceChatTranscriptProps {
  messages: VoiceChatMessage[];
  ref?: Ref<VoiceChatTranscriptHandle>;
  status?: string;
}

// Message Scroller with bottom-aligned Message/Bubble rows.
export function VoiceChatTranscript({
  messages,
  ref,
  status,
}: VoiceChatTranscriptProps) {
  const t = useTranslations('voiceChat');
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const followsLatest = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const scrollToLatest = useCallback(() => {
    followsLatest.current = true;
    const element = viewport.current;
    if (element) element.scrollTop = element.scrollHeight;
    setShowJump(false);
  }, []);
  useImperativeHandle(ref, () => ({ scrollToLatest }), [scrollToLatest]);

  useLayoutEffect(() => {
    const element = viewport.current;
    const rows = content.current;
    if (!(element && rows)) return;

    scrollToLatest();
    // A reply, the expanding composer, or the viewport can change the live edge.
    const observer = new ResizeObserver(() => {
      if (followsLatest.current || element.scrollHeight <= element.clientHeight)
        scrollToLatest();
    });
    observer.observe(element);
    observer.observe(rows);
    return () => observer.disconnect();
  }, [scrollToLatest]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        aria-label={t('messages')}
        aria-relevant="additions"
        className="h-full overflow-y-auto overscroll-contain rounded-2xl border bg-muted/25 focus-visible:outline-2 focus-visible:outline-ring"
        onScroll={({ currentTarget }) => {
          const distance =
            currentTarget.scrollHeight -
            currentTarget.scrollTop -
            currentTarget.clientHeight;
          followsLatest.current = distance <= 24;
          setShowJump(!followsLatest.current);
        }}
        ref={viewport}
        role="log"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Users need keyboard access to scroll the transcript.
        tabIndex={0}
      >
        <div className="flex min-h-full flex-col p-3 sm:p-4" ref={content}>
          <div className="mt-auto flex flex-col gap-2">
            {messages.map(({ id, text, user }) => (
              <div
                className={cn('flex min-w-0', user && 'justify-end')}
                key={id}
              >
                <p
                  className={cn(
                    'wrap-anywhere max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    user
                      ? 'rounded-ee-md bg-primary text-primary-foreground'
                      : 'rounded-es-md bg-muted text-foreground',
                  )}
                >
                  {text}
                </p>
              </div>
            ))}
            {status && (
              <p
                className="self-start px-3.5 py-2 text-muted-foreground text-sm"
                role="status"
              >
                {status}
              </p>
            )}
          </div>
        </div>
      </div>
      {showJump && (
        <Button
          aria-label={t('latest')}
          className="absolute bottom-3 left-1/2 size-11 -translate-x-1/2 rounded-full shadow"
          onClick={() => {
            scrollToLatest();
            viewport.current?.focus({ preventScroll: true });
          }}
          size="icon"
          type="button"
          variant="outline"
        >
          <ArrowDown aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
