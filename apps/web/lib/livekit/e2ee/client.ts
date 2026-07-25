'use client';

import type { E2EEOptions, Room } from 'livekit-client';
import { ExternalE2EEKeyProvider, isE2EESupported } from 'livekit-client';

/**
 * Browser-side wiring for LiveKit end-to-end encryption on voice calls.
 *
 * We use a single shared passphrase with no rotation. `ExternalE2EEKeyProvider`
 * is the SDK's shared-key provider: it forces `sharedKey: true`, disables
 * ratcheting (`ratchetWindowSize: 0`) and keeps the default 128-bit key size,
 * which is the only size non-web SDKs support. Passing the passphrase as a
 * string derives the key with PBKDF2, the derivation the Python/Rust agent SDK
 * used by `sexycall` also implements.
 *
 * The key is attached to `RoomOptions.e2ee`, which encrypts published media
 * only. `RoomOptions.encryption` additionally encrypts data channel packets,
 * which would break RPC (`configuration-form.tsx`) and agent transcriptions
 * unless the agent negotiates the same feature — so it is deliberately not used.
 */

/** Thrown when the browser cannot run LiveKit's encryption transforms. */
export class CallE2eeUnsupportedError extends Error {
  constructor() {
    super('This browser does not support end-to-end encrypted calls');
    this.name = 'CallE2eeUnsupportedError';
  }
}

export interface CallE2ee {
  /** Holds the derived shared key handed to the encryption worker. */
  keyProvider: ExternalE2EEKeyProvider;
  /** Passed to the `Room` constructor as `RoomOptions.e2ee`. */
  options: E2EEOptions;
  /** Shuts the encryption worker down when the call UI unmounts. */
  terminate: () => void;
}

/**
 * Creates the key provider and encryption worker for a call room, or `null`
 * when the current environment cannot support encrypted media (server render,
 * or a browser without insertable streams / `RTCRtpScriptTransform`).
 */
export function createCallE2ee(): CallE2ee | null {
  if (typeof window === 'undefined' || !isE2EESupported()) {
    return null;
  }

  const keyProvider = new ExternalE2EEKeyProvider();
  const worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  });

  return {
    keyProvider,
    options: { keyProvider, worker },
    terminate: () => worker.terminate(),
  };
}

/**
 * Loads the shared passphrase and turns encryption on for the room. Must be
 * awaited before connecting so the microphone track is published encrypted.
 *
 * @throws {CallE2eeUnsupportedError} when the room was created without
 * encryption support, in which case the call must not connect: the agent would
 * receive plaintext frames it cannot decrypt.
 */
export async function enableCallE2ee(
  room: Room,
  e2ee: CallE2ee | null,
  key: string,
): Promise<void> {
  if (!e2ee) {
    throw new CallE2eeUnsupportedError();
  }

  await e2ee.keyProvider.setKey(key);
  await room.setE2EEEnabled(true);
}
