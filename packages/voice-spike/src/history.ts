import { z } from 'zod';

export const HISTORY_ROWS = 32;
const HISTORY_CHARS = 12_000;
export const roleSchema = z.enum(['user', 'assistant']);
export const historySchema = z.array(
  z.object({
    id: z.string(),
    role: roleSchema,
    parts: z.array(z.object({ type: z.literal('text'), content: z.string() })),
    status: z.enum(['completed', 'interrupted']),
  }),
);
export const threadSchema = z.object({
  character_id: z.uuid().nullable(),
  character_name: z.string(),
  is_voice_spike: z.boolean(),
  language: z.string(),
  scene_instructions: z.string(),
});

export type History = z.infer<typeof historySchema>;

export function boundedHistory(rowsNewestFirst: History) {
  let remaining = HISTORY_CHARS;
  const turns: {
    id: string;
    role: History[number]['role'];
    content: string;
    interrupted: boolean;
  }[] = [];
  for (const row of rowsNewestFirst) {
    const text = row.parts.map((part) => part.content).join('\n');
    if (!text.trim()) continue;
    if (text.length > remaining && turns.length) break;
    turns.push({
      id: row.id,
      role: row.role,
      content: text.slice(-remaining),
      interrupted: row.status === 'interrupted',
    });
    remaining -= text.length;
    if (remaining <= 0) break;
  }
  return turns.reverse();
}

export function replyInstructions(
  thread: z.infer<typeof threadSchema>,
  memory?: string,
  recalled?: string,
) {
  return [
    thread.is_voice_spike
      ? 'You are a friendly conversational test assistant.'
      : `You are ${thread.character_name}. Conversation language: ${thread.language}.`,
    'Reply briefly. Treat typed and spoken messages as part of one conversation.',
    thread.scene_instructions,
    memory,
    recalled,
  ].filter((value): value is string => Boolean(value));
}
