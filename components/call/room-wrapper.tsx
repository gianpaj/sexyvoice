'use client';

import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
} from '@livekit/components-react';
import type { ReactNode } from 'react';

import { AgentProvider } from '@/hooks/use-agent';
import { useConnection } from '@/hooks/use-connection';

export function RoomWrapper({ children }: { children: ReactNode }) {
  const { shouldConnect, wsUrl, token } = useConnection();

  return (
    <LiveKitRoom
      audio={true}
      className="flex h-screen w-full"
      connect={shouldConnect}
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
