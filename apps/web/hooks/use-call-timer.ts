'use client';

import { useVoiceAssistant } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { useEffect, useState } from 'react';

interface UseCallTimerResult {
  /** Seconds since the agent was first ready in this connection */
  elapsedSeconds: number;
  /** Formatted time string in MM:SS or HH:MM:SS format */
  formattedTime: string;
  /** Whether the timer is currently running */
  isRunning: boolean;
}

/** The agent reports these once its voice pipeline is running. */
const READY_AGENT_STATES = new Set<string>([
  'listening',
  'thinking',
  'speaking',
]);

/**
 * Tracks the call duration the way SexyCall bills it.
 *
 * The agent starts billing when it starts its voice pipeline, which is when it
 * first reports `listening`, `thinking` or `speaking`. The timer starts then,
 * not when the room connects, and runs until the room disconnects, so an agent
 * restarting its pipeline mid-call does not reset it.
 *
 * Must be used inside a LiveKit room.
 */
export function useCallTimer(
  connectionState: ConnectionState,
): UseCallTimerResult {
  const { state: agentState } = useVoiceAssistant();
  const connected = connectionState === ConnectionState.Connected;
  const agentReady = READY_AGENT_STATES.has(agentState);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!connected) {
      setStartedAt(null);
      setElapsedSeconds(0);
    } else if (agentReady) {
      setStartedAt((started) => started ?? Date.now());
    }
  }, [connected, agentReady]);

  useEffect(() => {
    if (startedAt === null) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return {
    elapsedSeconds,
    formattedTime: formatTime(elapsedSeconds),
    isRunning: startedAt !== null,
  };
}

function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (num: number): string => num.toString().padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}
