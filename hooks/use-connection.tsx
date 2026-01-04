'use client';

import type React from 'react';
import { createContext, useCallback, useContext, useState } from 'react';

import type { PlaygroundState } from '@/data/playground-state';
import { VoiceId } from '@/data/voices';
import { usePlaygroundState } from './use-playground-state';

export type ConnectFn = () => Promise<void>;

interface TokenGeneratorData {
  shouldConnect: boolean;
  wsUrl: string;
  token: string;
  pgState: PlaygroundState;
  voice: VoiceId;
  disconnect: () => Promise<void>;
  connect: ConnectFn;
}

const ConnectionContext = createContext<TokenGeneratorData | undefined>(
  undefined,
);

export const ConnectionProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [connectionDetails, setConnectionDetails] = useState<{
    wsUrl: string;
    token: string;
    shouldConnect: boolean;
    voice: VoiceId;
  }>({ wsUrl: '', token: '', shouldConnect: false, voice: VoiceId.ARA });

  const { pgState, helpers } = usePlaygroundState();

  const connect = async () => {
    console.log('connect');

    const response = await fetch('/api/call-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(helpers.getStateWithFullInstructions(pgState)),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch token');
    }

    const { accessToken, url } = await response.json();

    setConnectionDetails({
      wsUrl: url,
      token: accessToken,
      shouldConnect: true,
      voice: pgState.sessionConfig.voice,
    });
  };

  // biome-ignore lint/suspicious/useAwait: needed
  const disconnect = useCallback(async () => {
    setConnectionDetails((prev) => ({ ...prev, shouldConnect: false }));
  }, []);

  // // Effect to handle API key changes
  // useEffect(() => {
  //   console.log("shouldConnect", connectionDetails.shouldConnect);

  //   if (connectionDetails.shouldConnect) {
  //     disconnect();
  //   }
  // }, [connectionDetails.shouldConnect, disconnect]);

  return (
    <ConnectionContext.Provider
      value={{
        wsUrl: connectionDetails.wsUrl,
        token: connectionDetails.token,
        shouldConnect: connectionDetails.shouldConnect,
        voice: connectionDetails.voice,
        pgState,
        connect,
        disconnect,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
};

export const useConnection = () => {
  const context = useContext(ConnectionContext);

  if (context === undefined) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }

  return context;
};
