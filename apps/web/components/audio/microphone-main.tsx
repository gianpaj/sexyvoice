import { ChevronDown, Mic, Square, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePersistentMediaDevice } from '@/hooks/use-persistent-media-device';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { MicrophoneVisualizer } from './microphone-visualizer';

interface Props {
  mediaBlob: Blob | null;
  mediaStream: MediaStream | null;
  onClearMediaStream: () => void;
  onToggleMicrophone: () => void;
  status:
    | 'idle'
    | 'acquiring_media'
    | 'ready'
    | 'recording'
    | 'paused'
    | 'stopping'
    | 'stopped'
    | 'failed';
}

function AudioPlayer({ blob }: { blob: Blob }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob || blob.size === 0) {
      setAudioUrl(null);
      return;
    }

    // Use setTimeout to defer URL creation to next tick
    // This fixes a race condition where the audio element
    // tries to load before the blob is fully ready
    let url: string | null = null;
    url = URL.createObjectURL(blob);
    setAudioUrl(url);

    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [blob]);

  if (!audioUrl) return null;

  return (
    <div className="w-full">
      {/* biome-ignore lint/a11y/useMediaCaption: audio recording playback */}
      <audio
        className="h-10 w-full"
        controls
        key={audioUrl}
        preload="auto"
        src={audioUrl}
      />
    </div>
  );
}

function DeviceSelectDropdown() {
  const [listRequested, setListRequested] = useState(false);
  const deviceSelect = usePersistentMediaDevice({
    requestPermissions: listRequested,
  });
  // Firefox lists one placeholder without an ID until the microphone is used.
  const devices = deviceSelect.devices.filter((device) => device.deviceId);

  const handleDeviceChange = (deviceId: string) => {
    deviceSelect.setActiveMediaDevice(deviceId);
  };

  return (
    <DropdownMenu onOpenChange={(open) => open && setListRequested(true)}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Choose microphone"
          className="rounded-l-none border-gray-700 border-l px-2.5 font-semibold text-sm shadow-none hover:bg-neutral-700"
          variant="secondary"
        >
          <ChevronDown className="h-4 w-4 text-secondary-foreground" />
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
        {devices.map((device) => (
          <DropdownMenuCheckboxItem
            checked={device.deviceId === deviceSelect.activeDeviceId}
            className="text-xs"
            key={`device-${device.deviceId}`}
            onCheckedChange={() => handleDeviceChange(device.deviceId)}
          >
            {device.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MicrophoneMain(props: Props) {
  const {
    status,
    mediaBlob,
    mediaStream,
    onToggleMicrophone,
    onClearMediaStream,
  } = props;
  const t = useTranslations('clone');
  const recording = status === 'recording';
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    const checkPermission = async () => {
      try {
        const permission = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        });
        setHasPermission(permission.state === 'granted');
      } catch {
        setHasPermission(false);
      }
    };
    checkPermission().catch(() => {
      setHasPermission(false);
    });
  }, []);

  return (
    <div className="mx-auto flex w-4/5 flex-col items-center rounded-md text-secondary-foreground sm:w-72">
      <div className="flex w-full">
        <div
          className={cn(
            'flex w-full gap-1 bg-secondary/60 pr-4',
            hasPermission ? 'rounded-l-md' : 'rounded-r-md rounded-l-md',
          )}
        >
          <Button
            className="gap-1.5 rounded-r-none rounded-l-md px-3 py-2"
            disabled={status === 'acquiring_media'}
            onClick={onToggleMicrophone}
            variant={recording ? 'destructive' : 'secondary'}
          >
            {recording ? (
              <Square className="size-3.5 fill-current" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            {t(recording ? 'micStop' : 'micRecord')}
          </Button>
          <div className="flex w-full justify-center">
            <MicrophoneVisualizer mediaStream={mediaStream} />
          </div>
        </div>
        {hasPermission && <DeviceSelectDropdown />}
      </div>
      {status === 'stopped' && mediaBlob && (
        <div className="mt-6 flex w-full justify-center self-center">
          <AudioPlayer blob={mediaBlob} />
          <Button
            aria-label="Reset Microphone"
            className="ml-2 flex w-10 flex-1 justify-center bg-red-400 disabled:opacity-50"
            disabled={status !== 'stopped'}
            onClick={onClearMediaStream}
            variant="ghost"
          >
            <XIcon className="size-6!" />
          </Button>
        </div>
      )}
    </div>
  );
}
