import { llm } from '@livekit/agents';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const HISTORY_ROWS = 32;
const HISTORY_CHARS = 12_000;
const roleSchema = z.enum(['user', 'assistant']);
const historySchema = z.array(
  z.object({
    id: z.string(),
    role: roleSchema,
    parts: z.array(z.object({ type: z.literal('text'), content: z.string() })),
    status: z.enum(['completed', 'interrupted']),
  }),
);
const threadSchema = z.object({
  character_id: z.uuid().nullable(),
  character_name: z.string(),
  is_voice_spike: z.boolean(),
  language: z.string(),
  scene_instructions: z.string(),
});

type History = z.infer<typeof historySchema>;
interface CallKey {
  conversationId: string;
  roomName: string;
  userId: string;
}

export function seedHistory(rowsNewestFirst: History): llm.ChatContext {
  let remaining = HISTORY_CHARS;
  const messages: llm.ChatMessage[] = [];
  for (const row of rowsNewestFirst) {
    const text = row.parts.map((part) => part.content).join('\n');
    if (!text.trim()) continue;
    if (text.length > remaining && messages.length) break;
    messages.push(
      llm.ChatMessage.create({
        id: row.id,
        role: row.role,
        content: text.slice(-remaining),
        interrupted: row.status === 'interrupted',
      }),
    );
    remaining -= text.length;
    if (remaining <= 0) break;
  }
  return new llm.ChatContext(messages.reverse());
}

export function committedTurn(item: llm.ChatItem) {
  if (item.type !== 'message') return null;
  const role = roleSchema.safeParse(item.role);
  const text = item.textContent?.trim();
  if (!(role.success && text)) return null;
  return {
    p_item_id: item.id,
    p_role: role.data,
    p_text: text,
    p_interrupted: item.interrupted,
  };
}

export class CallThread {
  private pending = Promise.resolve();
  private failed = false;
  private readonly params;

  private readonly db: SupabaseClient;
  private readonly key: CallKey;

  constructor(db: SupabaseClient, key: CallKey) {
    this.db = db;
    this.key = key;
    this.params = {
      p_user_id: key.userId,
      p_conversation_id: key.conversationId,
      p_room_name: key.roomName,
    };
  }

  async open(resume: boolean) {
    const { data, error } = await this.db
      .rpc('open_voice_spike_call', { ...this.params, p_resume: resume })
      .abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error('Conversation could not be opened');

    const thread = threadSchema.parse(data);
    const history = await this.db
      .from('conversation_messages')
      .select('id,role,parts,status')
      .eq('conversation_id', this.key.conversationId)
      .in('status', ['completed', 'interrupted'])
      .order('position', { ascending: false })
      .limit(HISTORY_ROWS)
      .abortSignal(AbortSignal.timeout(5000));
    if (history.error) throw new Error('Conversation history unavailable');

    return { thread, chatCtx: seedHistory(historySchema.parse(history.data)) };
  }

  append(item: llm.ChatItem, onFailure: () => void) {
    const turn = committedTurn(item);
    if (!turn) return;
    this.pending = this.pending
      .then(async () => {
        if (this.failed) return;
        const { error } = await this.db
          .rpc('append_voice_spike_message', { ...this.params, ...turn })
          .abortSignal(AbortSignal.timeout(5000));
        if (error) throw new Error('Conversation turn could not be saved');
      })
      .catch(() => {
        this.failed = true;
        onFailure();
      });
  }

  async close() {
    await this.pending;
    const { error } = await this.db
      .from('voice_spike_calls')
      .delete()
      .eq('user_id', this.key.userId)
      .eq('conversation_id', this.key.conversationId)
      .eq('room_name', this.key.roomName)
      .abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error('Conversation could not be released');
  }
}
