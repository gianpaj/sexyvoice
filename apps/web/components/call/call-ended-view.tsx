'use client';

import { Loader2, Pencil, PhoneCall } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { Preset } from '@/data/presets';
import { CharacterAvatar } from './character-avatar';

interface CallEndedViewProps {
  connecting: boolean;
  duration: string;
  onBack: () => void;
  onCallAgain: () => void;
  onEdit: () => void;
  /** Omitted when the user cannot make another character. */
  onRemix?: () => void;
  preset: Preset;
}

const secondaryButton =
  'inline-flex h-[46px] items-center gap-2 rounded-[10px] border border-slate-700/70 bg-slate-800/60 px-[18px] font-semibold text-[15px] text-slate-200 hover:bg-slate-800';

export function CallEndedView({
  connecting,
  duration,
  onBack,
  onCallAgain,
  onEdit,
  onRemix,
  preset,
}: CallEndedViewProps) {
  const t = useTranslations('call.ended');
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
      {isOwn && (
        <p className="max-w-[420px] text-[15px] text-slate-400">
          {t('editHint')}
        </p>
      )}
      <div className="mt-2 flex flex-wrap justify-center gap-2.5">
        <button
          className="inline-flex h-[46px] items-center gap-2 rounded-[10px] bg-linear-to-r from-violet-600 via-indigo-600 to-blue-600 px-5 font-semibold text-[15px] text-white hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
          disabled={connecting}
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
        {isOwn && (
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
        <button
          className="h-[46px] rounded-[10px] px-4 font-medium text-[15px] text-violet-300 hover:bg-violet-950/40"
          onClick={onBack}
          type="button"
        >
          {t('back')}
        </button>
      </div>
    </div>
  );
}
