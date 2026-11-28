import type { ServerEvent } from './protocol';

interface AudioSocket {
  readyState: number;
  send: (data: string, callback: (error?: Error) => void) => void;
}

export function createAudioSender(socket: AudioSocket, onStall: () => void) {
  return (
    event: Extract<ServerEvent, { type: 'audio' }>,
    signal: AbortSignal,
  ) =>
    new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      if (socket.readyState !== 1) {
        reject(new Error('Socket closed'));
        return;
      }
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve();
      };
      const abort = () => finish(signal.reason);
      const timer = setTimeout(() => {
        finish(new Error('Audio delivery stalled'));
        onStall();
      }, 5000);
      signal.addEventListener('abort', abort, { once: true });
      try {
        // Await the write callback before pulling more provider audio. A send
        // completes at the transport boundary, not at browser playback.
        socket.send(JSON.stringify(event), finish);
      } catch (error) {
        finish(error);
      }
    });
}
