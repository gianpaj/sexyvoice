'use client';

import {
  useConnectionState,
  useMaybeRoomContext,
  useVoiceAssistant,
} from '@livekit/components-react';
import { ConnectionState, type RpcInvocationData } from 'livekit-client';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { useCallSession } from './call-session';

// RPC methods the SexyCall agent calls on the browser.
const TOAST_RPC_METHOD = 'pg.toast';
const ERROR_RPC_METHOD = 'pg.error';

/** A message the agent shows as a toast, such as a credit warning. */
// biome-ignore lint/suspicious/useAwait: LiveKit RPC handlers return promises
async function showAgentToast(data: RpcInvocationData) {
  const { title, description, variant } = JSON.parse(data.payload);
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
}

/**
 * Connects the agent in the room to the call session: its presence and
 * state, the toasts it sends and the errors that end the call.
 */
export function CallAgent() {
  const room = useMaybeRoomContext();
  const { agent, state } = useVoiceAssistant();
  const connectionState = useConnectionState();
  const { agentChanged, fail, roomReconnecting } = useCallSession();

  useEffect(() => {
    agentChanged(Boolean(agent), state);
  }, [agent, agentChanged, state]);

  const reconnecting =
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting;
  useEffect(() => {
    roomReconnecting(reconnecting);
  }, [reconnecting, roomReconnecting]);

  useEffect(() => {
    if (!room) return;
    room.unregisterRpcMethod(TOAST_RPC_METHOD);
    room.unregisterRpcMethod(ERROR_RPC_METHOD);
    room.registerRpcMethod(TOAST_RPC_METHOD, showAgentToast);
    room.registerRpcMethod(
      ERROR_RPC_METHOD,
      // biome-ignore lint/suspicious/useAwait: LiveKit RPC handlers return promises
      async (data: RpcInvocationData) => {
        fail(JSON.parse(data.payload).error);
        return JSON.stringify({ handled: true });
      },
    );
    return () => {
      room.unregisterRpcMethod(TOAST_RPC_METHOD);
      room.unregisterRpcMethod(ERROR_RPC_METHOD);
    };
  }, [fail, room]);

  return null;
}
