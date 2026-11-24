import { z } from 'zod';

export const AGENT_NAME = 'sexyvoice-voice-chat';
export const RUNTIME = 'voice-chat-js';
export const RUNTIME_ATTRIBUTE = 'sv.voice-chat.runtime';
export const ERROR_ATTRIBUTE = 'sv.voice-chat.error';
export const MUTE_RPC = 'sv.voice-chat.mute';
export const MAX_CALL_MS = 5 * 60_000;
export const dispatchSchema = z.strictObject({
  runtime: z.literal(RUNTIME),
  userId: z.string().min(1).max(100),
  conversationId: z.uuid(),
  resume: z.boolean(),
  expiresAt: z.number().int().positive(),
  inworldVoiceId: z.string().trim().min(1).optional(),
});
export const muteSchema = z.strictObject({ muted: z.boolean() });

export function callerIdentity(userId: string) {
  return `voice-chat-user-${userId}`;
}
