'use client';

import { RoomAudioRenderer, RoomContext } from '@livekit/components-react';
import { MUTE_RPC, RUNTIME, RUNTIME_ATTRIBUTE } from '@sexyvoice/voice-spike';
import { type RemoteParticipant, Room, RoomEvent } from 'livekit-client';
import { Mic, MicOff, Phone, PhoneOff, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { VoiceSpikeChat } from './voice-spike-chat';

interface Message {
  id: string;
  text: string;
  timestamp: number;
  user: boolean;
}
type State = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export function LivekitSpike({
  audioReferenceId,
  conversationId,
  chatThreadId,
}: {
  audioReferenceId?: string;
  conversationId?: string;
  chatThreadId?: string;
}) {
  const t = useTranslations('voiceSpike');
  const [room, setRoom] = useState<Room | null>(null);
  const active = useRef<Room | null>(null);
  const thread = useRef(conversationId);
  const [state, setState] = useState<State>('idle');
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [changingMute, setChangingMute] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [chatRevision, setChatRevision] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const agent = useRef<string | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (deadline.current) clearTimeout(deadline.current);
      const current = active.current;
      active.current = null;
      current?.disconnect().catch(() => undefined);
    };
  }, []);
  useEffect(() => {
    if (messages.length || thinking)
      end.current?.scrollIntoView({ block: 'end' });
  }, [messages, thinking]);
  const appendMessage = (message: Message) =>
    setMessages((previous) => {
      const found = previous.find((item) => item.id === message.id);
      if (found?.text === message.text) return previous;
      const next = found
        ? previous.map((item) =>
            item.id === message.id ? { ...item, text: message.text } : item,
          )
        : [...previous, message];
      return next.sort((a, b) => a.timestamp - b.timestamp).slice(-100);
    });
  const stop = async () => {
    const current = active.current;
    active.current = null;
    agent.current = null;
    if (deadline.current) clearTimeout(deadline.current);
    setThinking(false);
    setState('idle');
    setRoom(null);
    await current?.disconnect();
  };
  const start = async () => {
    if (active.current) return;
    setError(null);
    setMessages([]);
    setState('connecting');
    const current = new Room({
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
      publishDefaults: { stopMicTrackOnMute: true },
    });
    active.current = current;
    current.registerTextStreamHandler(
      'lk.transcription',
      async (reader, participant) => {
        const { id, timestamp, attributes } = reader.info;
        let text = '';
        try {
          for await (const chunk of reader) {
            if (active.current !== current) return;
            text += chunk;
            appendMessage({
              id: `${participant.identity}:${attributes?.['lk.segment_id'] ?? id}`,
              text,
              timestamp,
              user: participant.identity === current.localParticipant.identity,
            });
          }
        } catch {
          // A stream can end mid-reply on hangup or connection loss.
        }
      },
    );
    setRoom(current);
    const fail = (key: 'connectError' | 'providerError' | 'workerMissing') => {
      if (active.current !== current) return;
      setError(t(key));
      stop().catch(() => undefined);
    };
    let accepting = false;
    let assignedThread: string | undefined;
    let mediaConnected = false;
    const checkAgent = async (participant: RemoteParticipant) => {
      if (
        active.current !== current ||
        !mediaConnected ||
        participant.attributes[RUNTIME_ATTRIBUTE] !== RUNTIME
      )
        return;
      const failure = participant.attributes['sv.spike.error'];
      if (failure) {
        fail(failure === 'provider' ? 'providerError' : 'connectError');
        return;
      }
      setThinking(participant.attributes['lk.agent.state'] === 'thinking');
      if (accepting) return;
      accepting = true;
      agent.current = participant.identity;
      try {
        await current.localParticipant.performRpc({
          destinationIdentity: participant.identity,
          method: MUTE_RPC,
          payload: JSON.stringify({ muted: false }),
        });
        if (active.current !== current) return;
        await current.localParticipant.setMicrophoneEnabled(true);
        if (active.current !== current) {
          await current.localParticipant.setMicrophoneEnabled(false);
          return;
        }
        if (deadline.current) clearTimeout(deadline.current);
        mutedRef.current = false;
        setMuted(false);
        if (assignedThread) {
          thread.current = assignedThread;
          const here = new URL(window.location.href);
          here.searchParams.set('conversation', assignedThread);
          window.history.replaceState(null, '', here);
        }
        setState('connected');
      } catch {
        fail('connectError');
      }
    };
    current.on(
      RoomEvent.ParticipantAttributesChanged,
      (_attributes, participant) => {
        if (participant.identity === current.localParticipant.identity) return;
        checkAgent(participant as RemoteParticipant).catch(() =>
          fail('connectError'),
        );
      },
    );
    current.on(RoomEvent.ParticipantConnected, (participant) => {
      checkAgent(participant).catch(() => fail('connectError'));
    });
    current.on(RoomEvent.Reconnecting, () => {
      if (active.current === current) setState('reconnecting');
    });
    current.on(RoomEvent.Reconnected, () => {
      if (active.current !== current) return;
      if (!agent.current) return;
      current.localParticipant
        .performRpc({
          destinationIdentity: agent.current,
          method: MUTE_RPC,
          payload: JSON.stringify({ muted: mutedRef.current }),
        })
        .then(() => {
          if (active.current === current) setState('connected');
        })
        .catch(() => fail('connectError'));
    });
    current.on(RoomEvent.Disconnected, () => {
      if (active.current !== current) return;
      active.current = null;
      agent.current = null;
      if (deadline.current) clearTimeout(deadline.current);
      if (mounted.current) {
        setRoom(null);
        setState('idle');
        setThinking(false);
        setError(t('ended'));
      }
    });
    deadline.current = setTimeout(
      () =>
        fail(mediaConnected && !accepting ? 'workerMissing' : 'connectError'),
      60_000,
    );
    try {
      // Unlock audio synchronously from the user's call gesture, before any fetch.
      const audioReady = current.startAudio();
      // Attach a handler immediately, including when the token request fails.
      audioReady.catch(() => undefined);
      const response = await fetch('/api/voice-spike/call-token', {
        method: 'POST',
        ...((audioReferenceId || thread.current) && {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioReferenceId,
            conversationId: thread.current,
          }),
        }),
      });
      if (!response.ok) throw new Error('Token unavailable');
      const token = await response.json();
      if (token.runtime !== RUNTIME || !token.accessToken || !token.url)
        throw new Error('Invalid runtime');
      if (active.current !== current) return;
      assignedThread = token.conversationId;
      await audioReady;
      // A shared ICE transport avoids Firefox startup failures with this SDK's media layout.
      await current.connect(
        token.url,
        token.accessToken,
        /Firefox\//.test(navigator.userAgent)
          ? { rtcConfig: { bundlePolicy: 'max-bundle' } }
          : undefined,
      );
      mediaConnected = true;
      if (active.current !== current) {
        await current.disconnect();
        return;
      }
      for (const participant of current.remoteParticipants.values())
        await checkAgent(participant);
    } catch {
      fail('connectError');
    }
  };
  const toggleMute = async () => {
    const current = active.current;
    if (!(current && agent.current) || changingMute) return;
    const next = !muted;
    setChangingMute(true);
    try {
      if (next) await current.localParticipant.setMicrophoneEnabled(false);
      await current.localParticipant.performRpc({
        destinationIdentity: agent.current,
        method: MUTE_RPC,
        payload: JSON.stringify({ muted: next }),
      });
      if (active.current !== current) return;
      if (!next) {
        await current.localParticipant.setMicrophoneEnabled(true);
        if (active.current !== current) {
          await current.localParticipant.setMicrophoneEnabled(false);
          return;
        }
      }
      if (active.current === current) {
        mutedRef.current = next;
        setMuted(next);
      }
    } catch {
      if (active.current === current) {
        setError(t('connectError'));
        await stop();
      }
    } finally {
      setChangingMute(false);
    }
  };
  const send = async () => {
    const text = draft.trim();
    const current = active.current;
    if (!(text && current) || state !== 'connected' || sending) return;
    setSending(true);
    setThinking(true);
    try {
      const sent = await current.localParticipant.sendText(text, {
        topic: 'lk.chat',
      });
      if (active.current !== current) return;
      appendMessage({
        id: sent.id,
        text,
        user: true,
        timestamp: sent.timestamp,
      });
      setDraft('');
    } catch {
      if (active.current === current) {
        setThinking(false);
        setError(t('sendError'));
      }
    } finally {
      setSending(false);
    }
  };
  if (chatThreadId && state === 'idle') {
    return (
      <VoiceSpikeChat
        draft={chatDraft}
        error={error}
        key={chatRevision}
        onDraft={setChatDraft}
        onRefresh={() => setChatRevision((revision) => revision + 1)}
        onRememberThread={(id) => {
          thread.current = id;
        }}
        onStartCall={start}
        threadId={thread.current ?? chatThreadId}
      />
    );
  }
  return (
    <section className="mx-auto flex h-[calc(100dvh-10rem)] min-h-96 w-full max-w-2xl flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">{t(state)}</p>
        </div>
        <div className="flex gap-2">
          {state === 'connected' && (
            <Button
              aria-label={t(muted ? 'unmute' : 'mute')}
              disabled={changingMute}
              onClick={() => {
                toggleMute().catch(() => undefined);
              }}
              size="icon"
              variant="outline"
            >
              {muted ? <MicOff /> : <Mic />}
            </Button>
          )}
          <Button
            aria-label={t(state === 'idle' ? 'call' : 'hangup')}
            onClick={() => {
              (state === 'idle' ? start() : stop()).catch(() => undefined);
            }}
            size="icon"
            variant={state === 'idle' ? 'default' : 'destructive'}
          >
            {state === 'idle' ? <Phone /> : <PhoneOff />}
          </Button>
        </div>
      </header>
      <p className="text-muted-foreground text-sm">{t('notice')}</p>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <div
        aria-label={t('messages')}
        aria-live="polite"
        className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-md border p-3"
        role="log"
      >
        {messages.map((message) => (
          <p
            className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${message.user ? 'self-end bg-primary text-primary-foreground' : 'self-start bg-muted'}`}
            key={message.id}
          >
            {message.text}
          </p>
        ))}
        {thinking && (
          <p className="text-muted-foreground text-sm">{t('thinking')}</p>
        )}
        <div ref={end} />
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send().catch(() => undefined);
        }}
      >
        <Textarea
          aria-label={t('message')}
          maxLength={2000}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('placeholder')}
          rows={2}
          value={draft}
        />
        <Button
          aria-label={t('send')}
          disabled={state !== 'connected' || !draft.trim() || sending}
          size="icon"
          type="submit"
        >
          <Send />
        </Button>
      </form>
      {room && (
        <RoomContext.Provider value={room}>
          <RoomAudioRenderer />
        </RoomContext.Provider>
      )}
    </section>
  );
}
