'use client';

import { useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { useEffect, useState } from 'react';

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
  const [dirty, setDirty] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState(instructions || '');

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = event.target.value;
    setInputValue(newValue);

    if (
      connectionState === ConnectionState.Connected &&
      newValue !== pgState.instructions
    ) {
      setDirty(true);
      if (onDirty) {
        onDirty();
      }
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
    setDirty(false);
    if (onBlur) {
      onBlur();
    }
  };

  useEffect(() => {
    if (instructions !== undefined && instructions !== inputValue) {
      setInputValue(instructions);
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructions]);

  return (
    <textarea
      className="w-full rounded bg-transparent font-mono text-xs leading-loose outline-none disabled:cursor-not-allowed disabled:opacity-50"
      disabled={isConnected}
      onBlur={handleBlur}
      onChange={handleInputChange}
      onFocus={onFocus}
      placeholder="Enter system instructions"
      rows={10}
      value={inputValue}
    />
  );
}
