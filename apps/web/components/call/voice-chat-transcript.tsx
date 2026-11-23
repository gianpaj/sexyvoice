'use client';

import { ArrowDown } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import {
  type Ref,
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
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
  revealReplyId?: string;
  status?: string;
}

// Message Scroller with bottom-aligned Message/Bubble rows.
export function VoiceChatTranscript({
  messages,
  ref,
  revealReplyId,
  status,
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
                  {!user && id === latestId && id === revealReplyId ? (
                    <PacedReply text={text} />
                  ) : (
                    text
                  )}
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

const REVEAL_INTERVAL_MS = 80;
const REVEAL_WINDOW_MS = 960;
const wordSegmenter =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : null;

function PacedReply({ text }: { text: string }) {
  const reduceMotion = useReducedMotion();
  const wordStarts = useMemo(
    () =>
      Array.from(wordSegmenter?.segment(text) ?? []).flatMap(
        ({ index, isWordLike }) => (isWordLike ? [index] : []),
      ),
    [text],
  );
  const [shownWords, setShownWords] = useState(6);
  const hasBacklog = shownWords < wordStarts.length;

  const revealBatch = useEffectEvent((deadline: number) => {
    const stepsLeft = Math.max(
      1,
      Math.ceil((deadline - performance.now()) / REVEAL_INTERVAL_MS),
    );
    setShownWords((shown) => {
      const remaining = Math.max(0, wordStarts.length - shown);
      const batch = Math.max(3, Math.ceil(remaining / stepsLeft));
      return shown + Math.min(remaining, batch);
    });
  });

  useEffect(() => {
    if (reduceMotion || !hasBacklog) return;
    const deadline = performance.now() + REVEAL_WINDOW_MS;
    const timer = setInterval(() => revealBatch(deadline), REVEAL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasBacklog, reduceMotion]);

  return reduceMotion ? text : text.slice(0, wordStarts[shownWords]);
}
