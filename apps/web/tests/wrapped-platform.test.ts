import { afterEach, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/wrapped/platform/route';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from }),
}));

afterEach(() => vi.unstubAllEnvs());

it('counts both Voxtral versions and Chatterbox as clones in Wrapped totals', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  const audio = [
    'voxtral-mini-tts-2603',
    'voxtral-mini-tts-3-0',
    'resemble-ai/chatterbox',
    'resemble-ai/chatterbox-multilingual',
    'gemini-2.5-pro',
  ].map((model, index) => ({
    created_at: '2026-10-01T00:00:00Z',
    duration: 10,
    id: String(index),
    model,
    text_content: 'Hello',
    voice_id: 'voice',
    voices: null,
  }));
  from.mockImplementation((table: string) => {
    const result = { data: table === 'audio_files' ? audio : [], error: null };
    const query = {
      select: () => query,
      is: () => query,
      range: async () => result,
      eq: async () => result,
      in: async () => result,
    };
    return query;
  });

  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    totalAudioFiles: 5,
    totalClonedAudioFiles: 4,
  });
});
