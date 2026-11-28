import { llm, voice } from '@livekit/agents';
import { loadMemory, selectPreload } from '@sexyvoice/voice-chat/memory';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CallMemoryAgent } from '../src/memory.ts';

const shared = '__shared__';
const slot = (memory_type: string, content: string, character_id = shared) => ({
  character_id,
  memory_type,
  content,
});

function database(
  rows: ReturnType<typeof slot>[],
  optedIn: boolean | undefined = true,
) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  const getUserById = vi.fn().mockResolvedValue({
    data: {
      user: { id: 'user', user_metadata: { call_memory_enabled: optedIn } },
    },
  });
  const from = vi.fn().mockReturnValue(query);
  const search = vi.fn().mockResolvedValue({ data: [], error: null });
  const rpc = vi.fn().mockReturnValue({ abortSignal: search });
  return {
    db: {
      from,
      rpc,
      auth: { admin: { getUserById } },
    } as unknown as SupabaseClient,
    from,
    query,
    rpc,
    search,
    getUserById,
  };
}
const prior = slot('fact:movie', 'x'.repeat(4500));

afterEach(() => vi.restoreAllMocks());

describe('Python-compatible memory retrieval', () => {
  it('keeps pinned slots over budget and drops shared relationship history in character calls', () => {
    const boundary = slot(
      'profile:boundaries',
      'Ask before changing the topic.',
    );
    const relationship = slot(
      'relationship:dynamic',
      'Talks about astronomy often.',
      'character-a',
    );
    const rows = [
      prior,
      boundary,
      slot('relationship:dynamic', 'Old shared story'),
      slot('episode:2026-11-18', 'Old shared episode'),
      relationship,
      slot('profile:name', 'Different character', 'character-b'),
    ];
    expect(selectPreload(rows, 'character-a')).toEqual({
      slots: [boundary, relationship],
      complete: false,
    });
    expect(
      selectPreload([slot('boundary', 'x'.repeat(5000))], shared).complete,
    ).toBe(true);
  });

  it('checks the saved opt-in before accessing memory and skips search for a complete preload', async () => {
    const optedOut = database([], false);
    expect(await loadMemory(optedOut.db, 'user', null)).toBeNull();
    expect(optedOut.from).not.toHaveBeenCalled();
    optedOut.getUserById.mockResolvedValueOnce({
      data: { user: { id: 'user', user_metadata: {} } },
    });
    expect(await loadMemory(optedOut.db, 'user', null)).toBeNull();
    expect(optedOut.from).not.toHaveBeenCalled();

    const optedIn = database([slot('profile:identity', 'Calls me Alex')]);
    const memory = await loadMemory(optedIn.db, 'user', null);
    expect(memory?.instructions).toContain('Calls me Alex');
    expect(memory?.recall).toBeNull();
    expect(optedIn.query.eq).toHaveBeenCalledWith('user_id', 'user');
    expect(optedIn.query.in).toHaveBeenCalledWith('character_id', [shared]);
  });

  it('uses the pgvector hybrid RPC on overflow and filters out preloaded, foreign and weak results', async () => {
    const loaded = slot('profile:name', 'Alex');
    const harness = database([loaded, prior]);
    const vector = [1, ...new Array<number>(1535).fill(0)];
    const embed = vi.fn().mockResolvedValue(vector);
    const memory = await loadMemory(harness.db, 'user', 'character-a', embed);
    expect(harness.query.in).toHaveBeenCalledWith('character_id', [
      shared,
      'character-a',
    ]);
    const match = (
      row: ReturnType<typeof slot>,
      distance: number,
      textRank: number | null = null,
    ) => ({ ...row, text_rank: textRank, cosine_distance: distance });
    harness.search.mockResolvedValue({
      data: [
        match(loaded, 0.1),
        match(slot('fact:english', 'Enjoys long novels', 'character-a'), 0.2),
        match(slot('fact:food', 'Prefers sushi'), 0.9, 1),
        match(slot('fact:foreign', 'Other character', 'character-b'), 0.1),
        match(slot('fact:weak', 'Irrelevant vector hit'), 0.9),
      ],
      error: null,
    });

    const recalled = await memory?.recall?.('  What books?  ');
    expect(embed).toHaveBeenCalledWith('What books?');
    expect(harness.rpc).toHaveBeenCalledWith('match_agent_memories_hybrid', {
      query_embedding: JSON.stringify(vector),
      query_text: 'What books?',
      p_user_id: 'user',
      p_character_id: 'character-a',
      match_count: 5,
    });
    expect(recalled).toContain('Enjoys long novels');
    expect(recalled).toContain('Prefers sushi');
    expect(recalled).not.toMatch(/Alex|Other character|Irrelevant/);
  });

  it('continues on memory outages and falls back to text matches when embeddings fail', async () => {
    const harness = database([prior]);
    harness.query.abortSignal.mockRejectedValueOnce(new Error('timeout'));
    await expect(loadMemory(harness.db, 'user', null)).resolves.toBeNull();

    const embed = vi.fn().mockRejectedValue(new Error('timeout'));
    const memory = await loadMemory(harness.db, 'user', null, embed);
    harness.search.mockResolvedValueOnce({
      data: [
        {
          ...slot('fact:pet', 'Owns a cat'),
          text_rank: 1,
          cosine_distance: null,
        },
      ],
      error: null,
    });
    expect(await memory?.recall?.('cat')).toContain('Owns a cat');
    expect(harness.rpc).toHaveBeenCalledWith(
      'match_agent_memories_hybrid',
      expect.objectContaining({
        query_embedding: null,
        p_character_id: shared,
      }),
    );
    harness.search.mockRejectedValueOnce(new Error('timeout'));
    await expect(memory?.recall?.('cat')).resolves.toBe('');
  });

  it('injects recall only for a current turn and keeps it out of the committed context', async () => {
    const saved = llm.ChatMessage.create({
      id: 'prior',
      role: 'user',
      content: 'Saved turn',
    });
    const seed = new llm.ChatContext([saved]);
    const recall = vi.fn().mockResolvedValue('Private fact');
    const node = vi
      .spyOn(voice.Agent.prototype, 'llmNode')
      .mockResolvedValue(null);
    const agent = new CallMemoryAgent(
      { instructions: 'Assistant', chatCtx: seed },
      recall,
    );
    await agent.llmNode(seed, new llm.ToolContext(), {});
    expect(recall).not.toHaveBeenCalled();

    const current = seed.copy();
    current.addMessage({ role: 'user', content: 'A new question' });
    await agent.llmNode(current, new llm.ToolContext(), {});
    expect(recall).toHaveBeenCalledExactlyOnceWith('A new question');
    expect(node.mock.calls[1][0].items).toMatchObject([
      { id: 'prior' },
      { role: 'user' },
      { role: 'system', content: ['Private fact'] },
    ]);
    expect(current.items).toHaveLength(2);
  });
});
