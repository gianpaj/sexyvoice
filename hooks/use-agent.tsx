import {
  useLocalParticipant,
  useMaybeRoomContext,
  useVoiceAssistant,
} from '@livekit/components-react';
import {
  type ByteStreamHandler,
  type Participant,
  type RemoteParticipant,
  RoomEvent,
  type RpcInvocationData,
  type TrackPublication,
  type TranscriptionSegment,
} from 'livekit-client';
import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useConnection } from '@/hooks/use-connection';

interface Transcription {
  segment: TranscriptionSegment;
  participant?: Participant;
  publication?: TrackPublication;
}

interface AgentContextType {
  displayTranscriptions: Transcription[];
  agent?: RemoteParticipant;
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const room = useMaybeRoomContext();
  const { shouldConnect } = useConnection();
  const { agent } = useVoiceAssistant();
  const { localParticipant } = useLocalParticipant();
  const [rawSegments, setRawSegments] = useState<{
    [id: string]: Transcription;
  }>({});
  const [displayTranscriptions, setDisplayTranscriptions] = useState<
    Transcription[]
  >([]);

  useEffect(() => {
    if (!room) {
      return;
    }
    const updateRawSegments = (
      segments: TranscriptionSegment[],
      participant?: Participant,
      publication?: TrackPublication,
    ) => {
      setRawSegments((prev) => {
        const newSegments = { ...prev };
        for (const segment of segments) {
          newSegments[segment.id] = { segment, participant, publication };
        }
        return newSegments;
      });
    };
    room.on(RoomEvent.TranscriptionReceived, updateRawSegments);

    return () => {
      room.off(RoomEvent.TranscriptionReceived, updateRawSegments);
    };
  }, [room]);

  useEffect(() => {
    if (!localParticipant) {
      return;
    }
    localParticipant.registerRpcMethod(
      'pg.toast',
      // biome-ignore lint/suspicious/useAwait: fine
      async (data: RpcInvocationData) => {
        const { title, description, variant } = JSON.parse(data.payload);
        console.log(title, description, variant);
        // TODO: display different toast variants
        toast.info(title);
        return JSON.stringify({ shown: true });
      },
    );
  }, [localParticipant]);

  useEffect(() => {
    const sorted = Object.values(rawSegments).sort(
      (a, b) =>
        (a.segment.firstReceivedTime ?? 0) - (b.segment.firstReceivedTime ?? 0),
    );
    const mergedSorted = sorted.reduce((acc, current) => {
      if (acc.length === 0) {
        return [current];
      }

      // biome-ignore lint/style/useAtIndex: fine
      const last = acc[acc.length - 1];
      if (
        last.participant === current.participant &&
        last.participant?.isAgent &&
        (current.segment.firstReceivedTime ?? 0) -
          (last.segment.lastReceivedTime ?? 0) <=
          1000 &&
        !last.segment.id.startsWith('status-') &&
        !current.segment.id.startsWith('status-')
      ) {
        // Merge segments from the same participant if they're within 1 second of each other
        return [
          ...acc.slice(0, -1),
          {
            ...current,
            segment: {
              ...current.segment,
              text: `${last.segment.text} ${current.segment.text}`,
              id: current.segment.id, // Use the id of the latest segment
              firstReceivedTime: last.segment.firstReceivedTime, // Keep the original start time
            },
          },
        ];
      }
      return [...acc, current];
    }, [] as Transcription[]);
    setDisplayTranscriptions(mergedSorted);
  }, [rawSegments]);

  useEffect(() => {
    if (shouldConnect) {
      setRawSegments({});
      setDisplayTranscriptions([]);
    }
  }, [shouldConnect]);

  return (
    <AgentContext.Provider
      value={{ displayTranscriptions, agent }}
    >
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (context === undefined) {
    throw new Error('useAgent must be used within an AgentProvider');
  }
  return context;
}
