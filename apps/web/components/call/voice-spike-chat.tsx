'use client';

import { fetchServerSentEvents, useChat } from '@tanstack/ai-react';
import { ArrowDown, Phone, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type FormEvent,
  useActionState,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CHAT_HISTORY_PAGE_SIZE, CHAT_ROUTE } from '@/lib/voice-spike/protocol';

export interface VoiceSpikeMessage {
  id: string;
  text: string;
  user: boolean;
}

export interface SpikeCharacterPicker {
  characterName?: string;
  characters?: { id: string; name: string }[];
  startConversation?: (previous: boolean, form: FormData) => Promise<boolean>;
}

interface ChatProps extends SpikeCharacterPicker {
  draft: string;
  error: string | null;
  onDraft: (text: string) => void;
  onRefresh: () => void;
  onRememberThread: (id: string) => void;
  onStartCall: (history: VoiceSpikeMessage[]) => Promise<void>;
  threadId: string;
}

export function VoiceSpikeChat({
  threadId,
  characterName,
  characters,
  startConversation,
  draft,
  error,
  onDraft,
  onStartCall,
  onRememberThread,
  onRefresh,
}: ChatProps) {
  const t = useTranslations('voiceSpike');
  const [callActive, setCallActive] = useState(false);
  const [connection] = useState(() =>
    fetchServerSentEvents(CHAT_ROUTE, {
      fetchClient: async (input, init) => {
        const response = await fetch(input, init);
        if (
          response.ok &&
          init?.method === 'GET' &&
          String(input).includes('threadId=')
        ) {
          const history = await response.clone().json();
          setCallActive(history.callActive === true);
          if (history.messages?.length) onRememberThread(threadId);
        }
        return response;
      },
    }),
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
    history: { pageSize: CHAT_HISTORY_PAGE_SIZE },
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

  useEffect(() => {
    if (!callActive) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const poll = async () => {
      try {
        const response = await fetch(`${CHAT_ROUTE}?threadId=${threadId}`, {
          signal: controller.signal,
        });
        if (response.ok) {
          const history = await response.json();
          // Rehydrate once to load the final call turns before enabling sends.
          if (!controller.signal.aborted && history.callActive === false) {
            onRefresh();
            return;
          }
        }
      } catch {
        // Keep saved messages on screen during a temporary network failure.
      }
      if (!controller.signal.aborted) {
        attempts += 1;
        retry = setTimeout(poll, attempts < 5 ? 1000 : 5000);
      }
    };
    retry = setTimeout(poll, 1000);
    return () => {
      controller.abort();
      clearTimeout(retry);
    };
  }, [callActive, onRefresh, threadId]);

  const visibleMessages = chat.messages.flatMap((message) => {
    const text = message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.content)
      .join('\n');
    return text
      ? [{ id: message.id, text, user: message.role === 'user' }]
      : [];
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
    callActive ||
    chat.isHydrating ||
    chat.isLoading ||
    chat.sessionGenerating ||
    submitting;
  let status: 'thinking' | 'loadingChat' | 'endingCall' | undefined;
  if (thinking) status = 'thinking';
  else if (chat.isHydrating) status = 'loadingChat';
  else if (callActive) status = 'endingCall';
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
        <h1 className="font-semibold text-xl">{characterName ?? t('title')}</h1>
        <Button
          aria-label={t('call')}
          disabled={busy || unavailable}
          onClick={() => onStartCall(visibleMessages).catch(() => undefined)}
          size="icon"
        >
          <Phone />
        </Button>
      </header>
      {startConversation && (characters?.length || characterName) ? (
        <CharacterPicker
          characters={characters ?? []}
          disabled={busy}
          startConversation={startConversation}
        />
      ) : null}
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
            {visibleMessages.map((message) => (
              <p
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm ${message.user ? 'self-end bg-primary text-primary-foreground' : 'self-start bg-muted'}`}
                key={message.id}
              >
                {message.text}
              </p>
            ))}
            {status && (
              <p className="text-muted-foreground text-sm" role="status">
                {t(status)}
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

function CharacterPicker({
  characters,
  disabled,
  startConversation,
}: Required<Pick<SpikeCharacterPicker, 'characters' | 'startConversation'>> & {
  disabled: boolean;
}) {
  const t = useTranslations('voiceSpike');
  const [ok, submit, pending] = useActionState(startConversation, true);
  return (
    <form action={submit}>
      <fieldset
        className="flex items-center gap-2"
        disabled={disabled || pending}
      >
        <select
          aria-label={t('character')}
          className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
          defaultValue=""
          name="character"
          required
        >
          <option disabled value="">
            {t('character')}
          </option>
          <option value="demo">{t('title')}</option>
          {characters.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <Button size="sm" type="submit" variant="outline">
          {t('newConversation')}
        </Button>
      </fieldset>
      {!ok && (
        <p className="text-destructive text-sm" role="alert">
          {t('characterError')}
        </p>
      )}
    </form>
  );
}
