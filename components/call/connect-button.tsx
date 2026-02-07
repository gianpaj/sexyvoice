'use client';

import { Loader2, PhoneCall } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useConnection } from '@/hooks/use-connection';
import { usePlaygroundState } from '@/hooks/use-playground-state';

export function ConnectButton() {
  const { connect, disconnect, shouldConnect, dict } = useConnection();
  const { pgState } = usePlaygroundState();
  const [connecting, setConnecting] = useState<boolean>(false);
  const [initiateConnectionFlag, setInitiateConnectionFlag] = useState(false);

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
      await connect();
    } catch (error) {
      console.error('Connection failed:', error);
    } finally {
      setConnecting(false);
    }
  }, [connect]);

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
        disabled={connecting || shouldConnect || !pgState.selectedPresetId}
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
