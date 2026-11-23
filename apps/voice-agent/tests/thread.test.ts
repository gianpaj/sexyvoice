import { llm } from '@livekit/agents';
import {
  loadThreadCharacter,
  replyInstructions,
} from '@sexyvoice/voice-spike/history';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { CallThread, committedTurn, seedHistory } from '../src/thread.ts';

const turn = (id: string, role: 'user' | 'assistant', content: string) =>
  llm.ChatMessage.create({ id, role, content });

describe('JS call conversation context', () => {
  it('loads the owned character’s localized prompt with its default as fallback', async () => {
    const stored = {
      name: 'Mira',
      is_public: false,
      user_id: 'owner',
      session_config: {},
      prompts: {
        prompt: 'Speak as Mira.',
        localized_prompts: { es: 'Habla como Mira.' },
      },
    };
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: stored }),
    };
    const db = {
      from: vi.fn().mockReturnValue(query),
    } as unknown as SupabaseClient;
    const character = await loadThreadCharacter(db, 'owner', 'character', 'es');
    expect(character?.instructions).toBe('Habla como Mira.');
    expect(
      replyInstructions(
        {
          character_id: 'character',
          character_name: 'Mira',
          is_voice_spike: false,
          language: 'es',
          scene_instructions: 'En la biblioteca.',
        },
        { character: character?.instructions },
      ),
    ).toContain('Habla como Mira.');
    expect(
      (await loadThreadCharacter(db, 'owner', 'character', 'fr'))?.instructions,
    ).toBe('Speak as Mira.');
    expect(
      await loadThreadCharacter(db, 'stranger', 'character', 'es'),
    ).toBeNull();
    expect(query.eq).toHaveBeenCalledWith('id', 'character');
  });

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

  it('serializes turns and retries an ambiguous write before releasing', async () => {
    let complete!: (result: { error: null }) => void;
    const firstWrite = new Promise<{ error: null }>((resolve) => {
      complete = resolve;
    });
    const write = vi
      .fn()
      .mockReturnValueOnce(firstWrite)
      .mockResolvedValueOnce({ error: 'db unavailable' })
      .mockResolvedValue({ error: null });
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
    expect(thread.close()).toBe(closed);
    thread.append(turn('late', 'assistant', 'After sealing'), fail);
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();

    complete({ error: null });
    await closed;
    expect(rpc).toHaveBeenCalledTimes(4);
    expect(rpc.mock.calls.map((call) => call[1].p_item_id)).toEqual([
      'one',
      'two',
      'two',
      'three',
    ]);
    expect(fail).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith('voice_spike_calls');
    expect(query.eq.mock.calls).toEqual([
      ['user_id', 'caller'],
      ['conversation_id', 'thread'],
      ['room_name', 'room'],
    ]);
  });
  it('does not release the lease when turn history cannot be flushed', async () => {
    const write = vi.fn().mockResolvedValue({ error: 'db unavailable' });
    const rpc = vi.fn().mockReturnValue({ abortSignal: write });
    const from = vi.fn();
    const thread = new CallThread({ rpc, from } as unknown as SupabaseClient, {
      userId: 'caller',
      conversationId: 'thread',
      roomName: 'room',
    });
    const fail = vi.fn();
    thread.append(turn('one', 'user', 'First'), fail);

    await expect(thread.close()).rejects.toThrow(
      'history could not be flushed',
    );
    expect(write).toHaveBeenCalledTimes(2);
    expect(fail).toHaveBeenCalledOnce();
    expect(from).not.toHaveBeenCalled();
  });
});
