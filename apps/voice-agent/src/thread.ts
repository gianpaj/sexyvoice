import { llm } from '@livekit/agents';
import {
  boundedHistory,
  HISTORY_ROWS,
  type History,
  historySchema,
  roleSchema,
  threadSchema,
} from '@sexyvoice/voice-spike/history';
import type { SupabaseClient } from '@supabase/supabase-js';

interface CallKey {
  conversationId: string;
  roomName: string;
  userId: string;
}

export function seedHistory(rowsNewestFirst: History): llm.ChatContext {
  return new llm.ChatContext(
    boundedHistory(rowsNewestFirst).map((turn) => llm.ChatMessage.create(turn)),
  );
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
  private closing?: Promise<void>;
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
      .rpc('open_voice_call', { ...this.params, p_resume: resume })
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
    if (!turn || this.closing !== undefined) return;
    this.pending = this.pending
      .then(async () => {
        if (this.failed) return;
        // Stable SDK item IDs make a second write safe if the first response was lost.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const { error } = await this.db
            .rpc('append_voice_call_message', { ...this.params, ...turn })
            .abortSignal(AbortSignal.timeout(5000));
          if (!error) return;
        }
        throw new Error('Conversation turn could not be saved');
      })
      .catch(() => {
        this.failed = true;
        onFailure();
      });
  }

  close() {
    this.closing ??= this.release();
    return this.closing;
  }

  private async release() {
    await this.pending;
    if (this.failed)
      throw new Error('Conversation history could not be flushed');
    const { error } = await this.db
      .from('voice_conversation_leases')
      .delete()
      .eq('user_id', this.key.userId)
      .eq('conversation_id', this.key.conversationId)
      .eq('room_name', this.key.roomName)
      .abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error('Conversation could not be released');
  }
}
