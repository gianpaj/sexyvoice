'use client';

import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
} from '@livekit/components-react';
import { MediaDeviceFailure } from 'livekit-client';
import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { AgentProvider } from '@/hooks/use-agent';
import { useConnection } from '@/hooks/use-connection';

const CONNECTION_TIMEOUT_MS = 30_000;

export function RoomWrapper({ children }: { children: ReactNode }) {
  const { disconnect, shouldConnect, wsUrl, token } = useConnection();
  const t = useTranslations('call');
  const hasConnected = useRef(false);
  const connectionTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // LiveKit's connection effect depends on the identity of onError.
  const handleError = useCallback(
    (error?: Error) => {
      const failure = MediaDeviceFailure.getFailure(error);
      const permissionDenied = failure === MediaDeviceFailure.PermissionDenied;
      const microphoneUnavailable =
        failure === MediaDeviceFailure.NotFound ||
        failure === MediaDeviceFailure.DeviceInUse ||
        error?.name === 'OverconstrainedError' ||
        error?.name === 'ConstraintNotSatisfiedError';
      if (hasConnected.current && !permissionDenied && !microphoneUnavailable)
        return;

      clearTimeout(connectionTimeout.current);
      hasConnected.current = false;
      let message = t('connectionFailed');
      if (permissionDenied) {
        message = t('microphonePermissionDenied');
      } else if (microphoneUnavailable) {
        message = t('microphoneUnavailable');
      }
      toast.error(message);
      disconnect().catch(() => undefined);
    },
    [disconnect, t],
  );

  useEffect(() => {
    if (!(shouldConnect && token)) return;

    hasConnected.current = false;
    const timeout = setTimeout(handleError, CONNECTION_TIMEOUT_MS);
    connectionTimeout.current = timeout;

    return () => {
      clearTimeout(timeout);
      connectionTimeout.current = undefined;
    };
  }, [handleError, shouldConnect, token]);

  const handleDisconnected = () => {
    const wasConnected = hasConnected.current;
    hasConnected.current = false;

    // Initial failures emit disconnect before the final onError callback.
    if (wasConnected && shouldConnect) {
      toast.info(t('disconnected'));
      disconnect().catch(() => undefined);
    }
  };

  return (
    <LiveKitRoom
      audio={true}
      className="flex h-screen w-full"
      connect={shouldConnect}
      onConnected={() => {
        clearTimeout(connectionTimeout.current);
        hasConnected.current = true;
      }}
      onDisconnected={handleDisconnected}
      onError={handleError}
      options={{
        publishDefaults: {
          stopMicTrackOnMute: true,
        },
      }}
      serverUrl={wsUrl}
      token={token}
    >
      <AgentProvider>
        {children}
        <RoomAudioRenderer />
        <StartAudio label="Click to allow audio playback" />
      </AgentProvider>
    </LiveKitRoom>
  );
}
