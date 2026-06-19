'use client';

import {
  AudioLines,
  Check,
  ChevronsUpDown,
  Pause,
  Play,
  Search,
  X,
} from 'lucide-react';
import * as React from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { capitalizeFirstLetter, cn } from '@/lib/utils';
import {
  getDisplayModel,
  MODEL_COLORS,
  VOICE_GENDERS,
  VOICE_MODELS,
  type VoiceGender,
  type VoiceModel,
} from '@/lib/voices';

type VoiceSelectProps = {
  voices?: Tables<'voices'>[];
  value?: string;
  onValueChange?: (voiceId: string) => void;
  className?: string;
};

function ModelDot({
  model,
  className,
}: {
  model: VoiceModel;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2 shrink-0 rounded-full', className)}
      style={{ backgroundColor: MODEL_COLORS[model] }}
    />
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function VoiceSelect({
  voices = [],
  value,
  onValueChange,
  className,
}: VoiceSelectProps) {
  const t = useTranslations('generate.voiceSelector');
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [modelFilter, setModelFilter] = React.useState<VoiceModel | null>(null);
  const [genderFilter, setGenderFilter] = React.useState<VoiceGender | null>(
    null,
  );
  const [internalValue, setInternalValue] = React.useState<string | undefined>(
    value,
  );
  const [playingId, setPlayingId] = React.useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);

  const selectedId = value ?? internalValue;
  const selected = voices.find((v) => v.id === selectedId);

  // Start / stop audio preview when playingId changes
  React.useEffect(() => {
    if (!playingId) {
      audioRef.current?.pause();
      audioRef.current = null;
      return;
    }
    const voice = voices.find((v) => v.id === playingId);
    if (!voice?.sample_url) {
      setPlayingId(null);
      return;
    }
    const audio = new Audio(voice.sample_url);
    audioRef.current = audio;
    audio.play().catch(() => setPlayingId(null));
    audio.addEventListener('ended', () => setPlayingId(null));
    return () => {
      audio.pause();
    };
  }, [playingId, voices]);

  // Stop audio when popover closes; reset highlight
  React.useEffect(() => {
    if (!open) {
      setPlayingId(null);
      setHighlightedIndex(-1);
    }
  }, [open]);

  const handleSelect = (id: string) => {
    if (value === undefined) setInternalValue(id);
    onValueChange?.(id);
    setOpen(false);
  };

  const togglePreview = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setPlayingId((prev) => (prev === id ? null : id));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          filtered.length === 0 ? -1 : prev < filtered.length - 1 ? prev + 1 : 0,
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          filtered.length === 0 ? -1 : prev > 0 ? prev - 1 : filtered.length - 1,
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
          handleSelect(filtered[highlightedIndex].id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'Home':
        e.preventDefault();
        if (filtered.length > 0) setHighlightedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        if (filtered.length > 0) setHighlightedIndex(filtered.length - 1);
        break;
    }
  };

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return voices.filter((v) => {
      const displayModel = getDisplayModel(v.model);
      const gender = v.type ?? '';
      if (modelFilter && displayModel !== modelFilter) return false;
      if (genderFilter && gender !== genderFilter) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        (v.description ?? '').toLowerCase().includes(q) ||
        displayModel.toLowerCase().includes(q) ||
        gender.toLowerCase().includes(q)
      );
    });
  }, [voices, query, modelFilter, genderFilter]);

  // Reset highlight whenever the filtered list changes
  React.useEffect(() => {
    setHighlightedIndex(-1);
  }, [filtered]);

  // Scroll highlighted item into view
  React.useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLElement>('[data-voice-item]');
    items[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  const activeFilterCount = (modelFilter ? 1 : 0) + (genderFilter ? 1 : 0);

  const clearFilters = () => {
    setModelFilter(null);
    setGenderFilter(null);
  };

  // Only show model filter chips that are represented in the voices list
  const presentModels = React.useMemo(
    () =>
      VOICE_MODELS.filter((m) =>
        voices.some((v) => getDisplayModel(v.model) === m),
      ),
    [voices],
  );

  const presentGenders = React.useMemo(
    () => VOICE_GENDERS.filter((g) => voices.some((v) => v.type === g)),
    [voices],
  );

  const selectedModel = selected ? getDisplayModel(selected.model) : null;

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          aria-label={t('selectVoicePlaceholder')}
          className={cn('h-12 w-full justify-between px-3', className)}
          role="combobox"
          variant="outline"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
                <AudioLines className="size-4 text-muted-foreground" />
              </span>
              <span className="flex min-w-0 flex-col items-start">
                <span className="truncate font-medium text-sm leading-tight">
                  {capitalizeFirstLetter(selected.name)}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  {selectedModel && <ModelDot model={selectedModel} />}
                  {selectedModel} &middot; {selected.description ?? ''}
                </span>
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{t('selectVoicePlaceholder')}</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-80 p-0"
      >
        {/* Search */}
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-activedescendant={
                highlightedIndex >= 0 && filtered[highlightedIndex]
                  ? `voice-item-${filtered[highlightedIndex].id}`
                  : undefined
              }
              aria-autocomplete="list"
              aria-controls="voice-select-listbox"
              autoFocus
              className="h-9 pl-8 text-sm"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('searchPlaceholder')}
              role="combobox"
              value={query}
            />
          </div>
        </div>

        {/* Filters */}
        {(presentModels.length > 0 || presentGenders.length > 0) && (
          <div className="space-y-2 border-b p-2">
            {presentModels.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-muted-foreground text-xs">
                    {t('filterModelLabel')}
                  </span>
                  {activeFilterCount > 0 && (
                    <button
                      className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
                      onClick={clearFilters}
                      type="button"
                    >
                      <X className="size-3" />
                      {t('clearFilters')}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {presentModels.map((model) => (
                    <FilterChip
                      active={modelFilter === model}
                      key={model}
                      onClick={() =>
                        setModelFilter((prev) =>
                          prev === model ? null : model,
                        )
                      }
                    >
                      <ModelDot model={model} />
                      {model}
                    </FilterChip>
                  ))}
                </div>
              </>
            )}
            {presentGenders.length > 0 && (
              <>
                <span className="font-medium text-muted-foreground text-xs">
                  {t('filterGenderLabel')}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {presentGenders.map((gender) => (
                    <FilterChip
                      active={genderFilter === gender}
                      key={gender}
                      onClick={() =>
                        setGenderFilter((prev) =>
                          prev === gender ? null : gender,
                        )
                      }
                    >
                      {gender}
                    </FilterChip>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Results */}
        <ScrollArea className="sm:h-72 h-64">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 px-4 py-10 text-center">
              <Search className="size-5 text-muted-foreground" />
              <p className="font-medium text-sm">{t('noVoicesFound')}</p>
              <p className="text-muted-foreground text-xs">
                {t('noVoicesFoundHint')}
              </p>
            </div>
          ) : (
            <ul
              aria-label={t('voiceListLabel')}
              className="p-1"
              id="voice-select-listbox"
              ref={listRef}
              role="listbox"
            >
              {filtered.map((voice, index) => {
                const isSelected = voice.id === selectedId;
                const isPlaying = voice.id === playingId;
                const isHighlighted = index === highlightedIndex;
                const displayModel = getDisplayModel(voice.model);
                const hasSample = Boolean(voice.sample_url);
                return (
                  <li
                    aria-selected={isSelected}
                    data-voice-item
                    id={`voice-item-${voice.id}`}
                    key={voice.id}
                    role="option"
                  >
                    <button
                      className={cn(
                        'group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors',
                        isSelected || isHighlighted ? 'bg-accent' : 'hover:bg-accent',
                      )}
                      onClick={() => handleSelect(voice.id)}
                      type="button"
                    >
                      {hasSample ? (
                        <span
                          aria-label={
                            isPlaying
                              ? t('stopPreview', { name: voice.name })
                              : t('previewVoice', { name: voice.name })
                          }
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors',
                            isPlaying
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'bg-background text-foreground hover:border-primary hover:text-primary',
                          )}
                          onClick={(e) => togglePreview(e, voice.id)}
                          role="button"
                          tabIndex={-1}
                        >
                          {isPlaying ? (
                            <Pause className="size-3.5" />
                          ) : (
                            <Play className="size-3.5 translate-x-px" />
                          )}
                        </span>
                      ) : (
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-transparent" />
                      )}

                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium text-sm">
                            {capitalizeFirstLetter(voice.name)}
                          </span>
                          {voice.description && (
                            <span className="text-muted-foreground text-xs">
                              {voice.description}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-muted-foreground text-xs">
                          <ModelDot model={displayModel} />
                          {displayModel}
                          {voice.type && (
                            <>
                              <span className="text-border">|</span>
                              {voice.type}
                            </>
                          )}
                        </span>
                      </span>

                      <Check
                        className={cn(
                          'size-4 shrink-0 text-primary transition-opacity',
                          isSelected ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        {/* Footer count */}
        <div className="flex items-center justify-between border-t px-3 py-2 text-muted-foreground text-xs">
          <span>
            {t('footerCount', { filtered: filtered.length, total: voices.length })}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
