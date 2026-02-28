'use client';

import { useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { useEffect, useState } from 'react';

import { useConnection } from '@/hooks/use-connection';
import { usePlaygroundState } from '@/hooks/use-playground-state';

export interface InstructionsEditorProps {
  instructions?: string;
}

export function InstructionsEditor({ instructions }: InstructionsEditorProps) {
  const connectionState = useConnectionState();
  const isConnected = connectionState === ConnectionState.Connected;
  const { playgroundState, dispatch } = usePlaygroundState();
  const { dict } = useConnection();
  const [inputValue, setInputValue] = useState(instructions || '');

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = event.target.value;
    setInputValue(newValue);

    // Dispatch immediately so the connect button reacts without waiting for blur
    if (playgroundState.selectedPresetId) {
      dispatch({
        type: 'SET_CHARACTER_OVERRIDE',
        payload: {
          characterId: playgroundState.selectedPresetId,
          instructions: newValue,
        },
      });
    } else {
      dispatch({ type: 'SET_INSTRUCTIONS', payload: newValue });
    }
  };

  useEffect(() => {
    if (instructions !== undefined) {
      setInputValue(instructions);
    }
  }, [instructions]);

  return (
    <textarea
      className="w-full rounded bg-transparent font-mono text-xs leading-loose outline-none disabled:cursor-not-allowed disabled:opacity-50"
      disabled={isConnected}
      onChange={handleInputChange}
      placeholder={dict.instructionsPlaceholder}
      rows={10}
      value={inputValue}
    />
  );
}
