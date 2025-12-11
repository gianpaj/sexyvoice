import { useMediaDeviceSelect } from '@livekit/components-react';
import { ChevronDown, Mic, MicOff, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import useMediaRecorder from '@/hooks/use-media-recorder';
import { useMultibandTrackVolume } from '@/hooks/use-multiband-track-volume';
import { Button } from '../ui/button';
import { MultibandAudioVisualizer } from './multiband-bar-visualizer';

interface Props {
  onDataAvailable: (blob: Blob) => void;
  onMicStart: () => void;
  onMicReset: () => void;
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
      {/*<p className="mb-2 text-gray-300 text-sm">Recording ready:</p>*/}
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

export function MicrophoneMain(props: Props) {
  const deviceSelect = useMediaDeviceSelect({ kind: 'audioinput' });
  const {
    status,
    startRecording,
    stopRecording,
    clearMediaStream,
    clearMediaBlob,
    mediaStream,
    mediaBlob,
  } = useMediaRecorder({
    mediaStreamConstraints: { audio: true },
    onStop: (blob) => {
      // onStop receives the complete blob (all chunks combined)
      props.onDataAvailable(blob);
    },
    onError: (err) => {
      console.error(err);
    },
    onStart: props.onMicStart,
  });
  const micMultibandVolume = useMultibandTrackVolume(mediaStream, 9);

  const onClearMediaStream = () => {
    clearMediaStream();
    clearMediaBlob();
    props.onMicReset();
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: from existing code
  useEffect(() => clearMediaStream, []);

  const onToggleMicrophone = () => {
    if (status === 'idle' || status === 'stopped') {
      clearMediaStream();
      startRecording();
    } else if (status === 'recording') {
      stopRecording();
    }
  };

  return (
    <div className="mx-auto flex w-4/5 flex-col items-center rounded-md text-secondary-foreground sm:w-72">
      <div className="flex w-full">
        <div className="flex w-full gap-1 rounded-l-xl bg-gray-800 pr-4">
          <Button
            aria-label="Toggle Microphone"
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-l-md bg-neutral-100 px-3 py-2 font-medium text-neutral-900 text-sm transition-colors hover:bg-neutral-200/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950 disabled:pointer-events-none disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-50 dark:focus-visible:ring-neutral-300 dark:hover:bg-neutral-800/80 shadow-none${
              status !== 'ready' ? 'opacity-50' : ''
            }`}
            onClick={onToggleMicrophone}
          >
            {[
              'paused',
              'failed',
              'idle',
              'acquiring_media',
              'stopped',
              'stopping',
            ].includes(status) ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
          <div className="flex w-full justify-center">
            <MultibandAudioVisualizer
              barColor="#fff"
              barWidth={4}
              borderRadius={5}
              frequencies={micMultibandVolume}
              gap={2}
              maxBarHeight={16}
              minBarHeight={2}
              state="speaking"
            />
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="rounded-l-none border-gray-700 border-l-[1px] px-2.5 font-semibold text-sm shadow-none hover:bg-neutral-200/80"
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
            {deviceSelect.devices.map((device, index) => (
              <DropdownMenuCheckboxItem
                checked={device.deviceId === deviceSelect.activeDeviceId}
                className="text-xs"
                key={`device-${index}`}
                onCheckedChange={() =>
                  deviceSelect.setActiveMediaDevice(device.deviceId)
                }
              >
                {device.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs uppercase tracking-widest">
              Audio Settings
            </DropdownMenuLabel>
            {/*<DropdownMenuCheckboxItem
            className="text-xs"
            checked={isNoiseFilterEnabled}
            onCheckedChange={async (checked) => {
              setNoiseFilterEnabled(checked);
            }}
            disabled={isNoiseFilterPending}
          >
            Enhanced Noise Filter
          </DropdownMenuCheckboxItem>*/}
          </DropdownMenuContent>
        </DropdownMenu>
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
            <XIcon className="!size-6" />
          </Button>
        </div>
      )}
    </div>
  );
}
