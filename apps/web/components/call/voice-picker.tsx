'use client';

import { ChevronDown, Mic, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { flushSync } from 'react-dom';

import type { SessionConfig } from '@/data/session-config';
import type { DBVoice } from '@/data/voices';
import { useSamplePlayer } from '@/hooks/use-sample-player';
import {
  type SavedCallVoice,
  savedVoiceSampleUrl,
  withCallVoice,
} from '@/lib/call-voices';
import { MAX_SAVED_CALL_VOICES } from '@/lib/clone/call-voice-config';
import { cn } from '@/lib/utils';
import { ListenButton } from './listen-button';

interface VoiceOption {
  description: string;
  id: string;
  name: string;
  provider?: string;
  sampleUrl: string | null;
  savedId?: string;
}

const gridClass =
  'grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-2.5';
const headingClass =
  'font-semibold text-slate-400 text-xs uppercase tracking-[0.1em]';

// One column on phones, about three in the creator from 768px.
const WIDE_QUERY = '(min-width: 768px)';

function subscribeToWidth(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Tiles in a collapsed grid. The server render assumes a phone. */
function useCollapsedTileCount() {
  const wide = useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
  return wide ? 6 : 4;
}

/** The first tiles, with the selected voice in the last slot if it's later. */
function collapsedVoices(
  voices: VoiceOption[],
  limit: number,
  selectedId?: string,
) {
  const shown = voices.slice(0, limit);
  const selected = voices.find((voice) => voice.id === selectedId);
  if (!selected || shown.includes(selected)) return shown;
  return [...shown.slice(0, -1), selected];
}

function VoiceGrid({
  heading,
  leading,
  renderTile,
  selectedId,
  voices,
}: {
  heading: ReactNode;
  /** A tile before the voices, such as Clone a voice. It is always shown. */
  leading?: ReactNode;
  renderTile: (voice: VoiceOption) => ReactNode;
  selectedId?: string;
  voices: VoiceOption[];
}) {
  const t = useTranslations('call.voices');
  const [expanded, setExpanded] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const gridId = useId();
  const limit = useCollapsedTileCount() - (leading ? 1 : 0);
  const collapsible = voices.length > limit;
  const shown =
    collapsible && !expanded
      ? collapsedVoices(voices, limit, selectedId)
      : voices;

  const toggle = () => {
    const section = sectionRef.current;
    if (expanded) {
      flushSync(() => setExpanded(false));
      // Don't leave the reader below a list that just got shorter.
      if (section && section.getBoundingClientRect().top < 0) {
        section.scrollIntoView({ block: 'start' });
      }
      return;
    }
    const firstHidden = voices.find((voice) => !shown.includes(voice));
    flushSync(() => setExpanded(true));
    const tile = section?.querySelector(`[data-voice-id="${firstHidden?.id}"]`);
    tile?.querySelector<HTMLElement>('input, button')?.focus();
  };

  return (
    <div className="flex flex-col gap-2.5" ref={sectionRef}>
      {heading}
      <div className={gridClass} id={gridId}>
        {leading}
        {shown.map(renderTile)}
      </div>
      {collapsible && (
        <button
          aria-controls={gridId}
          aria-expanded={expanded}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-800 px-4 font-semibold text-sm text-violet-300 transition-colors hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-violet-400 md:w-auto md:self-start"
          onClick={toggle}
          type="button"
        >
          {expanded ? t('showFewer') : t('showAll', { count: voices.length })}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-4 transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </button>
      )}
    </div>
  );
}

function VoiceTile({
  voice,
  selected = false,
  isNew = false,
  disabled,
  onDelete,
  onPick,
  onUnpick,
}: {
  voice: VoiceOption;
  selected?: boolean;
  isNew?: boolean;
  disabled?: boolean;
  onDelete?: () => void;
  onPick?: () => void;
  /** Called when the selected tile is clicked again. */
  onUnpick?: () => void;
}) {
  const t = useTranslations('call.voices');
  const player = useSamplePlayer();
  const key = `voice:${voice.id}`;
  const playing = player.playingKey === key;
  const content = (
    <span className="flex min-w-0 flex-col">
      <span className="flex items-center gap-1.5 font-semibold text-[15px] text-slate-50">
        <span className="truncate">{voice.name}</span>
        {isNew && (
          <span className="rounded-full bg-violet-400 px-1.5 font-bold text-[11px] text-slate-950">
            {t('new')}
          </span>
        )}
      </span>
      <span className="truncate text-[13px] text-slate-400">
        {voice.description}
      </span>
    </span>
  );
  return (
    <div
      className={cn(
        'flex min-h-[68px] items-center gap-2 rounded-xl border py-2 pr-2 pl-3.5 transition-colors',
        selected
          ? 'border-violet-400 bg-violet-950/60'
          : 'border-slate-800 bg-slate-900/70',
      )}
      data-voice-id={voice.id}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input
          checked={selected}
          className="size-[18px] shrink-0 accent-violet-400"
          disabled={disabled}
          name="call-voice"
          onChange={onPick}
          // A checked radio fires click but not change.
          onClick={selected ? onUnpick : undefined}
          type="radio"
          value={voice.id}
        />
        {content}
      </label>
      {voice.sampleUrl && (
        <ListenButton
          ariaLabel={t(playing ? 'stop' : 'play', { name: voice.name })}
          onClick={() => player.toggle(key, voice.sampleUrl)}
          playing={playing}
        />
      )}
      {onDelete && (
        <button
          aria-label={t('delete', { name: voice.name })}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-950/40 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-violet-400 disabled:opacity-50"
          disabled={disabled}
          onClick={onDelete}
          type="button"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Saved voices on the Clone page: pick one to speak with, click it again to
 * go back to a recording, or delete it.
 */
export function SavedCallVoices({
  voices,
  selectedId,
  disabled,
  onDelete,
  onSelect,
}: {
  voices: SavedCallVoice[];
  selectedId: string | null;
  disabled?: boolean;
  onDelete: (voice: SavedCallVoice) => void;
  onSelect: (voice: SavedCallVoice | null) => void;
}) {
  const t = useTranslations('call.voices');
  if (!voices.length) return null;
  const byId = new Map(voices.map((voice) => [voice.id, voice]));
  const act = (id: string, action: (voice: SavedCallVoice) => void) => () => {
    const voice = byId.get(id);
    if (voice) action(voice);
  };
  return (
    <div aria-labelledby="call-saved-voices" role="radiogroup">
      <VoiceGrid
        heading={
          <h2 className={cn(headingClass, 'mb-1')} id="call-saved-voices">
            {t('yourVoices')}
          </h2>
        }
        renderTile={(voice) => (
          <VoiceTile
            disabled={disabled}
            key={voice.id}
            onDelete={act(voice.id, onDelete)}
            onPick={act(voice.id, onSelect)}
            onUnpick={() => onSelect(null)}
            selected={voice.id === selectedId}
            voice={voice}
          />
        )}
        selectedId={selectedId ?? undefined}
        voices={voices.map((voice) => ({
          ...voice,
          description: t('clonedVoice'),
          sampleUrl: savedVoiceSampleUrl(voice.id),
        }))}
      />
    </div>
  );
}

interface VoicePickerProps {
  callVoices: DBVoice[];
  config: SessionConfig;
  disabled?: boolean;
  /** ID of the heading that names the voice choice. */
  labelledBy?: string;
  /** Saved voice to badge as new, such as one cloned in this session. */
  newVoiceId?: string | null;
  onChange: (config: SessionConfig) => void;
  /** Shows the Clone a voice tile when given. */
  onCloneVoice?: () => void;
  savedVoices: SavedCallVoice[];
}

export function VoicePicker({
  callVoices,
  config,
  disabled,
  labelledBy,
  newVoiceId,
  onChange,
  onCloneVoice,
  savedVoices,
}: VoicePickerProps) {
  const t = useTranslations('call.voices');
  const atVoiceLimit = savedVoices.length >= MAX_SAVED_CALL_VOICES;

  const saved: VoiceOption[] = savedVoices.map((voice) => ({
    description: t('clonedVoice'),
    id: voice.id,
    name: voice.name,
    sampleUrl: savedVoiceSampleUrl(voice.id),
    savedId: voice.id,
    provider: voice.provider,
  }));
  const builtIn: VoiceOption[] = callVoices.map((voice) => ({
    description: voice.description ?? voice.type ?? '',
    id: voice.id,
    name: voice.name,
    sampleUrl: voice.sample_url,
  }));

  const renderTile = (voice: VoiceOption) => {
    const selected = voice.savedId
      ? config.audioReferenceId === voice.savedId
      : !config.audioReferenceId && config.voice === voice.name;
    return (
      <VoiceTile
        disabled={disabled}
        isNew={Boolean(voice.savedId && voice.savedId === newVoiceId)}
        key={voice.id}
        onPick={() =>
          onChange(
            withCallVoice(config, {
              name: voice.name,
              savedId: voice.savedId,
              provider: voice.provider,
            }),
          )
        }
        selected={selected}
        voice={voice}
      />
    );
  };

  const builtInSelected = config.audioReferenceId
    ? undefined
    : builtIn.find((voice) => voice.name === config.voice)?.id;

  return (
    <div
      aria-labelledby={labelledBy}
      className="flex flex-col gap-5"
      role="radiogroup"
    >
      {(saved.length > 0 || onCloneVoice) && (
        <VoiceGrid
          heading={<h3 className={headingClass}>{t('yourVoices')}</h3>}
          leading={
            onCloneVoice && (
              <button
                className="flex min-h-[68px] items-center gap-3 rounded-xl border-[1.5px] border-violet-800/80 border-dashed bg-slate-950/40 px-3.5 py-3 text-left transition-colors hover:bg-violet-950/40 disabled:pointer-events-none disabled:opacity-50"
                disabled={disabled || atVoiceLimit}
                onClick={onCloneVoice}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-950 text-violet-300"
                >
                  <Mic className="size-[18px]" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold text-[15px]">
                    {t('cloneTitle')}
                  </span>
                  <span className="text-[13px] text-slate-400">
                    {atVoiceLimit
                      ? t('cloneLimit', { max: MAX_SAVED_CALL_VOICES })
                      : t('cloneBody')}
                  </span>
                </span>
              </button>
            )
          }
          renderTile={renderTile}
          selectedId={config.audioReferenceId}
          voices={saved}
        />
      )}
      {builtIn.length > 0 && (
        <VoiceGrid
          heading={<h3 className={headingClass}>{t('builtIn')}</h3>}
          renderTile={renderTile}
          selectedId={builtInSelected}
          voices={builtIn}
        />
      )}
    </div>
  );
}
