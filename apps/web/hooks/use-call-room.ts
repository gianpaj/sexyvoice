'use client';

import { captureException } from '@sentry/nextjs';
import { Room } from 'livekit-client';
import { useEffect, useState } from 'react';

import type { CallE2ee } from '@/lib/livekit/e2ee/client';
import { createCallE2ee, enableCallE2ee } from '@/lib/livekit/e2ee/client';

interface CallRoomState {
  e2ee: CallE2ee | null;
  room: Room;
}

export interface UseCallRoomResult {
  /**
   * Whether it is safe to connect. `false` while the shared encryption key is
   * still being applied, and while an encryption failure is unresolved — the
   * agent cannot decrypt plaintext media, so a call must not start unencrypted
   * once the server has handed out a key.
   */
  canConnect: boolean;
  /** Set when the shared key could not be applied to the room. */
  e2eeError: Error | null;
  /** `null` until the room has been created in the browser. */
  room: Room | null;
}

/**
 * Owns the LiveKit `Room` for the call dashboard so end-to-end encryption can be
 * turned on before the first connection attempt.
 *
 * `LiveKitRoom` would otherwise create the room itself, which leaves no window
 * to call `setE2EEEnabled()` before the microphone track is published.
 *
 * @param e2eeKey shared passphrase from `/api/call-token`, or `null` when
 * end-to-end encryption is disabled for this deployment.
 */
export function useCallRoom(
  e2eeKey: string | null,
  shouldConnect: boolean,
): UseCallRoomResult {
  const [state, setState] = useState<CallRoomState | null>(null);
  const [isE2eeReady, setIsE2eeReady] = useState(false);
  const [e2eeError, setE2eeError] = useState<Error | null>(null);

  // Created in an effect (not during render) because `Room` touches browser-only
  // globals and this component is server-rendered.
  useEffect(() => {
    const e2ee = createCallE2ee();
    const room = new Room({
      publishDefaults: {
        stopMicTrackOnMute: true,
      },
      ...(e2ee ? { e2ee: e2ee.options } : {}),
    });

    setState({ room, e2ee });

    return () => {
      room.disconnect().catch(captureException);
      e2ee?.terminate();
    };
  }, []);

  // Applying the key is deferred until the user actually starts a call, and is
  // retried on every attempt so a transient failure does not permanently wedge
  // the call UI.
  useEffect(() => {
    if (!(state && e2eeKey && shouldConnect) || isE2eeReady) {
      return;
    }

    let cancelled = false;

    enableCallE2ee(state.room, state.e2ee, e2eeKey)
      .then(() => {
        if (cancelled) {
          return;
        }
        setE2eeError(null);
        setIsE2eeReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        // `instanceof` rather than `Error.isError`: this runs in the browser,
        // where `Error.isError` is not available on every supported engine.
        const resolved =
          error instanceof Error ? error : new Error(String(error));
        captureException(resolved);
        setIsE2eeReady(false);
        setE2eeError(resolved);
      });

    return () => {
      cancelled = true;
    };
  }, [state, e2eeKey, shouldConnect, isE2eeReady]);

  return {
    room: state?.room ?? null,
    canConnect: shouldConnect && (!e2eeKey || isE2eeReady),
    e2eeError,
  };
}
