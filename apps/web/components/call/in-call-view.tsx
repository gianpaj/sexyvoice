'use client';

import { useLocalParticipant } from '@livekit/components-react';
import { useKrispNoiseFilter } from '@livekit/components-react/krisp';
import { Mic, MicOff, PhoneOff, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePersistentMediaDevice } from '@/hooks/use-persistent-media-device';
import type { Character } from '@/lib/calls/characters';
import { formatCallTime, useCallElapsed, useCallSession } from './call-session';
import { CharacterAvatar } from './character-avatar';
import {
  enableKrispNoiseFilterIfReady,
  isExpectedKrispNoiseFilterError,
} from './krisp-noise-filter';

const roundButton =
  'flex size-16 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2';

function AudioSettingsMenu() {
  const t = useTranslations('call');
  const deviceSelect = usePersistentMediaDevice();
  const { microphoneTrack } = useLocalParticipant();
  const { isNoiseFilterEnabled, isNoiseFilterPending, setNoiseFilterEnabled } =
    useKrispNoiseFilter();

  useEffect(() => {
    let cancelled = false;
    const warn = (error: unknown) => {
      if (!cancelled) {
        console.warn('Krisp noise filter could not be enabled', error);
      }
    };
    enableKrispNoiseFilterIfReady({
      microphonePublication: microphoneTrack,
      onUnexpectedError: warn,
      setNoiseFilterEnabled,
    }).catch(warn);
    return () => {
      cancelled = true;
    };
  }, [microphoneTrack, setNoiseFilterEnabled]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t('inCall.audioSettings')}
          className={`${roundButton} border border-slate-700/70 bg-slate-800/60 text-slate-50 hover:bg-slate-800`}
          type="button"
        >
          <SlidersHorizontal aria-hidden="true" className="size-6" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-[320px]">
        <DropdownMenuLabel className="text-xs uppercase tracking-widest">
          {t('availableInputs')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {deviceSelect.devices.map((device) => (
          <DropdownMenuCheckboxItem
            checked={device.deviceId === deviceSelect.activeDeviceId}
            className="text-xs"
            key={`device-${device.deviceId}`}
            onCheckedChange={() =>
              deviceSelect.setActiveMediaDevice(device.deviceId)
            }
          >
            {device.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs uppercase tracking-widest">
          {t('audioSettings')}
        </DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={isNoiseFilterEnabled}
          className="text-xs"
          disabled={isNoiseFilterPending}
          onCheckedChange={(checked) =>
            Promise.resolve(setNoiseFilterEnabled(checked)).catch((error) => {
              if (!isExpectedKrispNoiseFilterError(error)) {
                console.warn('Krisp noise filter could not be changed', error);
              }
            })
          }
        >
          {t('enhancedNoiseFilter')}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InCallView({ preset }: { preset: Character }) {
  const t = useTranslations('call.inCall');
  const { disconnect, session } = useCallSession();
  const elapsed = useCallElapsed();
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();

  const { phase } = session;
  const connected = phase.name === 'connected';
  const agentState = connected ? phase.agentState : undefined;
  const muted = connected && !isMicrophoneEnabled;
  let status = t('connecting');
  if (muted) status = t('muted');
  else if (agentState === 'speaking') status = t('speaking');
  else if (agentState === 'thinking') status = t('thinking');
  else if (agentState === 'listening') status = t('listening');

  return (
    <div
      className="flex min-h-[calc(100dvh-12rem)] flex-col items-center justify-center gap-4 px-4 py-12 text-center"
      data-testid="in-call-view"
    >
      <div className="rounded-full p-2.5 shadow-[0_0_0_10px_rgba(124,58,237,0.18),0_0_0_24px_rgba(124,58,237,0.08)]">
        <CharacterAvatar
          image={preset.image}
          name={preset.name}
          seed={preset.id}
          size="3xl"
        />
      </div>
      <h1 className="mt-[18px] font-bold text-[32px] leading-tight">
        {preset.name}
      </h1>
      <p aria-live="polite" className="text-base text-violet-300">
        {status}
      </p>
      <p className="text-[15px] text-slate-400 tabular-nums">
        {formatCallTime(elapsed)}
      </p>
      <div className="mt-4 flex gap-5">
        <button
          aria-label={muted ? t('unmute') : t('mute')}
          aria-pressed={muted}
          className={`${roundButton} border border-slate-700/70 bg-slate-800/60 text-slate-50 hover:bg-slate-800 disabled:opacity-50`}
          disabled={!connected}
          onClick={() =>
            localParticipant
              .setMicrophoneEnabled(!isMicrophoneEnabled)
              .catch((error) => console.warn('Microphone toggle failed', error))
          }
          type="button"
        >
          {muted ? (
            <MicOff aria-hidden="true" className="size-6" />
          ) : (
            <Mic aria-hidden="true" className="size-6" />
          )}
        </button>
        <button
          aria-label={t('end')}
          className={`${roundButton} bg-red-600 text-white hover:bg-red-500`}
          onClick={disconnect}
          type="button"
        >
          <PhoneOff aria-hidden="true" className="size-6" />
        </button>
        {connected && <AudioSettingsMenu />}
      </div>
    </div>
  );
}
