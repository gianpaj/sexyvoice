'use client';

import {
  RoomAudioRenderer,
  useConnectionState,
  // useVoiceAssistant,
} from '@livekit/components-react';
import { AnimatePresence, motion } from 'framer-motion';
import { ConnectionState } from 'livekit-client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ChatControls } from '@/components/call/chat-controls';
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
  const [isEditingInstructions, setIsEditingInstructions] = useState(false);

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

  const toggleInstructionsEdit = () =>
    setIsEditingInstructions(!isEditingInstructions);

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
    <div className="flex h-full min-w-0 flex-col overflow-hidden p-2 lg:p-4">
      <ChatControls
        isEditingInstructions={isEditingInstructions}
        onToggleEdit={toggleInstructionsEdit}
        showEditButton={isChatRunning}
      />
      <div className="chat-container mt-12 flex min-w-0 flex-grow flex-col items-center lg:mt-0">
        <div className="flex w-full min-w-0 flex-grow flex-col gap-4">
          {/* Mobile: Show instructions and visualizer stacked */}
          <div className="flex w-full min-w-0 flex-col gap-4 lg:hidden">
            <Instructions />

            {/* Button for short screens on mobile - show after instructions */}
            <div className="hidden w-full flex-shrink-0 items-center justify-center [@media(max-height:800px)]:flex">
              {renderConnectionControl()}
            </div>

            {/*{renderVisualizer()}*/}
            <RoomAudioRenderer />
          </div>

          {/* Desktop: Show instructions at top, visualizer in middle */}
          <div className="chat-desktop-layout hidden w-full lg:flex lg:flex-grow lg:flex-col">
            <div className="chat-instructions-wrapper flex w-full min-w-0 items-center justify-center">
              <Instructions />
            </div>

            {/* Button for short screens - show after instructions */}
            <div className="my-2 hidden w-full flex-shrink-0 items-center justify-center [@media(max-height:800px)]:flex">
              {renderConnectionControl()}
            </div>

            <RoomAudioRenderer />
            {/*<div className="chat-visualizer-wrapper flex min-w-0 flex-grow items-center justify-center">
              <div className="w-full min-w-0">*/}
            {/*{!isEditingInstructions && renderVisualizer()}*/}
            {/*</div>
            </div>*/}
          </div>

          {/*<GrokImageFeed />*/}
        </div>

        {/* Button for normal screens - show after visualizer */}
        <div className="my-4 flex-shrink-0 [@media(max-height:800px)]:hidden">
          {renderConnectionControl()}
        </div>
      </div>
    </div>
  );
}
