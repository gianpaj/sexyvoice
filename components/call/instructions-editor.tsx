'use client';

import { useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { useEffect, useState } from 'react';

import { useConnection } from '@/hooks/use-connection';
import { usePlaygroundState } from '@/hooks/use-playground-state';

export interface InstructionsEditorProps {
  instructions?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onDirty?: () => void;
}

export function InstructionsEditor({
  instructions,
  onFocus,
  onBlur,
  onDirty,
}: InstructionsEditorProps) {
  const connectionState = useConnectionState();
  const isConnected = connectionState === ConnectionState.Connected;
  const { pgState, dispatch } = usePlaygroundState();
  const { dict } = useConnection();
  const [inputValue, setInputValue] = useState(instructions || '');

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = event.target.value;
    setInputValue(newValue);

    if (
      connectionState === ConnectionState.Connected &&
      newValue !== pgState.instructions &&
      onDirty
    ) {
      onDirty();
    }
  };

  const handleBlur = () => {
    // Store character override if a character is selected
    if (pgState.selectedPresetId) {
      dispatch({
        type: 'SET_CHARACTER_OVERRIDE',
        payload: {
          characterId: pgState.selectedPresetId,
          instructions: inputValue,
        },
      });
    } else {
      dispatch({ type: 'SET_INSTRUCTIONS', payload: inputValue });
    }
    if (onBlur) {
      onBlur();
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
      onBlur={handleBlur}
      onChange={handleInputChange}
      onFocus={onFocus}
      placeholder={dict.instructionsPlaceholder}
      rows={10}
      value={inputValue}
    />
  );
}
