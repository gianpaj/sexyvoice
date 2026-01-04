'use client';

import {
  BarVisualizer,
  TrackToggle,
  useConnectionState,
  useLocalParticipant,
} from '@livekit/components-react';
import { useKrispNoiseFilter } from '@livekit/components-react/krisp';
import { Track } from 'livekit-client';
import { ChevronDown, Mic, MicOff, PhoneOff } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCallTimer } from '@/hooks/use-call-timer';
import { useConnection } from '@/hooks/use-connection';
import { usePersistentMediaDevice } from '@/hooks/use-persistent-media-device';

export function SessionControls() {
  const localParticipant = useLocalParticipant();
  const deviceSelect = usePersistentMediaDevice();
  const connectionState = useConnectionState();
  const { formattedTime } = useCallTimer(connectionState);
  const { disconnect } = useConnection();

  const [isMuted, setIsMuted] = useState(localParticipant.isMicrophoneEnabled);
  const { isNoiseFilterEnabled, isNoiseFilterPending, setNoiseFilterEnabled } =
    useKrispNoiseFilter();
  useEffect(() => {
    setNoiseFilterEnabled(true);
  }, [setNoiseFilterEnabled]);
  useEffect(() => {
    setIsMuted(localParticipant.isMicrophoneEnabled === false);
  }, [localParticipant.isMicrophoneEnabled]);

  const handleDeviceChange = (deviceId: string) => {
    deviceSelect.setActiveMediaDevice(deviceId);
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="flex flex-row gap-2">
        <div className="flex items-center overflow-hidden rounded-md bg-bg2 text-secondary-foreground">
          <div className="flex items-center gap-2">
            <TrackToggle
              className={
                'hover:!bg-bg3 hover:!rounded-l-md !px-3 !border-r-[1px] !border-separator1 inline-flex h-9 items-center justify-center whitespace-nowrap rounded-l-md font-medium text-foreground text-sm shadow-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
              }
              showIcon={false}
              source={Track.Source.Microphone}
              style={{ borderRightStyle: 'solid' }}
            >
              {isMuted ? (
                <MicOff className="h-4 w-4 text-fg3" />
              ) : (
                <Mic className="h-4 w-4 text-fg3" />
              )}
            </TrackToggle>
            <BarVisualizer
              barCount={7}
              className="!h-6 pr-4 pl-2"
              state="speaking"
              trackRef={{
                participant: localParticipant.localParticipant,
                publication: localParticipant.microphoneTrack,
                source: Track.Source.Microphone,
              }}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-9 rounded-r-md rounded-l-none border-separator1 border-l-[1px] bg-bg2 px-3 font-semibold text-sm shadow-none hover:bg-bg3"
                variant="secondary"
              >
                <ChevronDown className="h-4 w-4 text-fg3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              alignOffset={-5}
              className="w-[320px]"
              forceMount
            >
              <DropdownMenuLabel className="text-xs uppercase tracking-widest">
                Available inputs
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {deviceSelect.devices.map((device, index) => (
                <DropdownMenuCheckboxItem
                  checked={device.deviceId === deviceSelect.activeDeviceId}
                  className="text-xs"
                  key={`device-${index}`}
                  onCheckedChange={() => handleDeviceChange(device.deviceId)}
                >
                  {device.label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs uppercase tracking-widest">
                Audio Settings
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={isNoiseFilterEnabled}
                className="text-xs"
                disabled={isNoiseFilterPending}
                onCheckedChange={(checked) => {
                  setNoiseFilterEnabled(checked);
                }}
              >
                Enhanced Noise Filter
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button className="h-9" onClick={disconnect} variant="secondary">
          <PhoneOff className="h-4 w-4" />
          Disconnect
        </Button>
      </div>
      <div className="font-mono text-muted-foreground text-sm">
        {formattedTime}
      </div>
    </div>
  );
}
