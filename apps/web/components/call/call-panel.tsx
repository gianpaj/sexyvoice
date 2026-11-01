'use client';

import {
  AlertCircle,
  Copy,
  Loader2,
  Mic,
  Pencil,
  PhoneCall,
  Trash2,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import type { CallLanguage } from '@/data/playground-state';
import { callLanguages } from '@/data/playground-state';
import type { DBVoice } from '@/data/voices';
import type { MicrophoneStatus } from '@/hooks/use-microphone-permission';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePlaygroundState } from '@/hooks/use-playground-state';
import { useSamplePlayer } from '@/hooks/use-sample-player';
import { type SavedCallVoice, savedVoiceMissing } from '@/lib/call-voices';
import {
  getPresetDescription,
  getPresetSampleUrl,
  MAX_CUSTOM_CHARACTERS,
} from '@/lib/characters';
import { getTranslatedLanguages } from '@/lib/i18n/get-translated-languages';
import { cn } from '@/lib/utils';
import { UpgradeCrown } from '../upgrade-crown';
import { CharacterAvatar } from './character-avatar';
import { ListenButton } from './listen-button';
import { SceneSelector } from './scene-selector';

interface CallPanelProps {
  callVoices: DBVoice[];
  connecting: boolean;
  isPaidUser: boolean;
  microphone: MicrophoneStatus;
  onDelete: () => void;
  onEdit: () => void;
  onOpenChange: (open: boolean) => void;
  onRemix: () => void;
  onRetryMicrophone: () => void;
  onStartCall: () => void;
  open: boolean;
  savedVoices: SavedCallVoice[];
}

const LANGUAGE_CODES = callLanguages.map(({ value }) => value);

export function CallPanel({
  callVoices,
  connecting,
  isPaidUser,
  microphone,
  onDelete,
  onEdit,
  onOpenChange,
  onRemix,
  onRetryMicrophone,
  onStartCall,
  open,
  savedVoices,
}: CallPanelProps) {
  const t = useTranslations('call.panel');
  const tCall = useTranslations('call');
  const locale = useLocale();
  const isMobile = useIsMobile();
  const { pgState, dispatch, helpers } = usePlaygroundState();
  const player = useSamplePlayer();
  const preset = helpers.getSelectedPreset(pgState);
  if (!preset) return null;

  const isOwn = !preset.isPublic;
  const { name } = preset;
  const { audioReferenceId } = preset.sessionConfig;
  const voiceMissing = savedVoiceMissing(preset.sessionConfig, savedVoices);
  const voiceName = voiceMissing
    ? t('noVoice')
    : (preset.voiceName ?? preset.sessionConfig.voice);
  let voiceDescription: string | null | undefined;
  if (!voiceMissing) {
    voiceDescription = audioReferenceId
      ? t('clonedVoice')
      : callVoices.find((voice) => voice.name === voiceName)?.description;
  }
  const sampleUrl = getPresetSampleUrl(preset);
  const listenKey = `panel:${preset.id}`;
  const playing = player.playingKey === listenKey;
  const missingPersonality = isOwn && !pgState.instructions.trim();
  const canRemix =
    isPaidUser && pgState.customCharacters.length < MAX_CUSTOM_CHARACTERS;

  const rowLabel = 'text-slate-300 text-sm';
  const primaryButton =
    'flex h-[54px] items-center justify-center gap-2.5 rounded-xl bg-linear-to-r from-violet-600 via-indigo-600 to-blue-600 font-semibold text-base text-white transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50';
  const secondaryButton =
    'inline-flex h-11 flex-[1_1_140px] items-center justify-center gap-2 rounded-[10px] border border-slate-700/70 px-4 font-semibold text-sm transition-colors';

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        aria-describedby={undefined}
        className={cn(
          'gap-0 overflow-y-auto border-slate-800 bg-slate-900 p-0',
          isMobile ? 'max-h-[92%] rounded-t-[20px]' : 'w-full sm:max-w-[440px]',
        )}
        data-testid="call-panel"
        onCloseAutoFocus={(event) => event.preventDefault()}
        showCloseButton={false}
        side={isMobile ? 'bottom' : 'right'}
      >
        <div className="flex items-center justify-between gap-3 pt-3 pr-3 pl-6">
          <span className="font-semibold text-violet-300 text-xs uppercase tracking-[0.12em]">
            {isOwn ? t('yourCharacter') : t('featuredCharacter')}
          </span>
          <SheetClose
            aria-label={t('close')}
            className="flex size-11 items-center justify-center rounded-[10px] text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
          >
            <X aria-hidden="true" className="size-5" />
          </SheetClose>
        </div>

        <div className="flex flex-col gap-[22px] px-6 pt-1.5 pb-7">
          <div className="flex items-center gap-4">
            <CharacterAvatar
              image={preset.image}
              name={name}
              seed={preset.id}
              size="xl"
            />
            <div className="flex min-w-0 flex-col gap-1">
              <SheetTitle className="font-bold text-[26px] leading-tight tracking-tight">
                {name}
              </SheetTitle>
              <SheetDescription className="text-[15px] text-slate-400">
                {getPresetDescription(preset, pgState.language)}
              </SheetDescription>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-800/40 py-3 pr-3 pl-4">
            <div className="flex min-w-0 flex-col">
              <span className="text-slate-500 text-xs">{t('voice')}</span>
              <span
                className={cn(
                  'font-semibold text-[15px]',
                  voiceMissing ? 'text-amber-300' : 'text-slate-50',
                )}
              >
                {voiceName}
                {voiceDescription && (
                  <span className="font-normal text-slate-400">
                    {' '}
                    · {voiceDescription}
                  </span>
                )}
              </span>
            </div>
            <ListenButton
              ariaLabel={tCall(
                playing ? 'picker.stopName' : 'picker.listenTo',
                { name },
              )}
              disabled={voiceMissing || !sampleUrl}
              label={tCall(playing ? 'picker.stop' : 'picker.listen')}
              onClick={() => player.toggle(listenKey, sampleUrl)}
              playing={playing}
            />
          </div>

          <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3">
            <label className={rowLabel} htmlFor="call-language">
              {tCall('languageLabel')}
            </label>
            <Select
              onValueChange={(value) =>
                dispatch({
                  payload: value as CallLanguage,
                  type: 'SET_LANGUAGE',
                })
              }
              value={pgState.language}
            >
              <SelectTrigger
                className="h-11 w-full border-slate-700/70 bg-slate-950/70"
                id="call-language"
              >
                <SelectValue placeholder={tCall('languagePlaceholder')} />
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {getTranslatedLanguages(locale, LANGUAGE_CODES).map(
                  ({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>

            <SceneSelector isPaidUser={isPaidUser} />

            <span className={rowLabel}>{t('microphone')}</span>
            <div
              className="flex min-h-11 items-center gap-2.5 text-sm"
              data-testid="call-microphone-status"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  microphone === 'ready' && 'bg-emerald-400',
                  microphone === 'blocked' && 'bg-red-400',
                  microphone === 'unknown' && 'bg-slate-500',
                )}
              />
              <span
                className={
                  microphone === 'blocked' ? 'text-red-300' : 'text-slate-200'
                }
              >
                {microphone === 'ready' && t('micReady')}
                {microphone === 'blocked' && t('micBlocked')}
                {microphone === 'unknown' && t('micUnknown')}
              </span>
            </div>
          </div>

          {microphone === 'blocked' && (
            <div
              className="flex gap-3 rounded-xl border border-red-900/80 bg-red-950/50 px-4 py-3.5"
              role="alert"
            >
              <AlertCircle
                aria-hidden="true"
                className="size-5 shrink-0 text-red-300"
              />
              <div className="flex flex-col items-start gap-2.5">
                <p className="text-red-100 text-sm leading-normal">
                  {t('micBlockedHelp', { name })}
                </p>
                <button
                  className="h-9 rounded-lg border border-red-800 px-3.5 font-semibold text-red-50 text-sm hover:bg-red-900/40"
                  onClick={onRetryMicrophone}
                  type="button"
                >
                  {t('tryAgain')}
                </button>
              </div>
            </div>
          )}

          {missingPersonality && (
            <p className="text-amber-300 text-sm">
              {t('missingPersonality', { name })}
            </p>
          )}
          {voiceMissing && (
            <p className="text-amber-300 text-sm">
              {t('noVoiceHelp', { name })}
            </p>
          )}

          {voiceMissing ? (
            <button className={primaryButton} onClick={onEdit} type="button">
              <Mic aria-hidden="true" className="size-[18px]" />
              {t('chooseVoice')}
            </button>
          ) : (
            <button
              className={primaryButton}
              disabled={connecting || missingPersonality}
              onClick={onStartCall}
              type="button"
            >
              {connecting ? (
                <Loader2
                  aria-hidden="true"
                  className="size-[18px] animate-spin"
                />
              ) : (
                <PhoneCall aria-hidden="true" className="size-[18px]" />
              )}
              {connecting ? tCall('connecting') : tCall('startCall')}
            </button>
          )}

          {isOwn ? (
            <div className="flex flex-wrap gap-2.5">
              <button
                className={cn(
                  secondaryButton,
                  'bg-slate-800/60 text-slate-200 hover:bg-slate-800',
                )}
                onClick={onEdit}
                type="button"
              >
                <Pencil aria-hidden="true" className="size-4" />
                {tCall('picker.edit')}
              </button>
              <button
                className={cn(
                  secondaryButton,
                  'text-red-300 hover:bg-red-950/40',
                )}
                onClick={onDelete}
                type="button"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                {tCall('picker.delete')}
              </button>
            </div>
          ) : (
            (canRemix || !isPaidUser) && (
              // Free users see the remix, disabled, with what a plan adds.
              <div className="flex items-center gap-2.5">
                <button
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] border border-slate-700/70 px-3.5 font-semibold text-sm text-violet-100 hover:bg-slate-800/60 disabled:pointer-events-none disabled:opacity-50"
                  disabled={!canRemix}
                  onClick={onRemix}
                  type="button"
                >
                  <Copy aria-hidden="true" className="size-4" />
                  {t('makeYourOwn')}
                </button>
                {!isPaidUser && (
                  <UpgradeCrown tooltip={t('makeYourOwnUpgrade')} />
                )}
              </div>
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
