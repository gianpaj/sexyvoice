'use client';

import { RoomAudioRenderer, RoomContext } from '@livekit/components-react';
import {
  ERROR_ATTRIBUTE,
  MUTE_RPC,
  RUNTIME,
  RUNTIME_ATTRIBUTE,
  SPEAKER_RPC,
} from '@sexyvoice/voice-chat';
import { PYTHON_CALL_RUNTIME } from '@sexyvoice/voice-chat/dispatch';
import {
  createLocalAudioTrack,
  type LocalAudioTrack,
  type RemoteParticipant,
  type Room,
  RoomEvent,
} from 'livekit-client';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import type { Preset } from '@/data/presets';
import { getCallerTime } from '@/lib/caller-time';
import { MINIMUM_CREDITS_FOR_CALL } from '@/lib/supabase/constants';
import { VoiceChatComposer } from './voice-chat-composer';
import {
  audioCaptureDefaults,
  createVoiceChatRoom,
  takeCallFromCard,
} from './voice-chat-room';
import {
  type VoiceChatCharacterPicker,
  VoiceChatThread,
} from './voice-chat-thread';
import {
  type VoiceChatMessage,
  VoiceChatTranscript,
  type VoiceChatTranscriptHandle,
} from './voice-chat-transcript';

const InworldCallView = dynamic(
  () => import('./inworld-call-view').then((module) => module.InworldCallView),
  { ssr: false },
);

interface LiveMessage extends VoiceChatMessage {
  timestamp: number;
}
type State = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export function LiveKitVoiceChat({
  audioReferenceId,
  characterName,
  characters,
  startConversation,
  conversationId,
  chatThreadId,
  pythonCall,
}: VoiceChatCharacterPicker & {
  audioReferenceId?: string;
  conversationId?: string;
  chatThreadId?: string;
  pythonCall?: { language: string; preset: Preset };
}) {
  const t = useTranslations('voiceChat');
  const tCall = useTranslations('call');
  const callStatus = useTranslations('call.inCall');
  const runtime = pythonCall ? PYTHON_CALL_RUNTIME : RUNTIME;
  const [room, setRoom] = useState<Room | null>(null);
  const active = useRef<Room | null>(null);
  const pendingMicrophone = useRef<LocalAudioTrack | null>(null);
  const releasePendingMicrophone = useCallback(() => {
    pendingMicrophone.current?.stop();
    pendingMicrophone.current = null;
  }, []);
  const thread = useRef(conversationId);
  const [state, setState] = useState<State>('idle');
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [changingMute, setChangingMute] = useState(false);
  const [speakerOff, setSpeakerOff] = useState(false);
  const [changingSpeaker, setChangingSpeaker] = useState(false);
  const [typing, setTyping] = useState(false);
  const restoreMicrophone = useRef(false);
  const [agentState, setAgentState] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [chatRevision, setChatRevision] = useState(0);
  const refreshChat = useCallback(
    () => setChatRevision((revision) => revision + 1),
    [],
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priorMessages, setPriorMessages] = useState<VoiceChatMessage[]>([]);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const agent = useRef<string | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcript = useRef<VoiceChatTranscriptHandle>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (deadline.current) clearTimeout(deadline.current);
      const current = active.current;
      active.current = null;
      releasePendingMicrophone();
      current?.disconnect().catch(() => undefined);
    };
  }, [releasePendingMicrophone]);
  const appendMessage = (message: LiveMessage) =>
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
    releasePendingMicrophone();
    agent.current = null;
    if (deadline.current) clearTimeout(deadline.current);
    setThinking(false);
    setState('idle');
    if (!pythonCall) setRoom(null);
    await current?.disconnect();
  };
  const start = async (
    history: VoiceChatMessage[] = [],
    prepared?: ReturnType<typeof takeCallFromCard>,
  ) => {
    if (active.current) return;
    setError(null);
    setPriorMessages(history);
    setTyping(false);
    setSpeakerOff(false);
    setChangingSpeaker(false);
    restoreMicrophone.current = false;
    setAgentState('');
    setMessages([]);
    setState('connecting');
    const firefox = /Firefox\//.test(navigator.userAgent);
    const current = prepared?.room ?? createVoiceChatRoom();
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
    const failWithMessage = (message: string) => {
      if (active.current !== current) return;
      setError(message);
      stop().catch(() => undefined);
    };
    const fail = (key: 'connectError' | 'providerError' | 'workerMissing') =>
      failWithMessage(
        pythonCall && key === 'workerMissing'
          ? tCall('agentUnavailable')
          : t(key),
      );
    if (pythonCall) {
      current.localParticipant.registerRpcMethod('pg.error', ({ payload }) => {
        const { error } = JSON.parse(payload);
        let message = t('connectError');
        if (error === 'active_call') message = tCall('activeCallError');
        if (error === 'insufficient_credits') {
          message = tCall('notEnoughCredits', {
            count: MINIMUM_CREDITS_FOR_CALL,
          });
        }
        setTimeout(() => failWithMessage(message), 0);
        return Promise.resolve('{"handled":true}');
      });
      current.localParticipant.registerRpcMethod('pg.toast', ({ payload }) => {
        const { title, description, variant } = JSON.parse(payload);
        if (variant === 'warning') toast.warning(title, { description });
        else if (variant === 'error') toast.error(title, { description });
        else toast.info(title, { description });
        return Promise.resolve('{"shown":true}');
      });
    }
    let accepting = false;
    let assignedThread: string | undefined;
    let mediaConnected = false;
    const checkAgent = async (participant: RemoteParticipant) => {
      if (
        active.current !== current ||
        !mediaConnected ||
        participant.attributes[RUNTIME_ATTRIBUTE] !== runtime
      )
        return;
      const failure = participant.attributes[ERROR_ATTRIBUTE];
      if (failure) {
        fail(failure === 'provider' ? 'providerError' : 'connectError');
        return;
      }
      const nextAgentState = participant.attributes['lk.agent.state'] ?? '';
      setAgentState(nextAgentState);
      setThinking(nextAgentState === 'thinking');
      if (accepting) return;
      accepting = true;
      agent.current = participant.identity;
      try {
        const reply = await current.localParticipant.performRpc({
          destinationIdentity: participant.identity,
          method: MUTE_RPC,
          payload: JSON.stringify({ muted: false }),
        });
        if (pythonCall && JSON.parse(reply).ok !== true)
          throw new Error('Microphone unavailable');
        if (active.current !== current) return;
        const microphone = pendingMicrophone.current;
        if (microphone) await current.localParticipant.publishTrack(microphone);
        else await current.localParticipant.setMicrophoneEnabled(true);
        if (active.current !== current) {
          await current.localParticipant.setMicrophoneEnabled(false);
          return;
        }
        pendingMicrophone.current = null;
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
        .then((reply) => {
          if (pythonCall && JSON.parse(reply).ok !== true)
            throw new Error('Microphone unavailable');
          if (active.current === current) setState('connected');
        })
        .catch(() => fail('connectError'));
    });
    if (pythonCall) {
      current.on(RoomEvent.ParticipantDisconnected, (participant) => {
        if (participant.identity === agent.current) failWithMessage(t('ended'));
      });
    }
    current.on(RoomEvent.Disconnected, () => {
      if (active.current !== current) return;
      active.current = null;
      releasePendingMicrophone();
      agent.current = null;
      if (deadline.current) clearTimeout(deadline.current);
      if (mounted.current) {
        if (!pythonCall) setRoom(null);
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
      const audioReady = prepared?.audioReady ?? current.startAudio();
      // Attach a handler immediately, including when the token request fails.
      audioReady.catch(() => undefined);
      const response = pythonCall
        ? await fetch('/api/call-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...getCallerTime(),
              conversationId: thread.current,
              instructions: '',
              language: pythonCall.language,
              selectedPresetId: pythonCall.preset.id,
              sessionConfig: pythonCall.preset.sessionConfig,
            }),
          })
        : await fetch('/api/voice-chat/call-token', {
            method: 'POST',
            ...((audioReferenceId || thread.current) && {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioReferenceId,
                conversationId: thread.current,
              }),
            }),
          });
      if (pythonCall && response.status === 402) {
        failWithMessage(
          tCall('notEnoughCredits', { count: MINIMUM_CREDITS_FOR_CALL }),
        );
        return;
      }
      if (!response.ok) throw new Error('Token unavailable');
      const token = await response.json();
      if (token.runtime !== runtime || !token.accessToken || !token.url)
        throw new Error('Invalid runtime');
      if (active.current !== current) return;
      assignedThread = token.conversationId;
      await audioReady;
      if (active.current !== current) return;
      if (firefox) {
        // Before capture permission, Firefox can restrict ICE to the Tailnet interface.
        const microphone = await createLocalAudioTrack(audioCaptureDefaults);
        if (active.current !== current) {
          microphone.stop();
          return;
        }
        pendingMicrophone.current = microphone;
      }
      // A shared ICE transport avoids Firefox startup failures with this SDK's media layout.
      await current.connect(
        token.url,
        token.accessToken,
        firefox ? { rtcConfig: { bundlePolicy: 'max-bundle' } } : undefined,
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
  const startFromCard = useEffectEvent((id: string) => {
    const prepared = takeCallFromCard(id);
    if (prepared) start([], prepared).catch(() => undefined);
  });
  const linkedConversationId = pythonCall ? conversationId : undefined;
  useEffect(() => {
    if (!linkedConversationId) return;
    // Defer consumption so React's Strict Mode setup/cleanup leaves one attempt.
    const timer = setTimeout(() => startFromCard(linkedConversationId), 0);
    return () => clearTimeout(timer);
  }, [linkedConversationId]);

  const setMicrophoneMuted = async (next: boolean) => {
    const current = active.current;
    if (!(current && agent.current) || changingMute) return false;
    if (next === mutedRef.current) return true;
    setChangingMute(true);
    try {
      if (next) await current.localParticipant.setMicrophoneEnabled(false);
      const reply = await current.localParticipant.performRpc({
        destinationIdentity: agent.current,
        method: MUTE_RPC,
        payload: JSON.stringify({ muted: next }),
      });
      if (pythonCall && JSON.parse(reply).ok !== true)
        throw new Error('Microphone unavailable');
      if (active.current !== current) return false;
      if (!next) {
        await current.localParticipant.setMicrophoneEnabled(true);
        if (active.current !== current) {
          await current.localParticipant.setMicrophoneEnabled(false);
          return false;
        }
      }
      if (active.current === current) {
        mutedRef.current = next;
        setMuted(next);
      }
      return true;
    } catch {
      if (active.current === current) {
        setError(t('connectError'));
        await stop();
      }
      return false;
    } finally {
      setChangingMute(false);
    }
  };
  const openComposer = () => {
    // iOS needs the focus call inside the user's tap.
    flushSync(() => setTyping(true));
    input.current?.focus();
  };

  const toggleSpeaker = async () => {
    const current = active.current;
    const identity = agent.current;
    if (!(current && identity) || changingMute || changingSpeaker) return false;
    const enabled = speakerOff;
    setChangingSpeaker(true);
    try {
      if (enabled) {
        await current.startAudio();
      } else {
        if (!typing) restoreMicrophone.current = !mutedRef.current;
        setSpeakerOff(true);
        if (!typing) openComposer();
        if (!(await setMicrophoneMuted(true))) return false;
      }
      if (active.current !== current) return false;
      const reply = await current.localParticipant.performRpc({
        destinationIdentity: identity,
        method: SPEAKER_RPC,
        payload: JSON.stringify({ enabled }),
      });
      if (JSON.parse(reply).ok !== true)
        throw new Error('Speaker control unavailable');
      if (active.current !== current) return false;
      setSpeakerOff(!enabled);
      return true;
    } catch {
      if (active.current === current) {
        setError(t('connectError'));
        await stop();
      }
      return false;
    } finally {
      if (active.current === current) setChangingSpeaker(false);
    }
  };

  const returnToVoice = async () => {
    input.current?.blur();
    if (speakerOff && !(await toggleSpeaker())) return;
    if (restoreMicrophone.current && !(await setMicrophoneMuted(false))) return;
    setTyping(false);
  };

  const send = async () => {
    const text = draft.trim();
    const current = active.current;
    if (
      !(text && current && agent.current) ||
      state !== 'connected' ||
      sending ||
      changingSpeaker ||
      (pythonCall && !mutedRef.current)
    )
      return;
    setSending(true);
    setThinking(true);
    transcript.current?.scrollToLatest();
    try {
      const sent = await current.localParticipant.sendText(text, {
        topic: 'lk.chat',
        ...(pythonCall && { destinationIdentities: [agent.current] }),
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
  const idleChat = chatThreadId && state === 'idle' && (
    <VoiceChatThread
      backToCharacters={Boolean(pythonCall)}
      characterName={characterName}
      characters={characters}
      draft={chatDraft}
      error={error}
      key={chatRevision}
      onDraft={setChatDraft}
      onRefresh={refreshChat}
      onRememberThread={(id) => {
        thread.current = id;
      }}
      onStartCall={start}
      startConversation={startConversation}
      threadId={thread.current ?? chatThreadId}
    />
  );
  if (pythonCall && room) {
    const ready = state === 'connected';
    const readyStatus = callStatus(
      agentState === 'speaking' ? 'speaking' : 'listening',
    );
    const status =
      state === 'connecting' || state === 'reconnecting'
        ? t(state)
        : readyStatus;
    return (
      <RoomContext.Provider value={room}>
        <InworldCallView
          active={state !== 'idle'}
          changingMute={changingMute || changingSpeaker}
          draft={draft}
          error={error}
          inputRef={input}
          messages={[...priorMessages, ...messages]}
          muted={muted}
          onDraft={setDraft}
          onHangUp={() => stop().catch(() => undefined)}
          onReturnToVoice={() => returnToVoice().catch(() => undefined)}
          onSend={() => send().catch(() => undefined)}
          onToggleMute={() => setMicrophoneMuted(!muted).catch(() => undefined)}
          onToggleSpeaker={() => toggleSpeaker().catch(() => undefined)}
          onType={() => {
            restoreMicrophone.current = !mutedRef.current;
            setMicrophoneMuted(true).catch(() => undefined);
            openComposer();
          }}
          preset={pythonCall.preset}
          ready={ready}
          sending={sending}
          speakerOff={speakerOff}
          status={status}
          thinking={thinking}
          transcriptRef={transcript}
          typing={typing}
        >
          {idleChat}
        </InworldCallView>
      </RoomContext.Provider>
    );
  }
  if (idleChat) return idleChat;
  return (
    <section className="mx-auto flex h-[calc(100dvh-10rem)] min-h-96 w-full max-w-2xl flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl">
            {characterName ?? t('title')}
          </h1>
          <p className="text-muted-foreground text-sm">{t(state)}</p>
        </div>
        <div className="flex gap-2">
          {state === 'connected' && (
            <Button
              aria-label={t(muted ? 'unmute' : 'mute')}
              disabled={changingMute}
              onClick={() => {
                setMicrophoneMuted(!muted).catch(() => undefined);
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
      <VoiceChatTranscript
        messages={[...priorMessages, ...messages]}
        ref={transcript}
        status={thinking ? t('thinking') : undefined}
      />
      <VoiceChatComposer
        draft={draft}
        onDraft={setDraft}
        onSend={() => send().catch(() => undefined)}
        placeholder={t('placeholder')}
        sendDisabled={state !== 'connected' || sending}
      />
      {room && (
        <RoomContext.Provider value={room}>
          <RoomAudioRenderer />
        </RoomContext.Provider>
      )}
    </section>
  );
}
