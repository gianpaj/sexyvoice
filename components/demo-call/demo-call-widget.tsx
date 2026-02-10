'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, PhoneCall } from 'lucide-react';
import { useCallback, useState } from 'react';

import { DemoCallPlayer } from '@/components/demo-call/demo-call-player';
import { DemoCharacterSelector } from '@/components/demo-call/demo-character-selector';
import { Button } from '@/components/ui/button';
import { demoCallData } from '@/data/demo-transcripts';

type CallState = 'idle' | 'connecting' | 'playing' | 'ended';

interface DemoCallWidgetProps {
  lang: string;
}

export function DemoCallWidget({ lang }: DemoCallWidgetProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');

  const handleCall = useCallback(() => {
    if (!selectedId) return;
    setCallState('connecting');
    setTimeout(() => {
      setCallState('playing');
    }, 1200);
  }, [selectedId]);

  const handleDisconnect = useCallback(() => {
    setCallState('ended');
  }, []);

  const handleTryAnother = useCallback(() => {
    setSelectedId(null);
    setCallState('idle');
  }, []);

  const callData = selectedId ? demoCallData[selectedId] : null;

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {callState === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-6"
          >
            <DemoCharacterSelector
              selectedId={selectedId}
              onSelect={setSelectedId}
              disabled={false}
            />
            <Button
              onClick={handleCall}
              disabled={!selectedId}
              size="lg"
              className="gap-2 bg-green-600 text-white hover:bg-green-700"
            >
              <PhoneCall className="h-5 w-5" />
              Call
            </Button>
          </motion.div>
        )}

        {callState === 'connecting' && (
          <motion.div
            key="connecting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center gap-4 py-8"
          >
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Connecting...</p>
          </motion.div>
        )}

        {callState === 'playing' && callData && (
          <motion.div
            key="playing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <DemoCallPlayer
              callData={callData}
              onDisconnect={handleDisconnect}
            />
          </motion.div>
        )}

        {callState === 'ended' && (
          <motion.div
            key="ended"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-4 py-6"
          >
            <p className="font-medium text-foreground">Call ended</p>
            <button
              type="button"
              onClick={handleTryAnother}
              className="text-muted-foreground text-sm underline transition-colors hover:text-foreground"
            >
              Try another character
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
