import { z } from 'zod';

export const OUTPUT_SAMPLE_RATE = 24_000;
export const MAX_FRAME_BYTES = 32_768;
export const MAX_BUFFERED_BYTES = 262_144;
const id = z.string().min(1).max(100);
export const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ping'), id }),
  z.strictObject({
    type: z.literal('text'),
    id,
    text: z
      .string()
      .trim()
      .min(1)
      .max(4000)
      .refine((text) => [...text].length <= 2000),
  }),
  z.strictObject({
    type: z.literal('call.start'),
    sampleRate: z.union([
      z.literal(8000),
      z.literal(16_000),
      z.literal(22_050),
      z.literal(24_000),
      z.literal(44_100),
      z.literal(48_000),
    ]),
  }),
  z.strictObject({ type: z.literal('call.stop') }),
  z.strictObject({ type: z.literal('mute'), muted: z.boolean() }),
  z.strictObject({ type: z.literal('interrupt') }),
]);

export type ServerEvent =
  | { type: 'ready'; leaseMs: number; durability: 'connection-only' }
  | { type: 'pong'; id: string }
  | {
      type: 'state';
      state: 'thinking' | 'idle' | 'connecting' | 'listening' | 'muted';
    }
  | { type: 'text.start'; id: string }
  | { type: 'text.delta'; id: string; text: string }
  | {
      type: 'text.end';
      id: string;
      status: 'completed' | 'interrupted' | 'failed';
    }
  | { type: 'transcript'; text: string; final: boolean }
  | {
      type: 'audio';
      id: string;
      audio: string;
      sampleRate: typeof OUTPUT_SAMPLE_RATE;
    }
  | { type: 'usage'; modality: 'llm' | 'tts'; usage: unknown }
  | { type: 'error'; code: 'invalid_message' | 'busy' | 'limit' | 'provider' }
  | { type: 'rotate'; recoverable: false };
