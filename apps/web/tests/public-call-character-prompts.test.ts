import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdminClient } from '@/lib/supabase/admin';
import { getPublicCallCharacterPrompts } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

const query = { eq: vi.fn(), select: vi.fn() };
const from = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  from.mockReturnValue(query);
  query.select.mockReturnValue(query);
  vi.mocked(createClient).mockResolvedValue({
    from,
  } as unknown as Awaited<ReturnType<typeof createClient>>);
});

describe('public character prompt reads', () => {
  it('uses session RLS and selects only public characters', async () => {
    const prompts = [
      {
        id: 'public-character',
        prompts: { localized_prompts: { en: 'English' }, prompt: 'Default' },
      },
    ];
    query.eq.mockResolvedValue({ data: prompts, error: null });

    await expect(getPublicCallCharacterPrompts()).resolves.toEqual(prompts);
    expect(createClient).toHaveBeenCalledOnce();
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledExactlyOnceWith('characters');
    expect(query.select).toHaveBeenCalledExactlyOnceWith(
      'id, prompts ( prompt, localized_prompts )',
    );
    expect(query.eq).toHaveBeenCalledExactlyOnceWith('is_public', true);
  });

  it('propagates errors to the page prefill fallback', async () => {
    const error = new Error('Public prompt lookup failed');
    query.eq.mockResolvedValue({ data: null, error });

    await expect(getPublicCallCharacterPrompts()).rejects.toBe(error);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
