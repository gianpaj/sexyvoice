'use client';

import {
  Copy,
  Loader2,
  MoreHorizontal,
  Pencil,
  PhoneCall,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Preset } from '@/data/presets';
import { getPresetSampleUrl } from '@/lib/characters';
import { cn } from '@/lib/utils';
import { CharacterAvatar } from './character-avatar';
import { ListenButton } from './listen-button';

interface CharacterCardProps {
  /** This character's call is starting. */
  connecting?: boolean;
  description: string;
  /** Another call is starting, so this card's Call waits. */
  disabled?: boolean;
  highlighted?: boolean;
  /** Edit, duplicate and delete; only for the user's own characters. */
  menu?: {
    onDelete: () => void;
    onDuplicate?: () => void;
    onEdit: () => void;
  };
  /** Starts a call, like the panel's Start call. */
  onCall: () => void;
  onListen: () => void;
  /** Opens the call panel. */
  onOpen: () => void;
  playing: boolean;
  preset: Preset;
}

export function CharacterCard({
  connecting = false,
  description,
  disabled = false,
  highlighted,
  menu,
  onCall,
  onListen,
  onOpen,
  playing,
  preset,
}: CharacterCardProps) {
  const t = useTranslations('call.picker');
  const tCall = useTranslations('call');
  const { name } = preset;

  return (
    <article
      className={cn(
        'relative flex min-h-[200px] flex-col justify-between gap-[18px] rounded-[14px] border bg-slate-900/70 p-[18px] transition-shadow',
        highlighted
          ? 'border-violet-400 shadow-[0_0_0_4px_rgba(167,139,250,0.25)]'
          : 'border-slate-800',
      )}
      data-character-id={preset.id}
    >
      <button
        aria-label={t('open', { name })}
        className="flex flex-col items-start gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-4"
        onClick={onOpen}
        type="button"
      >
        <CharacterAvatar image={preset.image} name={name} seed={preset.id} />
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold text-[17px] text-slate-50">
            {name}
          </span>
          {description && (
            <span className="line-clamp-2 text-slate-400 text-sm">
              {description}
            </span>
          )}
        </span>
      </button>
      <div className="flex items-center justify-between gap-2">
        <ListenButton
          ariaLabel={t(playing ? 'stopName' : 'listenTo', { name })}
          disabled={!getPresetSampleUrl(preset)}
          label={t(playing ? 'stop' : 'listen')}
          onClick={onListen}
          playing={playing}
        />
        <button
          aria-label={t('callName', { name })}
          className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-violet-700 px-[18px] font-semibold text-sm text-white transition-colors hover:bg-violet-600 focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-55"
          disabled={connecting || disabled}
          onClick={onCall}
          type="button"
        >
          {connecting ? (
            <Loader2 aria-hidden="true" className="size-[15px] animate-spin" />
          ) : (
            <PhoneCall aria-hidden="true" className="size-[15px]" />
          )}
          {connecting ? tCall('connecting') : t('call')}
        </button>
      </div>
      {menu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={t('moreOptions', { name })}
              className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-[10px] text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              type="button"
            >
              <MoreHorizontal aria-hidden="true" className="size-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[184px]">
            <DropdownMenuItem className="h-10" onSelect={menu.onEdit}>
              <Pencil aria-hidden="true" />
              {t('edit')}
            </DropdownMenuItem>
            {menu.onDuplicate && (
              <DropdownMenuItem className="h-10" onSelect={menu.onDuplicate}>
                <Copy aria-hidden="true" />
                {t('duplicate')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="h-10 text-red-300 focus:text-red-200"
              onSelect={menu.onDelete}
            >
              <Trash2 aria-hidden="true" />
              {t('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </article>
  );
}
