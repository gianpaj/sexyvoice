import { beforeEach, describe, expect, it, vi } from 'vitest';

const { maybeSingle, eq, getVoiceIdByName, select, providerFilter } =
  vi.hoisted(() => ({
    maybeSingle: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    getVoiceIdByName: vi.fn(),
    providerFilter: vi.fn(),
  }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from: () => ({ select }) }),
}));
vi.mock('@/lib/supabase/queries', () => ({ getVoiceIdByName }));

import { defaultSessionConfig } from '@/data/default-config';
import { withCallVoice } from '@/lib/call-voices';
import { resolveCallVoice } from '@/lib/supabase/call-voices';

beforeEach(() => {
  vi.clearAllMocks();
  select.mockReturnValue({ eq });
  eq.mockReturnValue({ eq, in: providerFilter, maybeSingle });
  providerFilter.mockReturnValue({ maybeSingle });
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

  it.each(['mistral', 'inworld'])(
    'resolves only the requested owner and %s provider',
    async (provider) => {
      maybeSingle.mockResolvedValue({
        data: {
          id: 'reference',
          name: 'My voice',
          voice_id: 'provider-id',
          provider,
        },
        error: null,
      });
      expect(
        await resolveCallVoice(
          {
            model: `${provider}-tts`,
            voice: 'My voice',
            audioReferenceId: 'reference',
          },
          'owner',
        ),
      ).toEqual({ id: 'reference', name: 'My voice' });
      expect(eq.mock.calls).toEqual([
        ['id', 'reference'],
        ['user_id', 'owner'],
        ['provider', provider],
      ]);
    },
  );

  it.each(['mistral', 'inworld'])(
    'rejects a %s voice selected with the other provider mode',
    async (provider) => {
      maybeSingle.mockResolvedValue({
        data: { id: 'reference', name: 'My voice', provider },
        error: null,
      });
      expect(
        await resolveCallVoice(
          {
            model: provider === 'mistral' ? 'inworld-tts' : 'mistral-tts',
            voice: 'My voice',
            audioReferenceId: 'reference',
          },
          'owner',
        ),
      ).toBeNull();
    },
  );

  it.each(['mistral', 'inworld'])(
    'selects the saved %s profile independently of the new-clone default',
    (provider) => {
      expect(
        withCallVoice(defaultSessionConfig, {
          name: 'My voice',
          savedId: 'reference',
          provider,
        }),
      ).toMatchObject({
        model: `${provider}-tts`,
        audioReferenceId: 'reference',
      });
    },
  );

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
