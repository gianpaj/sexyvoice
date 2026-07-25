'use client';

import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
} from '@livekit/components-react';
import { captureException } from '@sentry/nextjs';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { AgentProvider } from '@/hooks/use-agent';
import { useCallRoom } from '@/hooks/use-call-room';
import { useConnection } from '@/hooks/use-connection';

const ROOM_CLASS_NAME = 'flex h-screen w-full';

export function RoomWrapper({ children }: { children: ReactNode }) {
  const { shouldConnect, wsUrl, token, e2eeKey, disconnect } = useConnection();
  const { room, canConnect, e2eeError } = useCallRoom(e2eeKey, shouldConnect);
  const t = useTranslations('call');
  const reportedE2eeError = useRef<Error | null>(null);

  // The room can never connect once encryption setup failed, so unwind the
  // pending connection instead of leaving the connect button spinning.
  useEffect(() => {
    if (!e2eeError || reportedE2eeError.current === e2eeError) {
      return;
    }

    reportedE2eeError.current = e2eeError;
    toast.error(t('encryptionUnavailable'));
    disconnect().catch(captureException);
  }, [e2eeError, t, disconnect]);

  const handleEncryptionError = (error: Error) => {
    captureException(error);
    toast.error(t('encryptionError'));
  };

  // The room is created in an effect, so keep the layout stable for the first
  // paint (and for the server-rendered markup).
  if (!room) {
    return <div className={ROOM_CLASS_NAME} />;
  }

  return (
    <LiveKitRoom
      audio={true}
      className={ROOM_CLASS_NAME}
      connect={canConnect}
      onEncryptionError={handleEncryptionError}
      room={room}
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
