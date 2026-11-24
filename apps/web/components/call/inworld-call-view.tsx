'use client';

import {
  RoomAudioRenderer,
  useConnectionState,
} from '@livekit/components-react';
import { Keyboard, MessageSquare, Mic, MicOff, PhoneOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode, Ref } from 'react';

import { Button } from '@/components/ui/button';
import type { Preset } from '@/data/presets';
import {
  type CallRecordingFiles,
  canRecordCalls,
  useCallRecording,
} from '@/hooks/use-call-recording';
import { useCallTimer } from '@/hooks/use-call-timer';
import { cn } from '@/lib/utils';
import { CharacterAvatar } from './character-avatar';
import { AudioSettingsMenu, RecordButton } from './in-call-view';
import { InworldCallFrame } from './inworld-call-frame';
import { VoiceChatComposer } from './voice-chat-composer';
import {
  type VoiceChatMessage,
  VoiceChatTranscript,
  type VoiceChatTranscriptHandle,
} from './voice-chat-transcript';

interface InworldCallViewProps {
  active: boolean;
  changingMute: boolean;
  draft: string;
  error: string | null;
  inputRef: Ref<HTMLTextAreaElement>;
  messages: VoiceChatMessage[];
  muted: boolean;
  onDraft: (value: string) => void;
  onHangUp: () => void;
  onReturnToVoice: () => void;
  onSend: () => void;
  onToggleMute: () => void;
  onType: () => void;
  preset: Preset;
  ready: boolean;
  renderIdle: (recording: CallRecordingFiles) => ReactNode;
  sending: boolean;
  status: string;
  thinking: boolean;
  transcriptRef: Ref<VoiceChatTranscriptHandle>;
  typing: boolean;
}

const round =
  'flex size-[clamp(44px,15vw,58px)] shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:opacity-50';
const control = `${round} border border-[#242c52] bg-[#161d3b] text-slate-100 hover:bg-[#242c52]`;

export function InworldCallView({
  active,
  preset,
  ready,
  renderIdle,
  status,
  error,
  muted,
  changingMute,
  typing,
  draft,
  sending,
  messages,
  thinking,
  inputRef,
  transcriptRef,
  onHangUp,
  onToggleMute,
  onType,
  onReturnToVoice,
  onDraft,
  onSend,
}: InworldCallViewProps) {
  const t = useTranslations('voiceChat');
  const call = useTranslations('call.inCall');
  const { formattedTime } = useCallTimer(useConnectionState());
  const recording = useCallRecording(preset, active);
  if (!active) return renderIdle(recording.files);

  const disabled = !ready || changingMute;
  const hangUp = (
    <button
      aria-label={call('end')}
      className={cn(
        round,
        'bg-[#e0304a] text-white hover:bg-red-500',
        typing ? 'size-12' : 'size-[clamp(50px,17vw,66px)]',
      )}
      onClick={onHangUp}
      type="button"
    >
      <PhoneOff aria-hidden="true" className={typing ? 'size-5' : undefined} />
    </button>
  );
  const elapsed = (
    <time className="text-slate-400 text-sm tabular-nums">{formattedTime}</time>
  );

  return (
    <InworldCallFrame
      className={
        typing
          ? undefined
          : 'px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5'
      }
      fitKeyboard={typing}
      testId="inworld-call-view"
    >
      {typing ? (
        <header className="flex shrink-0 items-center justify-between gap-2 border-[#3c3270] border-b bg-[#1b1636] px-4 text-[#c3b6ff]">
          <span
            className="inline-flex items-center gap-2 text-xs"
            role="status"
          >
            {muted ? (
              <MicOff aria-hidden="true" className="size-4 shrink-0" />
            ) : (
              <Mic aria-hidden="true" className="size-4 shrink-0" />
            )}
            {t(muted ? 'micOffWhileTyping' : 'muteToType')}
          </span>
          <Button
            aria-label={t('closeThread')}
            className="size-11 shrink-0"
            disabled={disabled}
            onClick={onReturnToVoice}
            size="icon"
            variant="ghost"
          >
            <MessageSquare aria-hidden="true" />
          </Button>
        </header>
      ) : (
        <header className="flex h-11 shrink-0 items-center justify-end px-2">
          {elapsed}
        </header>
      )}
      {typing ? (
        <div className="flex shrink-0 items-center gap-3 px-5 py-4">
          <CharacterAvatar
            image={preset.image}
            name={preset.name}
            seed={preset.id}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-bold text-lg">{preset.name}</h1>
            {ready ? (
              elapsed
            ) : (
              <p aria-live="polite" className="text-[#b9aeff] text-sm">
                {status}
              </p>
            )}
          </div>
          {hangUp}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
          <CharacterAvatar
            className="shadow-[0_0_0_7px_#10174a,0_0_0_11px_#1a2160]"
            image={preset.image}
            name={preset.name}
            seed={preset.id}
            size="3xl"
          />
          <h1 className="font-bold text-3xl">{preset.name}</h1>
          <p aria-live="polite" className="text-[#b9aeff] text-sm">
            {ready && thinking ? t('thinking') : status}
          </p>
        </div>
      )}
      {error && (
        <p className="px-4 py-2 text-red-300 text-sm" role="alert">
          {error}
        </p>
      )}
      {typing ? (
        <>
          <VoiceChatTranscript
            inCall
            messages={messages}
            ref={transcriptRef}
            status={thinking ? t('thinking') : undefined}
          />
          <VoiceChatComposer
            draft={draft}
            inCall
            inputRef={inputRef}
            microphone={{ disabled, muted, onToggle: onToggleMute }}
            onDraft={onDraft}
            onSend={onSend}
            placeholder={t('placeholder')}
            sendDisabled={disabled || !muted || sending}
          />
        </>
      ) : (
        <div className="flex shrink-0 items-center justify-center gap-1.5 py-3 sm:gap-3 min-[360px]:gap-2">
          <button
            aria-label={t(muted ? 'unmute' : 'mute')}
            aria-pressed={muted}
            className={control}
            disabled={disabled}
            onClick={onToggleMute}
            type="button"
          >
            {muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
          </button>
          <button
            aria-label={t('typeInstead')}
            className={`${control} border-[#6f62c9] bg-[#221e52] text-[#c3b6ff]`}
            disabled={disabled}
            onClick={onType}
            type="button"
          >
            <Keyboard aria-hidden="true" />
          </button>
          {hangUp}
          {canRecordCalls() && (
            <RecordButton
              buttonClass={round}
              disabled={!ready}
              recording={recording}
            />
          )}
          <AudioSettingsMenu buttonClass={round} disabled={!ready} />
        </div>
      )}
      <RoomAudioRenderer />
    </InworldCallFrame>
  );
}
