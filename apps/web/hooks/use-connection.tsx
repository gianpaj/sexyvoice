'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { createContext, useContext, useState } from 'react';
import { toast } from 'sonner';

import type { PlaygroundState } from '@/data/playground-state';
import {
  buildSaveCharacterPayload,
  isInstructionsDirty,
  saveCharacter,
} from '@/lib/characters';
import useSupabaseBrowser from '@/lib/supabase/client';
import { MINIMUM_CREDITS_FOR_CALL } from '@/lib/supabase/constants';
import { usePlaygroundState } from './use-playground-state';

export type ConnectFn = (pendingVoiceName?: string | null) => Promise<void>;

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
  const { pgState, dispatch, helpers } = usePlaygroundState();

  /**
   * If the selected custom character has unsaved instruction or voice changes,
   * persist them before connecting so the call uses the latest version.
   * Throws if the save fails (aborting the connection attempt).
   */
  const saveCharacterIfDirty = async (pendingVoiceName?: string | null) => {
    const selectedPreset = helpers.getSelectedPreset(pgState);
    if (!selectedPreset || selectedPreset.isPublic) return;

    const currentInstructions = helpers.getFullInstructions(pgState);
    const instructionsDirty = isInstructionsDirty(
      selectedPreset,
      pgState.language,
      currentInstructions,
    );
    const voiceDirty = Boolean(
      pendingVoiceName && pendingVoiceName !== selectedPreset.voiceName,
    );

    if (!(instructionsDirty || voiceDirty)) return;

    const presetToSave =
      voiceDirty && pendingVoiceName
        ? {
            ...selectedPreset,
            sessionConfig: {
              ...selectedPreset.sessionConfig,
              voice: pendingVoiceName,
            },
            voiceName: pendingVoiceName,
          }
        : selectedPreset;

    const payload = buildSaveCharacterPayload(
      presetToSave,
      pgState.language,
      currentInstructions,
    );

    const result = await saveCharacter(payload);
    if (!result.ok) {
      toast.error(result.error);
      throw new Error(result.error);
    }

    dispatch({ payload: result.preset, type: 'SAVE_CUSTOM_CHARACTER' });
  };

  const connect: ConnectFn = async (pendingVoiceName) => {
    await saveCharacterIfDirty(pendingVoiceName);

    const resolvedState = helpers.getStateWithFullInstructions(pgState);
    const response = await fetch('/api/call-token', {
      body: JSON.stringify(resolvedState),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      if (response.status === 402) {
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
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) {
      queryClient.refetchQueries({ queryKey: ['credits', data.user.id] });
      queryClient.invalidateQueries({ queryKey: ['credits', data.user.id] });
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
