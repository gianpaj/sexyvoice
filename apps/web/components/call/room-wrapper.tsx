'use client';

import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
} from '@livekit/components-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { CallAgent } from './call-agent';
import { inRoom, useCallSession } from './call-session';

export function RoomWrapper({ children }: { children: ReactNode }) {
  const t = useTranslations('call');
  const { roomConnected, roomDisconnected, roomFailed, session } =
    useCallSession();

  return (
    <LiveKitRoom
      audio={true}
      className="flex h-screen w-full"
      connect={inRoom(session.phase)}
      onConnected={roomConnected}
      onDisconnected={roomDisconnected}
      onError={roomFailed}
      options={{
        publishDefaults: {
          stopMicTrackOnMute: true,
        },
      }}
      serverUrl={session.room?.url}
      token={session.room?.token}
    >
      {children}
      <CallAgent />
      <RoomAudioRenderer />
      <StartAudio label={t('allowAudio')} />
    </LiveKitRoom>
  );
}
