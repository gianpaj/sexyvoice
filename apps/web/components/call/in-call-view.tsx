'use client';

import {
  useConnectionState,
  useLocalParticipant,
  useVoiceAssistant,
} from '@livekit/components-react';
import { useKrispNoiseFilter } from '@livekit/components-react/krisp';
import { ConnectionState } from 'livekit-client';
import { Mic, MicOff, PhoneOff, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Preset } from '@/data/presets';
import { useAgent } from '@/hooks/use-agent';
import { useConnection } from '@/hooks/use-connection';
import { usePersistentMediaDevice } from '@/hooks/use-persistent-media-device';
import { CharacterAvatar } from './character-avatar';
import {
  enableKrispNoiseFilterIfReady,
  isExpectedKrispNoiseFilterError,
} from './krisp-noise-filter';

const AGENT_TIMEOUT_MS = 10_000;

const roundButton =
  'flex size-16 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2';

/**
 * Disconnects when the agent never joins, or leaves and does not come back,
 * within ten seconds.
 */
function useAgentWatchdog() {
  const connectionState = useConnectionState();
  const { agent } = useAgent();
  const { disconnect } = useConnection();
  const t = useTranslations('call');
  const [hasSeenAgent, setHasSeenAgent] = useState(false);

  useEffect(() => {
    if (agent) {
      setHasSeenAgent(true);
      return;
    }
    if (connectionState !== ConnectionState.Connected) return;
    const timer = setTimeout(() => {
      disconnect();
      setHasSeenAgent(false);
      if (hasSeenAgent) {
        toast.info(t('disconnected'));
      } else {
        console.error('Agent Unavailable');
        toast.error(t('agentUnavailable'));
      }
    }, AGENT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [connectionState, agent, disconnect, hasSeenAgent, t]);
}

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

export function InCallView({
  elapsed,
  preset,
}: {
  /** Formatted call duration. */
  elapsed: string;
  preset: Preset;
}) {
  const t = useTranslations('call.inCall');
  const connectionState = useConnectionState();
  const { state: agentState } = useVoiceAssistant();
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const { disconnect } = useConnection();
  useAgentWatchdog();

  const connected = connectionState === ConnectionState.Connected;
  const muted = connected && !isMicrophoneEnabled;
  let status = t('connecting');
  if (muted) status = t('muted');
  else if (connected && agentState === 'speaking') status = t('speaking');
  else if (connected && agentState === 'thinking') status = t('thinking');
  else if (connected && agentState === 'listening') status = t('listening');

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
      <p className="text-[15px] text-slate-400 tabular-nums">{elapsed}</p>
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
