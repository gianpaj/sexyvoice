'use client';

import {
  AudioLines,
  Film,
  Loader2,
  MessageSquare,
  Pencil,
  PhoneCall,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import type { Preset } from '@/data/presets';
import type { CallRecordingFiles } from '@/hooks/use-call-recording';
import { Link } from '@/lib/i18n/navigation';
import { CharacterAvatar } from './character-avatar';

interface CallEndedViewProps {
  callDisabled?: boolean;
  children?: ReactNode;
  connecting: boolean;
  duration: string;
  onBack?: () => void;
  onCallAgain: () => void;
  onChat?: () => void;
  onEdit?: () => void;
  /** Omitted when the user cannot make another character. */
  onRemix?: () => void;
  preset: Preset;
  /** Files recorded in the browser during the call. */
  recording?: CallRecordingFiles;
}

const downloadLink =
  'inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 font-medium text-sm text-violet-300 hover:bg-violet-950/40';

const secondaryButton =
  'inline-flex h-[46px] items-center gap-2 rounded-[10px] border border-slate-700/70 bg-slate-800/60 px-[18px] font-semibold text-[15px] text-slate-200 hover:bg-slate-800';

const backButton =
  'inline-flex h-[46px] items-center rounded-[10px] px-4 font-medium text-[15px] text-violet-300 hover:bg-violet-950/40';

export function CallEndedView({
  callDisabled,
  children,
  connecting,
  duration,
  onBack,
  onChat,
  onCallAgain,
  onEdit,
  onRemix,
  preset,
  recording = {},
}: CallEndedViewProps) {
  const t = useTranslations('call.ended');
  const chat = useTranslations('voiceChat');
  const isOwn = !preset.isPublic;
  const { name } = preset;

  return (
    <div
      className="flex min-h-[calc(100dvh-12rem)] flex-col items-center justify-center gap-4 px-4 py-12 text-center"
      data-testid="call-ended-view"
    >
      <CharacterAvatar
        image={preset.image}
        name={name}
        seed={preset.id}
        size="2xl"
      />
      <h1 className="mt-2 font-bold text-[26px] leading-tight">
        {t('title', { duration, name })}
      </h1>
      {isOwn && onEdit && (
        <p className="max-w-[420px] text-[15px] text-slate-400">
          {t('editHint')}
        </p>
      )}
      {children}
      <div className="mt-2 flex flex-wrap justify-center gap-2.5">
        <button
          className="inline-flex h-[46px] items-center gap-2 rounded-[10px] bg-linear-to-r from-violet-600 via-indigo-600 to-blue-600 px-5 font-semibold text-[15px] text-white hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
          disabled={connecting || callDisabled}
          onClick={onCallAgain}
          type="button"
        >
          {connecting ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <PhoneCall aria-hidden="true" className="size-4" />
          )}
          {t('callAgain')}
        </button>
        {isOwn && onEdit && (
          <button className={secondaryButton} onClick={onEdit} type="button">
            <Pencil aria-hidden="true" className="size-4" />
            {t('edit', { name })}
          </button>
        )}
        {!isOwn && onRemix && (
          <button className={secondaryButton} onClick={onRemix} type="button">
            {t('makeYourOwn')}
          </button>
        )}
        {onChat && (
          <button className={secondaryButton} onClick={onChat} type="button">
            <MessageSquare aria-hidden="true" className="size-4" />
            {chat('openChat')}
          </button>
        )}
        {onBack ? (
          <button className={backButton} onClick={onBack} type="button">
            {t('back')}
          </button>
        ) : (
          <Link className={backButton} href="/dashboard/call">
            {t('back')}
          </Link>
        )}
      </div>
      <CallRecordingDownloads recording={recording} />
    </div>
  );
}

export function CallRecordingDownloads({
  recording,
}: {
  recording: CallRecordingFiles;
}) {
  const t = useTranslations('call.ended');
  if (!(recording.audio || recording.video)) return null;

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {recording.audio && (
        <a
          className={downloadLink}
          download={recording.audio.filename}
          href={recording.audio.url}
        >
          <AudioLines aria-hidden="true" className="size-4" />
          {t('downloadAudio')}
        </a>
      )}
      {recording.video && (
        <a
          className={downloadLink}
          download={recording.video.filename}
          href={recording.video.url}
        >
          <Film aria-hidden="true" className="size-4" />
          {t('downloadVideo')}
        </a>
      )}
    </div>
  );
}
