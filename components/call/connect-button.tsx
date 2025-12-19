'use client';

import { Loader2, PhoneCall } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useConnection } from '@/hooks/use-connection';
// import { AuthDialog } from "./auth";

export function ConnectButton() {
  const { connect, disconnect, shouldConnect } = useConnection();
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
    <>
      <div className="flex items-center gap-2">
        <Button
          className="gradient-bg h-9 p-2 font-semibold text-sm"
          disabled={connecting || shouldConnect}
          onClick={handleConnectionToggle}
        >
          {connecting || shouldConnect ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting
            </>
          ) : (
            <>
              <PhoneCall className="mr-2 h-4 w-4" />
              Start a call
            </>
          )}
        </Button>
      </div>
      {/*<AuthDialog
        open={showAuthDialog}
        onOpenChange={setShowAuthDialog}
        onAuthComplete={handleAuthComplete}
      />*/}
    </>
  );
}
