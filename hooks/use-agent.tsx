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

interface GeneratedImage {
  prompt: string;
  imageUrl: string;
  timestamp: number;
}

interface AgentContextType {
  displayTranscriptions: Transcription[];
  agent?: RemoteParticipant;
  generatedImages: GeneratedImage[];
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const room = useMaybeRoomContext();
  const { shouldConnect, dict, disconnect } = useConnection();
  const { agent } = useVoiceAssistant();
  const { localParticipant } = useLocalParticipant();
  const [rawSegments, setRawSegments] = useState<{
    [id: string]: Transcription;
  }>({});
  const [displayTranscriptions, setDisplayTranscriptions] = useState<
    Transcription[]
  >([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);

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

        const message = description ? `${title}: ${description}` : title;

        switch (variant) {
          case 'error':
            toast.error(message);
            break;
          case 'warning':
            toast.warning(message);
            break;
          case 'success':
            toast.success(message);
            break;
          default:
            toast.info(message);
        }

        return JSON.stringify({ shown: true });
      },
    );

    // Handle agent errors (e.g., active call, insufficient credits)
    localParticipant.registerRpcMethod(
      'pg.error',
      // biome-ignore lint/suspicious/useAwait: fine
      async (data: RpcInvocationData) => {
        const errorData = JSON.parse(data.payload);
        console.error('Agent error received:', errorData);

        if (errorData.error === 'active_call') {
          toast.error(dict.activeCallError);
        } else if (errorData.error === 'insufficient_credits') {
          toast.error(dict.notEnoughCredits.replace('__COUNT__', '2000'));
        } else {
          toast.error(errorData.message || 'An error occurred');
        }

        disconnect();
        return JSON.stringify({ handled: true });
      },
    );
  }, [localParticipant, dict, disconnect]);

  // Register byte stream handler for images
  useEffect(() => {
    if (!(room && shouldConnect)) return;

    const handleByteStream: ByteStreamHandler = async (
      reader,
      _participantInfo,
    ) => {
      try {
        console.debug('Byte stream received:', reader.info);

        // Get the prompt from attributes
        const prompt = reader.info.attributes?.prompt || 'Generated image';
        const timestamp = reader.info.timestamp || Date.now();

        // Read all chunks from the stream
        const chunks = await reader.readAll();

        // Create a blob from the chunks
        const blob = new Blob(chunks as BlobPart[], {
          type: reader.info.mimeType || 'image/jpeg',
        });
        const imageUrl = URL.createObjectURL(blob);

        // Add to generated images
        setGeneratedImages((prev) => [
          ...prev,
          {
            prompt,
            imageUrl,
            timestamp,
          },
        ]);

        console.debug('Image received and processed:', prompt);
      } catch (error) {
        console.error('Failed to process byte stream:', error);
      }
    };

    room.registerByteStreamHandler('grok_image', handleByteStream);

    return () => {
      room.unregisterByteStreamHandler('grok_image');
    };
  }, [room, shouldConnect]);

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
      setGeneratedImages([]);
    }
  }, [shouldConnect]);

  return (
    <AgentContext.Provider
      value={{ displayTranscriptions, agent, generatedImages }}
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
