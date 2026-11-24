'use client';

import { fetchServerSentEvents, useChat } from '@tanstack/ai-react';
import { ArrowLeft, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { Preset } from '@/data/presets';
import type { CallRecordingFiles } from '@/hooks/use-call-recording';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';
import {
  CHAT_BALANCE_ERROR,
  CHAT_HISTORY_PAGE_SIZE,
  CHAT_ROUTE,
} from '@/lib/voice-chat/protocol';
import { CallEndedView, CallRecordingDownloads } from './call-ended-view';
import { CharacterAvatar } from './character-avatar';
import { InworldCallFrame } from './inworld-call-frame';
import { VoiceChatComposer } from './voice-chat-composer';
import {
  type VoiceChatMessage,
  VoiceChatTranscript,
  type VoiceChatTranscriptHandle,
} from './voice-chat-transcript';

export interface VoiceChatCharacterPicker {
  characterName?: string;
  characters?: { id: string; name: string }[];
  startConversation?: (previous: boolean, form: FormData) => Promise<boolean>;
}

interface ChatProps extends VoiceChatCharacterPicker {
  draft: string;
  error: string | null;
  linked?: {
    callingAgain: boolean;
    duration?: string;
    onCallAgain: () => Promise<void>;
    onContinueChat: () => void;
    preset: Preset;
    recording?: CallRecordingFiles;
  };
  onDraft: (text: string) => void;
  onRefresh: () => void;
  onRememberThread: (id: string) => void;
  onStartCall: (history: VoiceChatMessage[]) => Promise<void>;
  threadId: string;
}

export function VoiceChatThread({
  threadId,
  characterName,
  characters,
  startConversation,
  draft,
  error,
  linked,
  onDraft,
  onStartCall,
  onRememberThread,
  onRefresh,
}: ChatProps) {
  const t = useTranslations('voiceChat');
  const [callActive, setCallActive] = useState(false);
  const [lowCredits, setLowCredits] = useState(false);
  const [connection] = useState(() =>
    fetchServerSentEvents(CHAT_ROUTE, {
      fetchClient: async (input, init) => {
        const response = await fetch(input, init);
        if (response.status === 402) setLowCredits(true);
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
  const [awaitingText, setAwaitingText] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [revealReplyId, setRevealReplyId] = useState<string>();
  const revealNextReply = useRef(false);
  const transcript = useRef<VoiceChatTranscriptHandle>(null);
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
      if (event.type === 'RUN_ERROR' && event.code === CHAT_BALANCE_ERROR)
        setLowCredits(true);
      if (event.type === 'RUN_STARTED' && pending.current !== null) {
        if (currentDraft.current.trim() === pending.current) onDraft('');
        pending.current = null;
        onRememberThread(threadId);
      }
      if (event.type === 'TEXT_MESSAGE_CONTENT' && revealNextReply.current) {
        revealNextReply.current = false;
        setRevealReplyId(event.messageId);
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
  const send = async () => {
    const text = draft.trim();
    if (!text || busy || unavailable || pending.current) return;
    pending.current = text;
    setLowCredits(false);
    revealNextReply.current = true;
    setRevealReplyId(undefined);
    setSubmitting(true);
    setAwaitingText(true);
    transcript.current?.scrollToLatest();
    // A reload can recover an accepted POST even if its response never arrives.
    const here = new URL(window.location.href);
    here.searchParams.set('conversation', threadId);
    window.history.replaceState(null, '', here);
    try {
      await chat.sendMessage(text);
    } finally {
      pending.current = null;
      revealNextReply.current = false;
      setSubmitting(false);
      setAwaitingText(false);
    }
  };

  const startCall = () => onStartCall(visibleMessages).catch(() => undefined);
  const errors = (
    <>
      {error && (
        <p className="px-4 py-2 text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      {unavailable && (
        <div
          className="flex items-center justify-between gap-2 px-4 py-2"
          role="alert"
        >
          <p className="text-destructive text-sm">
            {t(lowCredits ? 'chatLowCredits' : 'chatError')}
          </p>
          <Button onClick={onRefresh} size="sm" variant="outline">
            {t('refreshChat')}
          </Button>
        </div>
      )}
    </>
  );

  if (linked?.duration !== undefined) {
    return (
      <CallEndedView
        callDisabled={busy || unavailable}
        connecting={linked.callingAgain}
        duration={linked.duration}
        onCallAgain={() => linked.onCallAgain().catch(() => undefined)}
        onChat={linked.onContinueChat}
        preset={linked.preset}
        recording={linked.recording}
      >
        {callActive && (
          <p className="text-slate-400 text-sm" role="status">
            {t('endingCall')}
          </p>
        )}
        {errors}
      </CallEndedView>
    );
  }

  const body = (
    <>
      <header
        className={cn(
          'flex shrink-0 items-center justify-between gap-3',
          linked && 'border-[#242c52] border-b px-4 py-3',
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {linked && (
            <>
              <Button asChild size="icon" variant="ghost">
                <Link aria-label={t('backToCharacters')} href="/dashboard/call">
                  <ArrowLeft aria-hidden="true" />
                </Link>
              </Button>
              <CharacterAvatar
                image={linked.preset.image}
                name={linked.preset.name}
                seed={linked.preset.id}
                size="sm"
              />
            </>
          )}
          <h1 className="truncate font-semibold text-xl">
            {characterName ?? t('title')}
          </h1>
        </div>
        <Button
          aria-label={t('call')}
          className={
            linked &&
            'size-11 shrink-0 rounded-full bg-[#4c41a0] text-white hover:bg-[#5b50b1]'
          }
          disabled={busy || unavailable}
          onClick={startCall}
          size="icon"
        >
          <Phone aria-hidden="true" />
        </Button>
      </header>
      {startConversation && (characters?.length || characterName) ? (
        <CharacterPicker
          characters={characters ?? []}
          disabled={busy}
          startConversation={startConversation}
        />
      ) : null}
      {linked?.recording && (
        <CallRecordingDownloads recording={linked.recording} />
      )}
      <VoiceChatTranscript
        inCall={Boolean(linked)}
        messages={visibleMessages}
        ref={transcript}
        revealReplyId={unavailable ? undefined : revealReplyId}
        status={status ? t(status) : undefined}
        streamingReply={hasReply && (chat.isLoading || chat.sessionGenerating)}
      />
      {errors}
      <VoiceChatComposer
        draft={draft}
        inCall={Boolean(linked)}
        onDraft={onDraft}
        onSend={() => send().catch(() => undefined)}
        placeholder={t('chatPlaceholder')}
        sendDisabled={busy || unavailable}
      />
    </>
  );

  return linked ? (
    <InworldCallFrame fitKeyboard testId="inworld-chat-view">
      {body}
    </InworldCallFrame>
  ) : (
    <section className="mx-auto flex h-[calc(100dvh-10rem)] min-h-72 w-full max-w-2xl flex-col gap-4">
      {body}
    </section>
  );
}

function CharacterPicker({
  characters,
  disabled,
  startConversation,
}: Required<
  Pick<VoiceChatCharacterPicker, 'characters' | 'startConversation'>
> & {
  disabled: boolean;
}) {
  const t = useTranslations('voiceChat');
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
          <option value="default">{t('title')}</option>
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
