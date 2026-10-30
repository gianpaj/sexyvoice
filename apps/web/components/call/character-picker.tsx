'use client';

import { Plus, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import type { Preset } from '@/data/presets';
import { usePlaygroundState } from '@/hooks/use-playground-state';
import { useSamplePlayer } from '@/hooks/use-sample-player';
import {
  getPresetDescription,
  getPresetSampleUrl,
  MAX_CUSTOM_CHARACTERS,
} from '@/lib/characters';
import { Link } from '@/lib/i18n/navigation';
import { CharacterCard } from './character-card';

interface CharacterPickerProps {
  highlightId?: string | null;
  isPaidUser: boolean;
  onCreate: () => void;
  onDelete: (preset: Preset) => void;
  onDuplicate: (presetId: string) => void;
  onEdit: (presetId: string) => void;
  onOpen: (presetId: string) => void;
}

const GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(min(250px,100%),1fr))] gap-4';

function SectionHeading({ children, id }: { children: ReactNode; id: string }) {
  return (
    <h2
      className="font-semibold text-violet-300 text-xs uppercase tracking-[0.12em]"
      id={id}
    >
      {children}
    </h2>
  );
}

const createCardClass =
  'flex min-h-[200px] flex-col items-start justify-center gap-2.5 rounded-[14px] border-[1.5px] border-violet-800/80 border-dashed bg-slate-950/40 p-5 text-left';

export function CharacterPicker({
  highlightId,
  isPaidUser,
  onCreate,
  onDelete,
  onDuplicate,
  onEdit,
  onOpen,
}: CharacterPickerProps) {
  const t = useTranslations('call.picker');
  const { pgState, helpers } = usePlaygroundState();
  const player = useSamplePlayer();
  const own = pgState.customCharacters;
  const featured = helpers.getDefaultPresets().filter((preset) => preset.image);
  const canAddMore = own.length < MAX_CUSTOM_CHARACTERS;

  const renderCard = (preset: Preset, isOwn: boolean) => {
    const key = `character:${preset.id}`;
    return (
      <CharacterCard
        description={getPresetDescription(preset, pgState.language)}
        highlighted={highlightId === preset.id}
        key={preset.id}
        menu={
          isOwn
            ? {
                onDelete: () => onDelete(preset),
                onDuplicate: canAddMore
                  ? () => onDuplicate(preset.id)
                  : undefined,
                onEdit: () => onEdit(preset.id),
              }
            : undefined
        }
        onListen={() => player.toggle(key, getPresetSampleUrl(preset))}
        onOpen={() => onOpen(preset.id)}
        playing={player.playingKey === key}
        preset={preset}
      />
    );
  };

  let createCard: ReactNode;
  if (!isPaidUser) {
    createCard = (
      <div className={createCardClass}>
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-full bg-violet-950 text-violet-300"
        >
          <Sparkles className="size-5" />
        </span>
        <span className="font-semibold text-[17px]">{t('createTitle')}</span>
        <span className="text-slate-400 text-sm leading-snug">
          {t('createUpgrade')}
        </span>
        <Link
          className="font-semibold text-sm text-violet-300 underline-offset-4 hover:underline"
          href="/dashboard/credits"
        >
          {t('upgrade')}
        </Link>
      </div>
    );
  } else if (canAddMore) {
    createCard = (
      <button
        className={`${createCardClass} transition-colors hover:bg-violet-950/30 focus-visible:outline-2 focus-visible:outline-violet-400`}
        onClick={onCreate}
        type="button"
      >
        <span
          aria-hidden="true"
          className="flex size-11 items-center justify-center rounded-full bg-violet-950 text-violet-300"
        >
          <Plus className="size-5" />
        </span>
        <span className="font-semibold text-[17px]">{t('createTitle')}</span>
        <span className="text-slate-400 text-sm leading-snug">
          {t('createBody')}
        </span>
      </button>
    );
  } else {
    createCard = (
      <div className={createCardClass}>
        <span className="font-semibold text-[17px]">{t('createTitle')}</span>
        <span className="text-slate-400 text-sm leading-snug">
          {t('createLimit', { count: MAX_CUSTOM_CHARACTERS })}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-9" data-testid="character-picker">
      <section aria-labelledby="call-own" className="flex flex-col gap-3.5">
        <SectionHeading id="call-own">{t('yourCharacters')}</SectionHeading>
        <div className={GRID}>
          {createCard}
          {own.map((preset) => renderCard(preset, true))}
        </div>
      </section>
      {featured.length > 0 && (
        <section
          aria-labelledby="call-featured"
          className="flex flex-col gap-3.5"
        >
          <SectionHeading id="call-featured">{t('featured')}</SectionHeading>
          <div className={GRID}>
            {featured.map((preset) => renderCard(preset, false))}
          </div>
        </section>
      )}
    </div>
  );
}
