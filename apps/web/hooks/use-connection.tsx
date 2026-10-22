'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { createContext, useContext, useState } from 'react';
import { toast } from 'sonner';

import type { PlaygroundState } from '@/data/playground-state';
import { invalidateCredits } from '@/lib/credits-query';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import useSupabaseBrowser from '@/lib/supabase/client';
import { MINIMUM_CREDITS_FOR_CALL } from '@/lib/supabase/constants';
import { usePlaygroundState } from './use-playground-state';

export type ConnectFn = () => Promise<void>;

interface TokenGeneratorData {
  connect: ConnectFn;
  disconnect: () => Promise<void>;
  pgState: PlaygroundState;
  shouldConnect: boolean;
  token: string;
  voice: string;
  wsUrl: string;
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
    voice: string;
  }>({ shouldConnect: false, token: '', voice: 'Ara', wsUrl: '' });

  const t = useTranslations('call');
  const queryClient = useQueryClient();
  const supabase = useSupabaseBrowser();
  const { pgState, helpers } = usePlaygroundState();

  const connect: ConnectFn = async () => {
    const resolvedState = helpers.getStateWithFullInstructions(pgState);
    const response = await fetch('/api/call-token', {
      body: JSON.stringify(resolvedState),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      if (response.status === 402) {
        invalidateCredits(queryClient).catch(() => undefined);
        toast.error(t('notEnoughCredits', { count: MINIMUM_CREDITS_FOR_CALL }));
      } else if (response.status === 403) {
        toast.error(t('freeUserCallLimitExceeded'));
      }
      throw new Error('Failed to fetch token');
    }

    const { accessToken, url } = await response.json();

    setConnectionDetails({
      shouldConnect: true,
      token: accessToken,
      voice: resolvedState.sessionConfig.voice,
      wsUrl: url,
    });
  };

  const disconnect = async () => {
    setConnectionDetails((prev) => ({ ...prev, shouldConnect: false }));
    const claims = await getVerifiedClaims(supabase);
    if (claims?.sub) {
      invalidateCredits(queryClient, claims.sub).catch(() => undefined);
    }
  };

  return (
    <ConnectionContext.Provider
      value={{
        connect,
        disconnect,
        pgState,
        shouldConnect: connectionDetails.shouldConnect,
        token: connectionDetails.token,
        voice: connectionDetails.voice,
        wsUrl: connectionDetails.wsUrl,
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
