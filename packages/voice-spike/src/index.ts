import { z } from 'zod';

export const AGENT_NAME = 'sexyvoice-js-spike';
export const RUNTIME = 'agents-js-spike';
export const RUNTIME_ATTRIBUTE = 'sv.spike.runtime';
export const MUTE_RPC = 'sv.spike.mute';
export const MAX_CALL_MS = 5 * 60_000;
export const dispatchSchema = z.strictObject({
  runtime: z.literal(RUNTIME),
  userId: z.string().min(1).max(100),
  expiresAt: z.number().int().positive(),
});
export const muteSchema = z.strictObject({ muted: z.boolean() });
