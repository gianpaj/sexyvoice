'use client';

import { useEffect, useState } from 'react';

/** `unknown` means the browser will ask when the call starts. */
export type MicrophoneStatus = 'unknown' | 'ready' | 'blocked';

const toStatus = (state: PermissionState): MicrophoneStatus => {
  if (state === 'granted') return 'ready';
  if (state === 'denied') return 'blocked';
  return 'unknown';
};

const isPermissionError = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');

export function useMicrophonePermission() {
  const [status, setStatus] = useState<MicrophoneStatus>('unknown');

  useEffect(() => {
    let permission: PermissionStatus | undefined;
    let cancelled = false;
    // Firefox and older Safari reject the `microphone` name; status then
    // stays `unknown` until `request()` runs.
    navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((result) => {
        if (cancelled) return;
        permission = result;
        setStatus(toStatus(result.state));
        result.onchange = () => setStatus(toStatus(result.state));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (permission) permission.onchange = null;
    };
  }, []);

  /**
   * Asks for the microphone and releases it at once; LiveKit acquires it on
   * connect. Resolves false only when the user or browser blocked access, so
   * other failures (such as no input device) reach LiveKit's own errors.
   */
  const request = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      for (const track of stream.getTracks()) track.stop();
      setStatus('ready');
      return true;
    } catch (error) {
      if (isPermissionError(error)) {
        setStatus('blocked');
        return false;
      }
      console.warn('Microphone pre-check warning:', error);
      return true;
    }
  };

  return { request, status };
}
