'use client';

import { Loader2, PhoneCall } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useConnection } from '@/hooks/use-connection';
import { usePlaygroundState } from '@/hooks/use-playground-state';

export function ConnectButton() {
  const { connect, disconnect, shouldConnect, dict } = useConnection();
  const { pgState, helpers } = usePlaygroundState();
  const [connecting, setConnecting] = useState<boolean>(false);
  const [initiateConnectionFlag, setInitiateConnectionFlag] = useState(false);

  // Check if selected character is custom and has empty instructions
  const selectedPreset = helpers.getSelectedPreset(pgState);
  const isCustomCharacter = selectedPreset && !selectedPreset.isPublic;
  const fullInstructions = helpers.getFullInstructions(pgState);
  const hasEmptyInstructions = isCustomCharacter && !fullInstructions.trim();

  const handleConnectionToggle = async () => {
    if (shouldConnect) {
      await disconnect();
    } else {
      await initiateConnection();
    }
  };

  const initiateConnection = useCallback(async () => {
    setConnecting(true);
    try {
      // Verify microphone access before spending a token request
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        // Release the tracks immediately — LiveKit will acquire them on connect
        for (const track of stream.getTracks()) {
          track.stop();
        }
      } catch (err) {
        if (
          err instanceof DOMException &&
          (err.name === 'NotAllowedError' ||
            err.name === 'PermissionDeniedError')
        ) {
          toast.error(dict.microphonePermissionDenied);
          return;
        }
        // For other errors (e.g. NotFoundError — no mic device), log and
        // continue so LiveKit can surface a more specific error itself.
        console.warn('Microphone pre-check warning:', err);
      }
      await connect();
    } catch (error) {
      console.error('Connection failed:', error);
    } finally {
      setConnecting(false);
    }
  }, [connect, dict]);

  useEffect(() => {
    if (initiateConnectionFlag) {
      initiateConnection();
      setInitiateConnectionFlag(false);
    }
  }, [initiateConnectionFlag, initiateConnection]);

  return (
    <div className="flex items-center gap-2">
      <Button
        className="gradient-bg"
        disabled={
          connecting ||
          shouldConnect ||
          !pgState.selectedPresetId ||
          hasEmptyInstructions
        }
        icon={() =>
          connecting || shouldConnect ? (
            <Loader2 className="animate-spin" />
          ) : (
            <PhoneCall />
          )
        }
        iconPlacement="left"
        onClick={handleConnectionToggle}
        size="lg"
      >
        {connecting || shouldConnect ? dict.connecting : dict.startCall}
      </Button>
    </div>
  );
}
