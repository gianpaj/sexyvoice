import { llm } from '@livekit/agents';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { CallThread, committedTurn, seedHistory } from '../src/thread.ts';

const turn = (id: string, role: 'user' | 'assistant', content: string) =>
  llm.ChatMessage.create({ id, role, content });

describe('JS call conversation context', () => {
  it('seeds visible messages chronologically and preserves interruptions', () => {
    const text = (content: string) => [{ type: 'text' as const, content }];
    const history = seedHistory([
      {
        id: 'two',
        role: 'assistant',
        parts: text('Dos'),
        status: 'interrupted',
      },
      { id: 'one', role: 'user', parts: text('One'), status: 'completed' },
    ]);

    expect(history.items).toMatchObject([
      { id: 'one', role: 'user', content: ['One'], interrupted: false },
      { id: 'two', role: 'assistant', content: ['Dos'], interrupted: true },
    ]);
  });

  it('bounds prompt size and favors the latest turn', () => {
    const latest = {
      id: 'new',
      role: 'user',
      parts: [{ type: 'text', content: 'x'.repeat(14_000) }],
      status: 'completed',
    } as const;
    const history = seedHistory([
      { ...latest, parts: [...latest.parts] },
      { ...latest, id: 'old', parts: [{ type: 'text', content: 'Old' }] },
    ]);
    expect(history.items).toMatchObject([
      { id: 'new', content: ['x'.repeat(12_000)] },
    ]);
  });

  it('saves committed user and assistant text without prompts or empty turns', () => {
    expect(committedTurn(turn('typed', 'user', '  Hello '))).toEqual({
      p_item_id: 'typed',
      p_role: 'user',
      p_text: 'Hello',
      p_interrupted: false,
    });
    expect(
      committedTurn(
        llm.ChatMessage.create({
          id: 'partial',
          role: 'assistant',
          interrupted: true,
          content: 'Hola',
        }),
      ),
    ).toEqual({
      p_item_id: 'partial',
      p_role: 'assistant',
      p_text: 'Hola',
      p_interrupted: true,
    });
    expect(committedTurn(turn('empty', 'user', ' '))).toBeNull();
    expect(
      committedTurn(
        llm.ChatMessage.create({ role: 'system', content: 'Private' }),
      ),
    ).toBeNull();
  });

  it('serializes turns, reports write failure and drains before releasing', async () => {
    let complete!: (result: { error: null }) => void;
    const firstWrite = new Promise<{ error: null }>((resolve) => {
      complete = resolve;
    });
    const write = vi
      .fn()
      .mockReturnValueOnce(firstWrite)
      .mockResolvedValueOnce({ error: 'db unavailable' });
    const query = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockResolvedValue({ error: null }),
    };
    const rpc = vi.fn().mockReturnValue({ abortSignal: write });
    const from = vi.fn().mockReturnValue(query);
    const thread = new CallThread({ rpc, from } as unknown as SupabaseClient, {
      userId: 'caller',
      conversationId: 'thread',
      roomName: 'room',
    });
    const fail = vi.fn();
    thread.append(turn('one', 'user', 'First'), fail);
    thread.append(turn('two', 'assistant', 'Second'), fail);
    thread.append(turn('three', 'user', 'Third'), fail);
    const closed = thread.close();
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();

    complete({ error: null });
    await closed;
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map((call) => call[1].p_item_id)).toEqual([
      'one',
      'two',
    ]);
    expect(fail).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith('voice_spike_calls');
    expect(query.eq.mock.calls).toEqual([
      ['user_id', 'caller'],
      ['conversation_id', 'thread'],
      ['room_name', 'room'],
    ]);
  });
});
