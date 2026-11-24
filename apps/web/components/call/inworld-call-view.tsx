'use client';

import {
  RoomAudioRenderer,
  useConnectionState,
} from '@livekit/components-react';
import {
  Keyboard,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  VolumeX,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, type Ref, useLayoutEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import type { Preset } from '@/data/presets';
import { canRecordCalls, useCallRecording } from '@/hooks/use-call-recording';
import { useCallTimer } from '@/hooks/use-call-timer';
import { cn } from '@/lib/utils';
import { CharacterAvatar } from './character-avatar';
import { AudioSettingsMenu, RecordButton } from './in-call-view';
import { VoiceChatComposer } from './voice-chat-composer';
import {
  type VoiceChatMessage,
  VoiceChatTranscript,
  type VoiceChatTranscriptHandle,
} from './voice-chat-transcript';

interface InworldCallViewProps {
  active: boolean;
  changingMute: boolean;
  children: ReactNode;
  draft: string;
  error: string | null;
  inputRef: Ref<HTMLTextAreaElement>;
  lastSent: string | null;
  messages: VoiceChatMessage[];
  muted: boolean;
  onDraft: (value: string) => void;
  onHangUp: () => void;
  onReturnToVoice: () => void;
  onSend: () => void;
  onShowThread: () => void;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  onType: () => void;
  preset: Preset;
  ready: boolean;
  sending: boolean;
  speakerOff: boolean;
  status: string;
  thinking: boolean;
  threadOpen: boolean;
  transcriptRef: Ref<VoiceChatTranscriptHandle>;
  typing: boolean;
}

const round =
  'flex size-[clamp(44px,15vw,58px)] shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400';
const control = `${round} border border-[#242c52] bg-[#161d3b] text-slate-100 hover:bg-[#242c52]`;

export function InworldCallView({
  active,
  children,
  preset,
  ready,
  status,
  error,
  muted,
  changingMute,
  typing,
  draft,
  sending,
  speakerOff,
  threadOpen,
  messages,
  lastSent,
  thinking,
  inputRef,
  transcriptRef,
  onShowThread,
  onHangUp,
  onToggleMute,
  onToggleSpeaker,
  onType,
  onReturnToVoice,
  onDraft,
  onSend,
}: InworldCallViewProps) {
  const t = useTranslations('voiceChat');
  const call = useTranslations('call.inCall');
  const { formattedTime } = useCallTimer(useConnectionState());
  const recording = useCallRecording(preset, active);
  const callView = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const view = callView.current;
    const viewport = window.visualViewport;
    if (!(active && typing && view && viewport)) return;
    const fitAboveKeyboard = () => {
      const top = Math.max(
        viewport.offsetTop,
        view.getBoundingClientRect().top,
      );
      const height = Math.max(0, viewport.height + viewport.offsetTop - top);
      view.style.setProperty('--inworld-call-viewport', `${height}px`);
    };
    fitAboveKeyboard();
    viewport.addEventListener('resize', fitAboveKeyboard);
    viewport.addEventListener('scroll', fitAboveKeyboard);
    return () => {
      viewport.removeEventListener('resize', fitAboveKeyboard);
      viewport.removeEventListener('scroll', fitAboveKeyboard);
      view.style.removeProperty('--inworld-call-viewport');
    };
  }, [typing, active]);
  if (!active) {
    return (
      <>
        {children}
        <div className="mx-auto flex max-w-2xl flex-wrap gap-2">
          {Object.entries(recording.files).map(([kind, file]) => (
            <Button asChild key={kind} size="sm" variant="outline">
              <a download={file.filename} href={file.url}>
                {file.filename}
              </a>
            </Button>
          ))}
        </div>
      </>
    );
  }

  return (
    <section
      className={cn(
        'mx-auto flex h-[calc(100dvh-7rem)] min-h-0 w-full max-w-md flex-col rounded-3xl bg-[#060b22] px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-slate-100 sm:px-5',
        typing && 'max-h-(--inworld-call-viewport) overflow-y-auto',
      )}
      data-testid="inworld-call-view"
      ref={callView}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            aria-label={t(threadOpen ? 'closeThread' : 'openThread')}
            aria-pressed={threadOpen}
            disabled={speakerOff}
            onClick={onShowThread}
            size="icon"
            variant="ghost"
          >
            <MessageSquare aria-hidden="true" />
          </Button>
          {!speakerOff && (
            <Button
              aria-label={t('speakerOff')}
              disabled={!ready || changingMute}
              onClick={onToggleSpeaker}
              size="icon"
              variant="ghost"
            >
              <VolumeX aria-hidden="true" />
            </Button>
          )}
        </div>
        <time className="text-slate-400 text-sm tabular-nums">
          {formattedTime}
        </time>
      </header>
      <div
        className={cn(
          'flex shrink-0 flex-col items-center gap-2 text-center',
          !(typing || threadOpen) && 'flex-1 justify-center gap-3',
        )}
      >
        <CharacterAvatar
          className="shadow-[0_0_0_7px_#10174a,0_0_0_11px_#1a2160]"
          image={preset.image}
          name={preset.name}
          seed={preset.id}
          size={typing || threadOpen ? 'md' : '3xl'}
        />
        <h1
          className={cn(
            'font-bold',
            typing || threadOpen ? 'text-lg' : 'text-3xl',
          )}
        >
          {preset.name}
        </h1>
        {speakerOff ? (
          <p
            className="inline-flex items-center gap-1.5 rounded-full border border-[#674523] bg-[#2a2019] px-3 py-1 text-[#f0a860] text-xs"
            role="status"
          >
            <VolumeX aria-hidden="true" className="size-3.5" />
            {t('readingReplies')}
          </p>
        ) : (
          <p aria-live="polite" className="text-[#b9aeff] text-sm">
            {thinking ? t('thinking') : status}
          </p>
        )}
        {typing && muted && !speakerOff && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#3c3270] bg-[#1b1636] px-3 py-1 text-[#c3b6ff] text-xs">
            <MicOff aria-hidden="true" className="size-3.5" />{' '}
            {t('micOffWhileTyping')}
          </span>
        )}
        {typing && lastSent && !threadOpen && (
          <p className="max-h-16 max-w-full overflow-auto break-words rounded-2xl bg-[#4c41a0] px-3 py-2 text-sm">
            {lastSent}
          </p>
        )}
      </div>
      {error && (
        <p className="py-2 text-red-300 text-sm" role="alert">
          {error}
        </p>
      )}
      {threadOpen && (
        <VoiceChatTranscript
          messages={messages}
          ref={transcriptRef}
          status={thinking ? t('thinking') : undefined}
        />
      )}
      <div
        className={cn(
          'flex shrink-0 items-center justify-center gap-2 py-3 sm:gap-3',
          typing && !threadOpen && 'mt-auto',
        )}
      >
        {!typing && (
          <>
            <button
              aria-label={t(muted ? 'unmute' : 'mute')}
              aria-pressed={muted}
              className={control}
              disabled={!ready || changingMute}
              onClick={onToggleMute}
              type="button"
            >
              {muted ? (
                <MicOff aria-hidden="true" />
              ) : (
                <Mic aria-hidden="true" />
              )}
            </button>
            <button
              aria-label={t('typeInstead')}
              className={`${control} border-[#6f62c9] bg-[#221e52] text-[#c3b6ff]`}
              disabled={!ready || changingMute}
              onClick={onType}
              type="button"
            >
              <Keyboard aria-hidden="true" />
            </button>
          </>
        )}
        <button
          aria-label={call('end')}
          className={`${round} size-[clamp(50px,17vw,66px)] bg-[#e0304a] text-white hover:bg-red-500`}
          onClick={onHangUp}
          type="button"
        >
          <PhoneOff aria-hidden="true" />
        </button>
        {!typing && ready && (
          <>
            {canRecordCalls() && (
              <RecordButton buttonClass={round} recording={recording} />
            )}
            <AudioSettingsMenu buttonClass={round} />
          </>
        )}
      </div>
      {typing && (
        <VoiceChatComposer
          draft={draft}
          inputRef={inputRef}
          onBackToVoice={speakerOff ? onToggleSpeaker : onReturnToVoice}
          onDraft={onDraft}
          onSend={onSend}
          placeholder={t('placeholder')}
          sendDisabled={!(ready && muted) || sending || changingMute}
          speakerOff={speakerOff}
          switchingMode={!ready || changingMute}
        />
      )}
      {!speakerOff && <RoomAudioRenderer />}
    </section>
  );
}
