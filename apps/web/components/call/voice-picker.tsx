'use client';

import { Mic } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { SessionConfig } from '@/data/session-config';
import type { DBVoice } from '@/data/voices';
import { useSamplePlayer } from '@/hooks/use-sample-player';
import {
  type SavedCallVoice,
  savedVoiceSampleUrl,
  withCallVoice,
} from '@/lib/call-voices';
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

function VoiceTile({
  voice,
  selected = false,
  isNew = false,
  disabled,
  onPick,
  onUse,
}: {
  voice: VoiceOption;
  selected?: boolean;
  isNew?: boolean;
  disabled?: boolean;
  onPick?: () => void;
  onUse?: () => void;
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
    >
      {onUse ? (
        <button
          aria-label={voice.name}
          className="flex min-h-11 min-w-0 flex-1 items-center rounded text-left focus-visible:outline-2 focus-visible:outline-violet-400 disabled:opacity-50"
          disabled={disabled}
          onClick={onUse}
          type="button"
        >
          {content}
        </button>
      ) : (
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
          <input
            checked={selected}
            className="size-[18px] shrink-0 accent-violet-400"
            disabled={disabled}
            name="call-voice"
            onChange={onPick}
            type="radio"
            value={voice.id}
          />
          {content}
        </label>
      )}
      {voice.sampleUrl && (
        <ListenButton
          ariaLabel={t(playing ? 'stop' : 'play', { name: voice.name })}
          onClick={() => player.toggle(key, voice.sampleUrl)}
          playing={playing}
        />
      )}
    </div>
  );
}

export function SavedCallVoices({
  voices,
  disabled,
  onUse,
}: {
  voices: SavedCallVoice[];
  disabled?: boolean;
  onUse: (voice: SavedCallVoice) => void;
}) {
  const t = useTranslations('call.voices');
  if (!voices.length) return null;
  return (
    <section
      aria-labelledby="call-saved-voices"
      className="flex flex-col gap-3.5"
    >
      <h2 className={headingClass} id="call-saved-voices">
        {t('yourVoices')}
      </h2>
      <div className={gridClass}>
        {voices.map((voice) => (
          <VoiceTile
            disabled={disabled}
            key={voice.id}
            onUse={() => onUse(voice)}
            voice={{
              ...voice,
              description: t('clonedVoice'),
              sampleUrl: savedVoiceSampleUrl(voice.id),
            }}
          />
        ))}
      </div>
    </section>
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

  return (
    <div
      aria-labelledby={labelledBy}
      className="flex flex-col gap-5"
      role="radiogroup"
    >
      {(saved.length > 0 || onCloneVoice) && (
        <div className="flex flex-col gap-2.5">
          <h3 className={headingClass}>{t('yourVoices')}</h3>
          <div className={gridClass}>
            {saved.map(renderTile)}
            {onCloneVoice && (
              <button
                className="flex min-h-[68px] items-center gap-3 rounded-xl border-[1.5px] border-violet-800/80 border-dashed bg-slate-950/40 px-3.5 py-3 text-left transition-colors hover:bg-violet-950/40 disabled:pointer-events-none disabled:opacity-50"
                disabled={disabled}
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
                    {t('cloneBody')}
                  </span>
                </span>
              </button>
            )}
          </div>
        </div>
      )}
      {builtIn.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <h3 className={headingClass}>{t('builtIn')}</h3>
          <div className={gridClass}>{builtIn.map(renderTile)}</div>
        </div>
      )}
    </div>
  );
}
