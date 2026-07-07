'use client';

import {
  RoomAudioRenderer,
  useConnectionState,
  // useVoiceAssistant,
} from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

// import { GrokVisualizer } from "@/components/visualizer/grok-visualizer";
import { useAgent } from '@/hooks/use-agent';
import { useConnection } from '@/hooks/use-connection';
import { ConnectButton } from './connect-button';

const SessionControls = dynamic(
  () =>
    import('@/components/call/session-controls').then(
      (mod) => mod.SessionControls,
    ),
  {
    loading: () => <div className="h-[72px]" />,
    ssr: false,
  },
);

export function Chat() {
  const connectionState = useConnectionState();
  // const { audioTrack, state } = useVoiceAssistant();
  const [isChatRunning, setIsChatRunning] = useState(false);
  const { agent } = useAgent();
  const { disconnect } = useConnection();
  const t = useTranslations('call');
  // const [isEditingInstructions, setIsEditingInstructions] = useState(false);

  const [hasSeenAgent, setHasSeenAgent] = useState(false);

  useEffect(() => {
    let disconnectTimer: NodeJS.Timeout | undefined;
    let appearanceTimer: NodeJS.Timeout | undefined;

    if (connectionState === ConnectionState.Connected && !agent) {
      appearanceTimer = setTimeout(() => {
        disconnect();
        setHasSeenAgent(false);

        console.error('Agent Unavailable');

        toast.error(t('agentUnavailable'));
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
          toast.info(t('disconnected'));
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
  }, [connectionState, agent, disconnect, hasSeenAgent, t]);

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
    <div
      className="fade-in-0 slide-in-from-bottom-2 animate-in duration-150"
      key={isChatRunning ? 'session-controls' : 'connect-button'}
    >
      {isChatRunning ? <SessionControls /> : <ConnectButton />}
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
          {/* Show visualizer stacked */}
          <div className="flex w-full flex-col gap-4">
            <div className="flex w-full shrink-0 flex-col items-center justify-center gap-2">
              {renderConnectionControl()}
            </div>

            <RoomAudioRenderer />
          </div>
        </div>

        {/* Button for normal screens - show after visualizer */}
        {/*<div className="my-4 shrink-0 [@media(max-height:800px)]:hidden">
          {renderConnectionControl()}
        </div>*/}
      </div>
    </div>
  );
}
