import { redirect } from 'next/navigation';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { startSpikeConversation } from '@/app/[lang]/(dashboard)/dashboard/voice-spike/actions';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { hasUserPaid } from '@/lib/supabase/queries';
import { listSpikeCharacters } from '@/lib/voice-spike/characters';
import { createChatDb } from '@/lib/voice-spike/chat';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/auth', () => ({ getVerifiedClaims: vi.fn() }));
vi.mock('@/lib/supabase/queries', () => ({ hasUserPaid: vi.fn() }));
vi.mock('@/lib/voice-spike/characters', () => ({
  listSpikeCharacters: vi.fn(),
}));
vi.mock('@/lib/voice-spike/chat', () => ({ createChatDb: vi.fn() }));

const id = '1ee6535f-a9c0-47c0-a7cd-d4dafa4e04e0';
const thread = '7fcfa021-c5a5-4251-a6ab-0fae9393f90c';
const submit = (selection: string) => {
  const form = new FormData();
  form.set('character', selection);
  return startSpikeConversation('es', true, form);
};

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('VERCEL_ENV', undefined);
  vi.stubEnv('VOICE_SPIKE_USER_IDS', 'owner');
  vi.mocked(getVerifiedClaims).mockResolvedValue({ sub: 'owner' } as never);
  vi.mocked(hasUserPaid).mockResolvedValue(true);
  vi.mocked(listSpikeCharacters).mockResolvedValue([{ id, name: 'Mira' }]);
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

it('opens a language-bound thread for the owned character', async () => {
  const query = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: thread } }),
  };
  const from = vi.fn().mockReturnValue(query);
  vi.mocked(createChatDb).mockReturnValue({ from } as never);

  await submit(id);

  expect(listSpikeCharacters).toHaveBeenCalledWith('owner');
  expect(from).toHaveBeenCalledWith('conversations');
  expect(query.insert).toHaveBeenCalledExactlyOnceWith({
    user_id: 'owner',
    character_id: id,
    character_name: 'Mira',
    language: 'es',
  });
  expect(redirect).toHaveBeenCalledWith(
    `/es/dashboard/voice-spike?conversation=${thread}`,
  );
});

it('does not create threads for free accounts, unavailable characters, or production', async () => {
  vi.mocked(hasUserPaid).mockResolvedValueOnce(false);
  expect(await submit(id)).toBe(false);
  expect(listSpikeCharacters).not.toHaveBeenCalled();
  vi.mocked(listSpikeCharacters).mockResolvedValueOnce([]);
  expect(await submit(id)).toBe(false);
  vi.stubEnv('NODE_ENV', 'production');
  expect(await submit(id)).toBe(false);
  expect(createChatDb).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
});
