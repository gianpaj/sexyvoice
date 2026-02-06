'use client';

import {
  BarVisualizer,
  RoomAudioRenderer,
  useConnectionState,
  useVoiceAssistant,
  // useVoiceAssistant,
} from '@livekit/components-react';
import * as Sentry from '@sentry/nextjs';
import { AnimatePresence, motion } from 'framer-motion';
import { ConnectionState } from 'livekit-client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Instructions } from '@/components/call/instructions';
import { SessionControls } from '@/components/call/session-controls';
import { Transcript } from '@/components/call/transcript';
// import { GrokVisualizer } from "@/components/visualizer/grok-visualizer";
// import { GrokImageFeed } from '@/components/grok-image-feed';
import { useAgent } from '@/hooks/use-agent';
import { useConnection } from '@/hooks/use-connection';
import { ConnectButton } from './connect-button';

export function Chat() {
  const connectionState = useConnectionState();
  const { audioTrack, state } = useVoiceAssistant();
  // const { audioTrack, state } = useVoiceAssistant();
  const [isChatRunning, setIsChatRunning] = useState(false);
  const { agent } = useAgent();
  const { disconnect, dict } = useConnection();
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

        Sentry.captureMessage('Agent Unavailable');

        console.error('Agent Unavailable');

        toast.error(dict.agentUnavailable);
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
          toast.info(dict.disconnected);
          Sentry.captureMessage('Disconnected');
        }
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

  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const scrollButtonRef = useRef<HTMLButtonElement>(null);


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

  const renderVisualizer = () => (
    <div className="flex w-full items-center">
      <div className="h-[320px] mt-16 md:mt-0 lg:pb-24 w-full">
        <BarVisualizer
          state={state}
          barCount={5}
          track={audioTrack}
          className="w-full h-full [--lk-va-bar-width:42px]"
        />
      </div>
    </div>
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

            <div className="grow h-full flex items-center justify-center">
              <div className="w-full ">
                {isChatRunning && renderVisualizer()}
              </div>
            </div>

            <div className="flex w-full flex-shrink-0 flex-col items-center justify-center gap-2">
              {renderConnectionControl()}
            </div>
            <div
              className="flex-grow overflow-y-auto"
              ref={transcriptContainerRef}
            >
              <Transcript
                scrollContainerRef={transcriptContainerRef}
                scrollButtonRef={scrollButtonRef}
              />
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
