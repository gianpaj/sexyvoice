'use client';

import { useQueryClient } from '@tanstack/react-query';
import type React from 'react';
import { createContext, useCallback, useContext, useState } from 'react';
import { toast } from 'sonner';

import type { PlaygroundState } from '@/data/playground-state';
import {
  buildSaveCharacterPayload,
  isInstructionsDirty,
  saveCharacter,
} from '@/lib/characters';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import useSupabaseBrowser from '@/lib/supabase/client';
import { MIN_CREDITS_TO_START_CALL } from '@/lib/supabase/constants';
import { usePlaygroundState } from './use-playground-state';

export type ConnectFn = (pendingVoiceName?: string | null) => Promise<void>;

interface TokenGeneratorData {
  shouldConnect: boolean;
  wsUrl: string;
  token: string;
  playgroundState: PlaygroundState;
  voice: string;
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
    voice: string;
  }>({ wsUrl: '', token: '', shouldConnect: false, voice: 'Ara' });

  const queryClient = useQueryClient();
  const supabase = useSupabaseBrowser();
  const { playgroundState, dispatch, helpers } = usePlaygroundState();

  /**
   * If the selected custom character has unsaved instruction or voice changes,
   * persist them before connecting so the call uses the latest version.
   * Throws if the save fails (aborting the connection attempt).
   */
  const saveCharacterIfDirty = async (pendingVoiceName?: string | null) => {
    const selectedPreset = helpers.getSelectedPreset(playgroundState);
    if (!selectedPreset || selectedPreset.isPublic) return;

    const currentInstructions = helpers.resolveActiveInstructions(playgroundState);
    const instructionsDirty = isInstructionsDirty(
      selectedPreset,
      playgroundState.language,
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
            voiceName: pendingVoiceName,
            sessionConfig: {
              ...selectedPreset.sessionConfig,
              voice: pendingVoiceName,
            },
          }
        : selectedPreset;

    const payload = buildSaveCharacterPayload(
      presetToSave,
      playgroundState.language,
      currentInstructions,
    );

    const result = await saveCharacter(payload);
    if (!result.ok) {
      toast.error(result.error);
      throw new Error(result.error);
    }

    dispatch({ type: 'SAVE_CUSTOM_CHARACTER', payload: result.preset });
  };

  const connect: ConnectFn = async (pendingVoiceName) => {
    await saveCharacterIfDirty(pendingVoiceName);

    const resolvedState = helpers.buildStateWithResolvedInstructions(playgroundState);
    const response = await fetch('/api/call-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resolvedState),
    });

    if (!response.ok) {
      if (response.status === 402) {
        toast.error(
          dict.notEnoughCredits.replace(
            '__COUNT__',
            MIN_CREDITS_TO_START_CALL.toString(),
          ),
        );
      } else if (response.status === 403) {
        toast.error(dict.freeUserCallLimitExceeded);
      }
      throw new Error('Failed to fetch token');
    }

    const { accessToken, url } = await response.json();

    setConnectionDetails({
      wsUrl: url,
      token: accessToken,
      shouldConnect: true,
      voice: resolvedState.sessionConfig.voice,
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
        playgroundState,
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
