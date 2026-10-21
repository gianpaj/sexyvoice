import { beforeEach, describe, expect, it, vi } from 'vitest';

const { maybeSingle, eq, getVoiceIdByName, select } = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  getVoiceIdByName: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from: () => ({ select }) }),
}));
vi.mock('@/lib/supabase/queries', () => ({ getVoiceIdByName }));

import { resolveCallVoice } from '@/lib/supabase/call-voices';

beforeEach(() => {
  vi.clearAllMocks();
  select.mockReturnValue({ eq });
  eq.mockReturnValue({ eq, maybeSingle });
  maybeSingle.mockResolvedValue({ data: null, error: null });
});

describe('call voice resolution', () => {
  it('requires a reference for Mistral and rejects one for Grok', async () => {
    expect(
      await resolveCallVoice({ model: 'mistral-tts', voice: 'Ara' }, 'owner'),
    ).toBeNull();
    expect(
      await resolveCallVoice(
        {
          model: 'grok-voice-think-fast-1.0',
          voice: 'Ara',
          audioReferenceId: 'reference',
        },
        'owner',
      ),
    ).toBeNull();
    expect(getVoiceIdByName).not.toHaveBeenCalled();
  });

  it('resolves only the requested owner and Mistral provider', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: 'reference', name: 'My voice', voice_id: 'provider-id' },
      error: null,
    });
    expect(
      await resolveCallVoice(
        {
          model: 'mistral-tts',
          voice: 'My voice',
          audioReferenceId: 'reference',
        },
        'owner',
      ),
    ).toEqual({ id: 'reference', name: 'My voice' });
    expect(eq.mock.calls).toEqual([
      ['id', 'reference'],
      ['user_id', 'owner'],
      ['provider', 'mistral'],
    ]);
  });

  it('rejects unavailable or inaccessible profiles', async () => {
    expect(
      await resolveCallVoice(
        {
          model: 'mistral-tts',
          voice: 'My voice',
          audioReferenceId: 'reference',
        },
        'other-user',
      ),
    ).toBeNull();
  });

  it('preserves built-in voice resolution', async () => {
    getVoiceIdByName.mockResolvedValue({ id: 'builtin', name: 'Ara' });
    expect(
      await resolveCallVoice(
        { model: 'grok-voice-think-fast-1.0', voice: 'Ara' },
        'owner',
      ),
    ).toEqual({ id: 'builtin', name: 'Ara' });
  });
});
