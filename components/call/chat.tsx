'use client';

import {
  RoomAudioRenderer,
  useConnectionState,
  // useVoiceAssistant,
} from '@livekit/components-react';
import { AnimatePresence, motion } from 'framer-motion';
import { ConnectionState } from 'livekit-client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Instructions } from '@/components/call/instructions';
import { SessionControls } from '@/components/call/session-controls';
// import { GrokVisualizer } from "@/components/visualizer/grok-visualizer";
// import { GrokImageFeed } from '@/components/grok-image-feed';
import { useAgent } from '@/hooks/use-agent';
import { useConnection } from '@/hooks/use-connection';
import { ConnectButton } from './connect-button';

export function Chat() {
  const connectionState = useConnectionState();
  // const { audioTrack, state } = useVoiceAssistant();
  const [isChatRunning, setIsChatRunning] = useState(false);
  const { agent } = useAgent();
  const { disconnect } = useConnection();
  // const [isEditingInstructions, setIsEditingInstructions] = useState(false);
  const searchParams = useSearchParams();

  const showInstruction =
    searchParams.get('showInstruction') === '' ||
    searchParams.get('showInstruction') === 'true';

  const [hasSeenAgent, setHasSeenAgent] = useState(false);

  useEffect(() => {
    let disconnectTimer: NodeJS.Timeout | undefined;
    let appearanceTimer: NodeJS.Timeout | undefined;

    if (connectionState === ConnectionState.Connected && !agent) {
      appearanceTimer = setTimeout(() => {
        disconnect();
        setHasSeenAgent(false);

        toast.error('Agent Unavailable');
      }, 5000);
    }

    if (agent) {
      setHasSeenAgent(true);
    }

    if (
      connectionState === ConnectionState.Connected &&
      !agent &&
      hasSeenAgent
    ) {
      // Agent disappeared while connected, wait 5s before disconnecting
      disconnectTimer = setTimeout(() => {
        if (!agent) {
          disconnect();
          setHasSeenAgent(false);
        }

        toast.info(' Disconnected');
      }, 5000);
    }

    setIsChatRunning(
      connectionState === ConnectionState.Connected && hasSeenAgent,
    );

    return () => {
      if (disconnectTimer) clearTimeout(disconnectTimer);
      if (appearanceTimer) clearTimeout(appearanceTimer);
    };
  }, [connectionState, agent, disconnect, hasSeenAgent]);

  // const toggleInstructionsEdit = () =>
  //   setIsEditingInstructions(!isEditingInstructions);

  // const renderVisualizer = () => (
  //   <div className="flex w-full items-center">
  //     <div className="h-[280px] lg:h-[400px] mt-16 md:mt-0 lg:pb-24 w-full">
  //       <GrokVisualizer
  //         key={audioTrack?.publication?.trackSid || "no-track"}
  //         agentState={state}
  //         agentTrackRef={audioTrack}
  //       />
  //     </div>
  //   </div>
  // );

  const renderConnectionControl = () => (
    <AnimatePresence mode="wait">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 20 }}
        key={isChatRunning ? 'session-controls' : 'connect-button'}
        transition={{ type: 'tween', duration: 0.15, ease: 'easeInOut' }}
      >
        {isChatRunning ? <SessionControls /> : <ConnectButton />}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <div className="flex min-h-24 flex-col overflow-hidden p-0 lg:p-4">
      {/*<ChatControls
        isEditingInstructions={isEditingInstructions}
        onToggleEdit={toggleInstructionsEdit}
        showEditButton={isChatRunning}
      />*/}
      <div className="chat-container flex min-w-0 flex-col items-center">
        <div className="flex w-full flex-col gap-4">
          {/* Show instructions and visualizer stacked */}
          <div className="flex w-full flex-col gap-4">
            {showInstruction && (
              <div className="flex w-full items-center justify-center">
                <Instructions />
              </div>
            )}

            <div className="flex w-full flex-shrink-0 flex-col items-center justify-center gap-2">
              {renderConnectionControl()}
            </div>

            <RoomAudioRenderer />
          </div>

          {/*<GrokImageFeed />*/}
        </div>

        {/* Button for normal screens - show after visualizer */}
        {/*<div className="my-4 flex-shrink-0 [@media(max-height:800px)]:hidden">
          {renderConnectionControl()}
        </div>*/}
      </div>
    </div>
  );
}
