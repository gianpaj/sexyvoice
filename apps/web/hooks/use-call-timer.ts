'use client';

import { ConnectionState } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';

interface UseCallTimerResult {
  /** Elapsed time in seconds since the call was connected */
  elapsedSeconds: number;
  /** Formatted time string in MM:SS or HH:MM:SS format */
  formattedTime: string;
  /** Whether the timer is currently running */
  isRunning: boolean;
  /** Reset the timer to zero */
  reset: () => void;
}

/**
 * Hook to track the duration of a call since connection was established.
 *
 * @param connectionState - The current LiveKit connection state
 * @returns Object containing elapsed time, formatted time string, and timer state
 */
export function useCallTimer(
  connectionState: ConnectionState,
): UseCallTimerResult {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const isConnected = connectionState === ConnectionState.Connected;

  useEffect(() => {
    if (isConnected) {
      // Start the timer when connected
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }

      intervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Math.floor(
            (Date.now() - startTimeRef.current) / 1000,
          );
          setElapsedSeconds(elapsed);
        }
      }, 1000);
    } else {
      // Stop the timer when disconnected
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Reset when disconnected
      startTimeRef.current = null;
      setElapsedSeconds(0);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isConnected]);

  const reset = () => {
    startTimeRef.current = isConnected ? Date.now() : null;
    setElapsedSeconds(0);
  };

  const formatTime = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num: number): string => num.toString().padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }

    return `${pad(minutes)}:${pad(seconds)}`;
  };

  return {
    elapsedSeconds,
    formattedTime: formatTime(elapsedSeconds),
    isRunning: isConnected,
    reset,
  };
}
