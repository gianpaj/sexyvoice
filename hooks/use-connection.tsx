'use client';

import { useQueryClient } from '@tanstack/react-query';
import type React from 'react';
import { createContext, useCallback, useContext, useState } from 'react';
import { toast } from 'sonner';

import type { PlaygroundState } from '@/data/playground-state';
import { VoiceId } from '@/data/voices';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import useSupabaseBrowser from '@/lib/supabase/client';
import { MINIMUM_CREDITS_FOR_CALL } from '@/lib/supabase/constants';
import { usePlaygroundState } from './use-playground-state';

export type ConnectFn = () => Promise<void>;

interface TokenGeneratorData {
  shouldConnect: boolean;
  wsUrl: string;
  token: string;
  pgState: PlaygroundState;
  voice: VoiceId;
  dict: (typeof langDict)['call'];
  disconnect: () => Promise<void>;
  connect: ConnectFn;
}

const ConnectionContext = createContext<TokenGeneratorData | undefined>(
  undefined,
);

export const ConnectionProvider = ({
  children,
  dict,
}: {
  children: React.ReactNode;
  dict: (typeof langDict)['call'];
}) => {
  const [connectionDetails, setConnectionDetails] = useState<{
    wsUrl: string;
    token: string;
    shouldConnect: boolean;
    voice: VoiceId;
  }>({ wsUrl: '', token: '', shouldConnect: false, voice: VoiceId.ARA });

  const queryClient = useQueryClient();
  const supabase = useSupabaseBrowser();
  const { pgState, helpers } = usePlaygroundState();

  const connect = async () => {
    const response = await fetch('/api/call-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(helpers.getStateWithFullInstructions(pgState)),
    });

    if (!response.ok) {
      if (response.status === 402) {
        toast.error(
          dict.notEnoughCredits.replace(
            '__COUNT__',
            MINIMUM_CREDITS_FOR_CALL.toString(),
          ),
        );
      }

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

  const disconnect = useCallback(async () => {
    setConnectionDetails((prev) => ({ ...prev, shouldConnect: false }));
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) {
      queryClient.refetchQueries({ queryKey: ['credits', data.user.id] });
      queryClient.invalidateQueries({ queryKey: ['credits', data.user.id] });
    }
  }, [queryClient, supabase.auth]);

  return (
    <ConnectionContext.Provider
      value={{
        wsUrl: connectionDetails.wsUrl,
        token: connectionDetails.token,
        shouldConnect: connectionDetails.shouldConnect,
        voice: connectionDetails.voice,
        pgState,
        dict,
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
