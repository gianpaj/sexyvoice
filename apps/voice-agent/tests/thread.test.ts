import { llm } from '@livekit/agents';
import {
  loadThreadCharacter,
  replyInstructions,
} from '@sexyvoice/voice-chat/history';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { CallThread, committedTurn } from '../src/thread.ts';

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
          uses_default_character: false,
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

  it('seeds the ordered turns returned by Postgres and preserves interruptions', async () => {
    const rpc = vi.fn((name: string) => ({
      abortSignal: async () => ({
        data:
          name === 'open_voice_call'
            ? {
                character_id: null,
                character_name: 'Voice chat',
                uses_default_character: true,
                language: 'en',
                scene_instructions: '',
              }
            : [
                { id: 'one', role: 'user', content: 'One', interrupted: false },
                {
                  id: 'two',
                  role: 'assistant',
                  content: 'Dos',
                  interrupted: true,
                },
              ],
      }),
    }));
    const thread = new CallThread({ rpc } as unknown as SupabaseClient, {
      userId: 'caller',
      conversationId: 'thread',
      roomName: 'room',
    });

    const { chatCtx } = await thread.open(true);
    expect(rpc).toHaveBeenLastCalledWith('read_conversation_context', {
      p_user_id: 'caller',
      p_conversation_id: 'thread',
    });
    expect(chatCtx.items).toMatchObject([
      { id: 'one', role: 'user', content: ['One'], interrupted: false },
      { id: 'two', role: 'assistant', content: ['Dos'], interrupted: true },
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
    expect(from).toHaveBeenCalledWith('voice_conversation_leases');
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
