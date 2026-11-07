'use client';

import type { AgentState } from '@livekit/components-react';
import { useQueryClient } from '@tanstack/react-query';
import { MediaDeviceFailure } from 'livekit-client';
import { useTranslations } from 'next-intl';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import type { CallTokenRequest } from '@/lib/calls/call-token';
import { type CallErrorCode, callErrorMessage } from '@/lib/calls/errors';
import { invalidateCredits } from '@/lib/credits-query';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import useSupabaseBrowser from '@/lib/supabase/client';
import { MINIMUM_CREDITS_FOR_CALL } from '@/lib/supabase/constants';

const TOKEN_REQUEST_TIMEOUT_MS = 30_000;
/** The first LiveKit connection, including its regional retries. */
const CONNECTION_TIMEOUT_MS = 30_000;
/** How long a connected call waits for the agent to join or come back. */
const AGENT_TIMEOUT_MS = 10_000;

/**
 * The agent reports these once its voice pipeline runs, which is when it
 * starts billing, so the call timer starts then.
 */
const READY_AGENT_STATES = new Set<AgentState>([
  'listening',
  'thinking',
  'speaking',
]);

interface RoomPhase {
  agentPresent: boolean;
  /** The agent joined at least once. */
  agentSeen: boolean;
  agentState: AgentState;
  characterId: string;
  name: 'connecting' | 'connected';
  /** When the agent was first ready: zero on the call timer. */
  startedAt: number | null;
}

export type CallPhase =
  | { name: 'idle' }
  | { characterId: string; name: 'requesting' }
  | RoomPhase;

export interface CallSession {
  /** The last call that reached the room, until dismissed or replaced. */
  ended: { characterId: string; seconds: number } | null;
  phase: CallPhase;
  /**
   * The latest room's credentials. They outlive the call: LiveKit leaves a
   * room only while it still has the token.
   */
  room: { token: string; url: string } | null;
}

type CallEvent =
  | { characterId: string; type: 'request' }
  | { token: string; type: 'token'; url: string }
  | { type: 'connected' }
  | { at: number; present: boolean; state: AgentState; type: 'agent' }
  | { at: number; type: 'end' }
  | { type: 'dismiss' };

const IDLE: CallPhase = { name: 'idle' };

export const inRoom = (phase: CallPhase): phase is RoomPhase =>
  phase.name === 'connecting' || phase.name === 'connected';

function nextSession(session: CallSession, event: CallEvent): CallSession {
  const { phase } = session;
  switch (event.type) {
    case 'request':
      return {
        ...session,
        phase: { characterId: event.characterId, name: 'requesting' },
      };
    case 'token':
      if (phase.name !== 'requesting') return session;
      return {
        ended: null,
        phase: {
          agentPresent: false,
          agentSeen: false,
          agentState: 'disconnected',
          characterId: phase.characterId,
          name: 'connecting',
          startedAt: null,
        },
        room: { token: event.token, url: event.url },
      };
    case 'connected':
      return phase.name === 'connecting'
        ? { ...session, phase: { ...phase, name: 'connected' } }
        : session;
    case 'agent': {
      if (!inRoom(phase)) return session;
      const ready =
        phase.name === 'connected' && READY_AGENT_STATES.has(event.state);
      return {
        ...session,
        phase: {
          ...phase,
          agentPresent: event.present,
          agentSeen: phase.agentSeen || event.present,
          agentState: event.state,
          startedAt: phase.startedAt ?? (ready ? event.at : null),
        },
      };
    }
    case 'end':
      if (phase.name !== 'connected') return { ...session, phase: IDLE };
      return {
        ...session,
        ended: {
          characterId: phase.characterId,
          seconds:
            phase.startedAt === null
              ? 0
              : Math.floor((event.at - phase.startedAt) / 1000),
        },
        phase: IDLE,
      };
    case 'dismiss':
      return { ...session, ended: null };
    default:
      return session;
  }
}

/** Why a call ends: the user hung up, the room or agent dropped, or an error. */
type Ending =
  | 'dropped'
  | 'hangup'
  | { code: unknown; fallback?: CallErrorCode };

/** After the room connects, LiveKit reports microphone failures here. */
function roomErrorCode(
  error: Error | undefined,
  connected: boolean,
): CallErrorCode {
  const failure = MediaDeviceFailure.getFailure(error);
  if (failure === MediaDeviceFailure.PermissionDenied) {
    return 'microphone_denied';
  }
  const microphoneUnavailable =
    failure === MediaDeviceFailure.NotFound ||
    failure === MediaDeviceFailure.DeviceInUse ||
    error?.name === 'OverconstrainedError' ||
    error?.name === 'ConstraintNotSatisfiedError';
  return microphoneUnavailable || connected
    ? 'microphone_unavailable'
    : 'connection_failed';
}

interface CallSessionContextValue {
  /** Reports the agent participant and its state from inside the room. */
  agentChanged: (present: boolean, state: AgentState) => void;
  /**
   * Starts a call. `canStart` runs first, for the microphone check; the
   * result says whether the call reached the room or why it did not.
   */
  connect: (
    request: CallTokenRequest,
    canStart?: () => Promise<boolean>,
  ) => Promise<'blocked' | 'failed' | 'started'>;
  disconnect: () => void;
  /** Clears the last ended call. */
  dismiss: () => void;
  /** Ends the call for an agent error code. */
  fail: (code: unknown) => void;
  roomConnected: () => void;
  roomDisconnected: () => void;
  roomFailed: (error?: Error) => void;
  session: CallSession;
}

const CallSessionContext = createContext<CallSessionContextValue | undefined>(
  undefined,
);

/** One call at a time: its token request, room, agent and deadlines. */
export function CallSessionProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('call');
  const queryClient = useQueryClient();
  const supabase = useSupabaseBrowser();
  const [session, setSession] = useState<CallSession>({
    ended: null,
    phase: IDLE,
    room: null,
  });
  // LiveKit holds on to its callbacks, so they read the latest session here.
  const latest = useRef(session);

  // Callbacks below keep their identity: LiveKitRoom reconnects when its
  // callbacks change.
  const transition = useCallback((event: CallEvent) => {
    const previous = latest.current;
    latest.current = nextSession(previous, event);
    setSession(latest.current);
    return previous.phase;
  }, []);

  const end = useCallback(
    (ending: Ending) => {
      const previous = transition({ at: Date.now(), type: 'end' });
      if (previous.name === 'idle') return;
      if (ending === 'dropped') {
        toast.info(t('disconnected'));
      } else if (ending !== 'hangup') {
        const message = callErrorMessage(
          ending.code,
          ending.fallback ?? 'connection_failed',
        );
        toast.error(
          message === 'notEnoughCredits'
            ? t(message, { count: MINIMUM_CREDITS_FOR_CALL })
            : t(message),
        );
      }
      if (inRoom(previous)) {
        getVerifiedClaims(supabase)
          .then((claims) =>
            claims?.sub ? invalidateCredits(queryClient, claims.sub) : null,
          )
          .catch(() => undefined);
      }
    },
    [queryClient, supabase, t, transition],
  );

  const connect = useCallback<CallSessionContextValue['connect']>(
    async (request, canStart) => {
      if (latest.current.phase.name !== 'idle') return 'failed';
      transition({ characterId: request.characterId, type: 'request' });
      if (canStart && !(await canStart())) {
        end('hangup');
        return 'blocked';
      }
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        TOKEN_REQUEST_TIMEOUT_MS,
      );
      try {
        const response = await fetch('/api/call-token', {
          body: JSON.stringify(request),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          signal: controller.signal,
        });
        if (!response.ok) {
          const { code } = await response
            .json()
            .catch(() => ({ code: undefined }));
          if (response.status === 402) {
            invalidateCredits(queryClient).catch(() => undefined);
          }
          end({ code });
          return 'failed';
        }
        const { accessToken, url } = await response.json();
        transition({ token: accessToken, type: 'token', url });
        return 'started';
      } catch {
        end({ code: 'connection_failed' });
        return 'failed';
      } finally {
        clearTimeout(timeout);
      }
    },
    [end, queryClient, transition],
  );

  const disconnect = useCallback(() => end('hangup'), [end]);
  const dismiss = useCallback(() => {
    transition({ type: 'dismiss' });
  }, [transition]);
  const fail = useCallback(
    (code: unknown) => end({ code, fallback: 'agent_error' }),
    [end],
  );
  const roomConnected = useCallback(() => {
    transition({ type: 'connected' });
  }, [transition]);
  const roomDisconnected = useCallback(() => {
    // A failed first connection disconnects before its final error.
    if (latest.current.phase.name === 'connected') end('dropped');
  }, [end]);
  const roomFailed = useCallback(
    (error?: Error) =>
      end({
        code: roomErrorCode(error, latest.current.phase.name === 'connected'),
      }),
    [end],
  );
  const agentChanged = useCallback(
    (present: boolean, state: AgentState) => {
      transition({ at: Date.now(), present, state, type: 'agent' });
    },
    [transition],
  );

  const { phase } = session;
  const connectingToken =
    phase.name === 'connecting' ? session.room?.token : undefined;
  useEffect(() => {
    if (!connectingToken) return;
    const timer = setTimeout(
      () => end({ code: 'connection_failed' }),
      CONNECTION_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [connectingToken, end]);

  const agentMissing = phase.name === 'connected' && !phase.agentPresent;
  const agentLeft = agentMissing && phase.agentSeen;
  useEffect(() => {
    if (!agentMissing) return;
    const timer = setTimeout(
      () => end(agentLeft ? 'dropped' : { code: 'agent_unavailable' }),
      AGENT_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [agentLeft, agentMissing, end]);

  return (
    <CallSessionContext.Provider
      value={{
        agentChanged,
        connect,
        disconnect,
        dismiss,
        fail,
        roomConnected,
        roomDisconnected,
        roomFailed,
        session,
      }}
    >
      {children}
    </CallSessionContext.Provider>
  );
}

export function useCallSession() {
  const context = useContext(CallSessionContext);
  if (!context) {
    throw new Error('useCallSession must be used within a CallSessionProvider');
  }
  return context;
}

/** Seconds on the call timer, which starts when the agent is first ready. */
export function useCallElapsed(): number {
  const { phase } = useCallSession().session;
  const startedAt = phase.name === 'connected' ? phase.startedAt : null;
  const [tick, setTick] = useState({ seconds: 0, startedAt });

  useEffect(() => {
    if (startedAt === null) return;
    const interval = setInterval(() => {
      setTick({
        seconds: Math.floor((Date.now() - startedAt) / 1000),
        startedAt,
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return startedAt !== null && tick.startedAt === startedAt ? tick.seconds : 0;
}

/** MM:SS, or HH:MM:SS from one hour. */
export function formatCallTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => value.toString().padStart(2, '0');
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}
