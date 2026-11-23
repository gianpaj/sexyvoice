'use client';

import { fetchServerSentEvents, useChat } from '@tanstack/ai-react';
import { ArrowDown, Phone, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useLayoutEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CHAT_ROUTE } from '@/lib/voice-spike/protocol';

interface ChatProps {
  draft: string;
  error: string | null;
  onDraft: (text: string) => void;
  onRefresh: () => void;
  onRememberThread: (id: string) => void;
  onStartCall: () => Promise<void>;
  threadId: string;
}

function chatConnection(rememberThread: () => void) {
  return fetchServerSentEvents(CHAT_ROUTE, {
    fetchClient: async (input, init) => {
      if (init?.method !== 'GET' || !String(input).includes('threadId='))
        return fetch(input, init);

      // Call teardown flushes committed history before it releases the lease.
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const response = await fetch(input, init);
        if (!response.ok) return response;
        const history = await response.clone().json();
        if (!history.callActive) {
          if (history.messages?.length) rememberThread();
          return response;
        }
        await response.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      return new Response(null, { status: 409 });
    },
  });
}

export function VoiceSpikeChat({
  threadId,
  draft,
  error,
  onDraft,
  onStartCall,
  onRememberThread,
  onRefresh,
}: ChatProps) {
  const t = useTranslations('voiceSpike');
  const [connection] = useState(() =>
    chatConnection(() => onRememberThread(threadId)),
  );
  const [hasNewerMessages, setHasNewerMessages] = useState(false);
  const [awaitingText, setAwaitingText] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const followsLatest = useRef(true);
  const pending = useRef<string | null>(null);
  const currentDraft = useRef(draft);
  currentDraft.current = draft;

  const chat = useChat({
    connection,
    persistence: true,
    threadId,
    queue: 'drop',
    onChunk: (event) => {
      if (event.type === 'RUN_STARTED' && pending.current !== null) {
        if (currentDraft.current.trim() === pending.current) onDraft('');
        pending.current = null;
        onRememberThread(threadId);
      }
      if (
        event.type === 'TEXT_MESSAGE_CONTENT' ||
        event.type === 'RUN_FINISHED' ||
        event.type === 'RUN_ERROR'
      )
        setAwaitingText(false);
    },
  });

  const lastMessage = chat.messages.at(-1);
  const hasReply =
    lastMessage?.role === 'assistant' &&
    lastMessage.parts.some(
      (part) => part.type === 'text' && part.content.length > 0,
    );
  const thinking =
    awaitingText || ((chat.isLoading || chat.sessionGenerating) && !hasReply);
  // biome-ignore lint/correctness/useExhaustiveDependencies: streaming changes the scroll height.
  useLayoutEffect(() => {
    const element = viewport.current;
    if (element && followsLatest.current)
      element.scrollTop = element.scrollHeight;
  }, [chat.messages, thinking]);

  const jumpToLatest = () => {
    const element = viewport.current;
    if (element) element.scrollTop = element.scrollHeight;
    followsLatest.current = true;
    setHasNewerMessages(false);
  };

  const unavailable = Boolean(chat.error);
  const busy =
    chat.isHydrating || chat.isLoading || chat.sessionGenerating || submitting;
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy || unavailable || pending.current) return;
    pending.current = text;
    setSubmitting(true);
    setAwaitingText(true);
    jumpToLatest();
    // A reload can recover an accepted POST even if its response never arrives.
    const here = new URL(window.location.href);
    here.searchParams.set('conversation', threadId);
    window.history.replaceState(null, '', here);
    try {
      await chat.sendMessage(text);
    } finally {
      pending.current = null;
      setSubmitting(false);
      setAwaitingText(false);
    }
  };

  return (
    <section className="mx-auto flex h-[calc(100dvh-10rem)] min-h-72 w-full max-w-2xl flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-semibold text-xl">{t('title')}</h1>
        <Button
          aria-label={t('call')}
          disabled={busy || unavailable}
          onClick={() => onStartCall().catch(() => undefined)}
          size="icon"
        >
          <Phone />
        </Button>
      </header>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <div className="relative min-h-0 flex-1">
        <div
          aria-label={t('messages')}
          className="flex h-full flex-col gap-3 overflow-y-auto rounded-md border p-3"
          onScroll={(event) => {
            const element = event.currentTarget;
            const atEnd =
              element.scrollHeight - element.scrollTop - element.clientHeight <=
              32;
            followsLatest.current = atEnd;
            setHasNewerMessages(!atEnd);
          }}
          ref={viewport}
          role="log"
        >
          <div className="mt-auto flex flex-col gap-3">
            {chat.messages.map((message) => {
              const text = message.parts
                .filter((part) => part.type === 'text')
                .map((part) => part.content)
                .join('\n');
              if (!text) return null;
              return (
                <p
                  className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm ${message.role === 'user' ? 'self-end bg-primary text-primary-foreground' : 'self-start bg-muted'}`}
                  key={message.id}
                >
                  {text}
                </p>
              );
            })}
            {(thinking || chat.isHydrating) && (
              <p className="text-muted-foreground text-sm" role="status">
                {t(thinking ? 'thinking' : 'loadingChat')}
              </p>
            )}
          </div>
        </div>
        {hasNewerMessages && (
          <Button
            aria-label={t('latest')}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow"
            onClick={jumpToLatest}
            size="icon"
            variant="outline"
          >
            <ArrowDown />
          </Button>
        )}
      </div>
      {unavailable && (
        <div className="flex items-center justify-between gap-2" role="alert">
          <p className="text-destructive text-sm">{t('chatError')}</p>
          <Button onClick={onRefresh} size="sm" variant="outline">
            {t('refreshChat')}
          </Button>
        </div>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => send(event).catch(() => undefined)}
      >
        <Textarea
          aria-label={t('message')}
          maxLength={2000}
          onChange={(event) => onDraft(event.target.value)}
          placeholder={t('chatPlaceholder')}
          rows={2}
          value={draft}
        />
        <Button
          aria-label={t('send')}
          disabled={busy || unavailable || !draft.trim()}
          size="icon"
          type="submit"
        >
          <Send />
        </Button>
      </form>
    </section>
  );
}
