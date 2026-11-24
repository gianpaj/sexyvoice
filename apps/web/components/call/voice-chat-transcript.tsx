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
import { VoiceChatReply } from './voice-chat-reply';

export interface VoiceChatMessage {
  id: string;
  text: string;
  user: boolean;
}

export interface VoiceChatTranscriptHandle {
  scrollToLatest: () => void;
}

interface VoiceChatTranscriptProps {
  inCall?: boolean;
  messages: VoiceChatMessage[];
  ref?: Ref<VoiceChatTranscriptHandle>;
  revealReplyId?: string;
  status?: string;
  streamingReply?: boolean;
}

// Message Scroller with bottom-aligned Message/Bubble rows.
export function VoiceChatTranscript({
  inCall,
  messages,
  ref,
  revealReplyId,
  status,
  streamingReply,
}: VoiceChatTranscriptProps) {
  const t = useTranslations('voiceChat');
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const followsLatest = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const latestId = messages.at(-1)?.id;

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
        className={cn(
          'h-full overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-ring',
          !inCall && 'rounded-2xl border bg-muted/25',
        )}
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
        <div
          className={cn(
            'flex min-h-full flex-col',
            inCall ? 'px-5 py-4' : 'p-3 sm:p-4',
          )}
          ref={content}
        >
          <div className="mt-auto flex flex-col gap-2">
            {messages.map(({ id, text, user }) => (
              <div
                className={cn('flex min-w-0', user && 'justify-end')}
                key={id}
              >
                <div
                  className={cn(
                    'wrap-anywhere max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    user
                      ? 'whitespace-pre-wrap rounded-ee-md'
                      : 'rounded-es-md [&_p+p]:mt-2 [&_p]:whitespace-pre-wrap',
                    user &&
                      (inCall
                        ? 'bg-[#4c41a0] text-white'
                        : 'bg-primary text-primary-foreground'),
                    !user &&
                      (inCall
                        ? 'border border-[#242c52] bg-[#161d3b] text-slate-100'
                        : 'bg-muted text-foreground'),
                  )}
                  data-slot="voice-chat-bubble"
                >
                  {user ? (
                    text
                  ) : (
                    <VoiceChatReply
                      paced={id === latestId && id === revealReplyId}
                      streaming={id === latestId && streamingReply}
                      text={text}
                    />
                  )}
                </div>
              </div>
            ))}
            {status && (
              <p
                className="self-start px-3.5 py-2 text-muted-foreground text-sm"
                role="status"
              >
                {inCall ? (
                  <>
                    <span className="sr-only">{status}</span>
                    <span aria-hidden="true" className="flex gap-1.5 py-1">
                      <span className="size-1.5 rounded-full bg-violet-400/50" />
                      <span className="size-1.5 rounded-full bg-violet-400/75" />
                      <span className="size-1.5 rounded-full bg-violet-400" />
                    </span>
                  </>
                ) : (
                  status
                )}
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
