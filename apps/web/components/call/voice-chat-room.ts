import { Room } from 'livekit-client';

export const audioCaptureDefaults = {
  echoCancellation: true,
  noiseSuppression: true,
};

export function createVoiceChatRoom() {
  return new Room({
    audioCaptureDefaults,
    publishDefaults: { stopMicTrackOnMute: true },
  });
}

interface PreparedCall {
  audioReady: Promise<void>;
  room: Room;
}

let pending:
  | {
      call: PreparedCall;
      conversationId: string;
      discard: () => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  | undefined;

export function prepareCallFromCard() {
  const room = createVoiceChatRoom();
  // iOS needs the original tap to unlock audio, before we create the thread.
  const audioReady = room.startAudio();
  audioReady.catch(() => undefined);
  const discard = () => {
    room.disconnect().catch(() => undefined);
  };
  return {
    discard,
    handOff(conversationId: string) {
      if (pending) {
        clearTimeout(pending.timeout);
        pending.discard();
      }
      pending = {
        call: { audioReady, room },
        conversationId,
        discard,
        timeout: setTimeout(() => {
          pending = undefined;
          discard();
        }, 30_000),
      };
    },
  };
}

export function takeCallFromCard(conversationId: string) {
  if (pending?.conversationId !== conversationId) return;
  const { call, timeout } = pending;
  pending = undefined;
  clearTimeout(timeout);
  return call;
}
