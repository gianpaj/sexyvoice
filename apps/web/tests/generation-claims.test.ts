import { logger } from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as callToken } from '@/app/api/call-token/route';
import { POST as cloneVoice } from '@/app/api/clone-voice/route';
import { POST as estimateCredits } from '@/app/api/estimate-credits/route';
import { POST as generateText } from '@/app/api/generate-text/route';
import { POST as generateVoice } from '@/app/api/generate-voice/route';
// biome-ignore lint/performance/noNamespaceImport: tests assert across query mocks
import * as queries from '@/lib/supabase/queries';
import {
  flushPromises,
  mockCountTokens,
  mockFalSubscribe,
  mockMistralSpeechComplete,
  mockReplicateRun,
  mockUploadFileToR2,
} from './setup';

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
  streamText: vi.fn(),
  token: vi.fn(),
  reference: vi.fn(),
  referenceEq: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: mocks.getClaims, getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: mocks.referenceEq }) }),
  })),
}));

vi.mock('ai', () => ({ streamText: mocks.streamText }));
vi.mock('livekit-server-sdk', () => ({
  AccessToken: class {
    constructor(...args: unknown[]) {
      mocks.token(...args);
    }
    addGrant() {}
    toJwt() {
      return Promise.resolve('call-token');
    }
  },
}));

const subject = 'claims-user-id';
const presetId = '123e4567-e89b-12d3-a456-426614174000';
const character = {
  id: presetId,
  is_public: false,
  prompts: { localized_prompts: null, prompt: 'Server-only prompt' },
  user_id: subject,
  voice_id: 'voice-eve-id',
  voices: { id: 'voice-eve-id', name: 'eve' },
};
const callBody = {
  instructions: 'Test instructions',
  selectedPresetId: null,
  sessionConfig: {
    maxOutputTokens: null,
    model: 'grok-voice-think-fast-1.0',
    temperature: 0.8,
    voice: 'eve',
  },
};

function jsonRequest(route: string, body: object) {
  return new Request(`http://localhost/api/${route}`, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

const routes = [
  {
    name: 'call-token',
    post: callToken,
    request: () => jsonRequest('call-token', callBody),
  },
  {
    name: 'estimate-credits',
    post: estimateCredits,
    request: () =>
      jsonRequest('estimate-credits', {
        text: 'Hello world',
        voiceId: 'voice-kore-id',
      }),
  },
  {
    name: 'generate-text',
    post: generateText,
    request: () =>
      jsonRequest('generate-text', {
        prompt: 'Hello world',
        selectedVoiceLanguage: 'en',
      }),
  },
  {
    name: 'generate-voice',
    post: generateVoice,
    request: () =>
      jsonRequest('generate-voice', {
        text: 'Hello world',
        voiceId: 'voice-tara-id',
      }),
  },
  {
    name: 'clone-voice',
    post: cloneVoice,
    request: () => {
      const form = new FormData();
      // Duration parsing is mocked in setup; retain the WAV signature.
      form.set(
        'file',
        new File(['RIFF0000WAVE', new Uint8Array(1024)], 'voice.wav', {
          type: 'audio/wav',
        }),
      );
      form.set('text', 'Hello world');
      form.set('locale', 'en');
      return new Request('http://localhost/api/clone-voice', {
        body: form,
        method: 'POST',
      });
    },
  },
];

describe('Generation route claims authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.referenceEq.mockReturnValue({
      eq: mocks.referenceEq,
      maybeSingle: mocks.reference,
    });
    mocks.reference.mockResolvedValue({ data: null, error: null });
    vi.stubGlobal('crypto', {
      ...globalThis.crypto,
      randomUUID: () => '123e4567-e89b-12d3-a456-426614174001',
    });
    mocks.getClaims.mockReset().mockResolvedValue({
      data: { claims: { sub: subject } },
      error: null,
    });
    mocks.getUser.mockReset().mockResolvedValue({
      data: { user: { id: subject, user_metadata: {} } },
      error: null,
    });

    mocks.streamText.mockReturnValue({
      toTextStreamResponse: () => new Response('Enhanced text'),
    });
    vi.spyOn(queries, 'isFreeUserOverCallLimit').mockResolvedValue(false);
    vi.spyOn(queries, 'resolveCharacterPrompt').mockResolvedValue(character);
    vi.mocked(queries.getCredits).mockResolvedValue(1000);
    vi.mocked(queries.hasUserPaid).mockReset().mockResolvedValue(false);
    vi.stubEnv('LIVEKIT_API_KEY', 'test-key');
    vi.stubEnv('LIVEKIT_API_SECRET', 'test-secret');
  });

  afterEach(async () => {
    await flushPromises();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe.each(routes)('$name', ({ name, post, request }) => {
    it.each([undefined, 'claims@example.com'])(
      'accepts verified claims with email %s',
      async (email) => {
        mocks.getClaims.mockResolvedValueOnce({
          data: { claims: { email, sub: subject } },
          error: null,
        });

        if (name === 'call-token') {
          vi.mocked(queries.hasUserPaid).mockResolvedValue(true);
        }
        const response = await post(request());
        await response.text();
        await flushPromises();

        expect(response.status).toBe(200);
        expect(mocks.getClaims).toHaveBeenCalledOnce();
        if (name === 'call-token') {
          expect(mocks.getUser).toHaveBeenCalledOnce();
        } else {
          expect(mocks.getUser).not.toHaveBeenCalled();
        }
        if (name === 'generate-text') {
          expect(mocks.streamText).toHaveBeenCalledOnce();
        } else if (name === 'estimate-credits') {
          expect(queries.hasUserPaid).toHaveBeenCalledWith(subject);
          expect(mockCountTokens).toHaveBeenCalledOnce();
        } else {
          expect(queries.getCredits).toHaveBeenCalledWith(subject);
          if (name === 'call-token') {
            const options = mocks.token.mock.calls[0][2];
            expect(JSON.parse(options.metadata).user_id).toBe(subject);
          } else {
            expect(queries.reduceCredits).toHaveBeenCalledWith(
              expect.objectContaining({ userId: subject }),
            );
            expect(queries.saveAudioFile).toHaveBeenCalledWith(
              expect.objectContaining({ userId: subject }),
            );
          }
        }
      },
    );

    it.each([
      { label: 'missing data', result: { data: null, error: null } },
      {
        label: 'missing claims',
        result: { data: { claims: null }, error: null },
      },
      {
        label: 'missing subject',
        result: {
          data: { claims: { email: 'claims@example.com' } },
          error: null,
        },
      },
      {
        label: 'empty subject',
        result: { data: { claims: { sub: '' } }, error: null },
      },
      {
        label: 'verification error with claims',
        result: {
          data: { claims: { sub: subject } },
          error: { message: 'Invalid token' },
        },
      },
    ])('rejects $label before providers or billing', async ({ result }) => {
      mocks.getClaims.mockResolvedValueOnce(result);

      const response = await post(request());
      const body = await response.json();

      expect(response.status).toBe(401);
      if (name === 'clone-voice') {
        expect(body.code).toBe('errors.userNotFound');
        expect(body.serverMessage).toBe('User not found');
      } else {
        expect(body.error).toBe('User not found');
      }
      if (name === 'call-token') {
        // Request headers carry auth cookies, so the log line has no context.
        expect(logger.error).toHaveBeenCalledExactlyOnceWith('User not found');
      }
      expect(mocks.getClaims).toHaveBeenCalledOnce();
      expect(mocks.getUser).not.toHaveBeenCalled();
      for (const query of [
        queries.getCredits,
        queries.hasUserPaid,
        queries.getVoiceById,
        queries.getVoiceIdByName,
        queries.isFreeUserOverCallLimit,
        queries.isFreemiumUserOverLimit,
        queries.resolveCharacterPrompt,
        queries.reduceCredits,
        queries.reduceCreditsUpTo,
        queries.restoreCredits,
        queries.saveAudioFile,
        queries.insertUsageEvent,
      ]) {
        expect(query).not.toHaveBeenCalled();
      }
      for (const provider of [
        mocks.token,
        mocks.streamText,
        mockCountTokens,
        mockReplicateRun,
        mockMistralSpeechComplete,
        mockFalSubscribe,
        mockUploadFileToR2,
      ]) {
        expect(provider).not.toHaveBeenCalled();
      }
    });
  });

  it('forwards caller clock data in agent metadata', async () => {
    vi.mocked(queries.hasUserPaid).mockResolvedValue(true);
    const response = await callToken(
      jsonRequest('call-token', {
        ...callBody,
        clientTime: '2026-11-06T23:30:00.000Z',
        timeZone: 'Europe/Rome',
      }),
    );
    expect(response.status).toBe(200);
    expect(JSON.parse(mocks.token.mock.calls[0][2].metadata)).toMatchObject({
      client_time: '2026-11-06T23:30:00.000Z',
      time_zone: 'Europe/Rome',
    });
  });

  it.each([
    { paid: false, preference: undefined, requested: undefined, enabled: true },
    { paid: true, preference: undefined, requested: true, enabled: true },
    { paid: false, preference: true, requested: true, enabled: true },
    { paid: false, preference: false, requested: undefined, enabled: false },
    { paid: true, preference: false, requested: true, enabled: false },
    { paid: true, preference: true, requested: false, enabled: false },
  ])(
    'applies memory preference $preference for paid=$paid, requested=$requested',
    async ({ paid, preference, requested, enabled }) => {
      vi.mocked(queries.hasUserPaid).mockResolvedValue(paid);
      vi.mocked(queries.resolveCharacterPrompt).mockResolvedValue({
        ...character,
        is_public: true,
      });
      // Token-era metadata must not override a more recent profile choice.
      mocks.getClaims.mockResolvedValue({
        data: {
          claims: {
            sub: subject,
            user_metadata: { call_memory_enabled: true },
          },
        },
        error: null,
      });
      mocks.getUser.mockResolvedValue({
        data: {
          user: {
            id: subject,
            user_metadata: { call_memory_enabled: preference },
          },
        },
        error: null,
      });

      const response = await callToken(
        jsonRequest('call-token', {
          ...callBody,
          memory: requested,
          selectedPresetId: presetId,
        }),
      );

      expect(response.status).toBe(200);
      expect(JSON.parse(mocks.token.mock.calls[0][2].metadata)).toMatchObject({
        memory: enabled,
        memory_scope: 'both',
      });
      expect(queries.hasUserPaid).not.toHaveBeenCalled();
      if (requested === false) expect(mocks.getUser).not.toHaveBeenCalled();
    },
  );

  it.each([
    { data: null, error: null },
    { data: { user: null }, error: null },
    {
      data: { user: { id: subject, user_metadata: {} } },
      error: { message: 'Auth unavailable' },
    },
    { data: { user: { id: 'another-user', user_metadata: {} } }, error: null },
  ])(
    'starts without memory when the memory preference cannot be read',
    async (result) => {
      vi.mocked(queries.hasUserPaid).mockResolvedValue(true);
      mocks.getUser.mockResolvedValue(result);

      const response = await callToken(jsonRequest('call-token', callBody));

      expect(response.status).toBe(200);
      expect(JSON.parse(mocks.token.mock.calls[0][2].metadata).memory).toBe(
        false,
      );
      expect(logger.warn).toHaveBeenCalledWith(
        'Memory preference unavailable; starting call without memory',
        { user: { id: subject } },
      );
    },
  );

  it('starts without memory when the preference lookup throws', async () => {
    vi.mocked(queries.hasUserPaid).mockResolvedValue(true);
    mocks.getUser.mockRejectedValue(new Error('Auth unavailable'));

    const response = await callToken(jsonRequest('call-token', callBody));

    expect(response.status).toBe(200);
    expect(JSON.parse(mocks.token.mock.calls[0][2].metadata).memory).toBe(
      false,
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('starts preference and voice lookups together', async () => {
    vi.mocked(queries.hasUserPaid).mockResolvedValue(true);
    const voice = await queries.getVoiceIdByName('eve');
    vi.mocked(queries.getVoiceIdByName).mockImplementationOnce(async () => {
      expect(mocks.getUser).toHaveBeenCalledOnce();
      return voice;
    });

    const response = await callToken(jsonRequest('call-token', callBody));

    expect(response.status).toBe(200);
  });

  it('reads a changed profile preference for the next call with the same claims', async () => {
    vi.mocked(queries.hasUserPaid).mockResolvedValue(true);
    await callToken(jsonRequest('call-token', callBody));
    expect(JSON.parse(mocks.token.mock.calls[0][2].metadata).memory).toBe(true);

    mocks.getUser.mockResolvedValue({
      data: {
        user: { id: subject, user_metadata: { call_memory_enabled: false } },
      },
      error: null,
    });
    await callToken(jsonRequest('call-token', callBody));
    expect(JSON.parse(mocks.token.mock.calls[1][2].metadata).memory).toBe(
      false,
    );
  });

  it.each([undefined, true, false])(
    'forwards the profile memory preference %s to the Inworld cascade agent',
    async (preference) => {
      const voiceId = '11111111-1111-4111-8111-111111111111';
      vi.mocked(queries.hasUserPaid).mockResolvedValue(true);
      mocks.reference.mockResolvedValue({
        data: {
          id: voiceId,
          name: 'My voice',
          voice_id: 'provider-voice',
          provider: 'inworld',
        },
        error: null,
      });
      mocks.getUser.mockResolvedValue({
        data: {
          user: {
            id: subject,
            user_metadata: { call_memory_enabled: preference },
          },
        },
        error: null,
      });

      const response = await callToken(
        jsonRequest('call-token', {
          ...callBody,
          sessionConfig: {
            ...callBody.sessionConfig,
            model: 'inworld-tts',
            audioReferenceId: voiceId,
            voice: 'My voice',
          },
        }),
      );

      expect(response.status).toBe(200);
      expect(JSON.parse(mocks.token.mock.calls[0][2].metadata)).toMatchObject({
        model: 'inworld-tts',
        memory: preference !== false,
        user_id: subject,
        voice: voiceId,
      });
    },
  );

  it.each([
    { accessible: true, provider: 'mistral', model: 'mistral-tts' },
    { accessible: false, provider: 'mistral', model: 'mistral-tts' },
    { accessible: true, provider: 'inworld', model: 'inworld-tts' },
    { accessible: false, provider: 'inworld', model: 'inworld-tts' },
    { accessible: false, provider: 'mistral', model: 'inworld-tts' },
  ])(
    'issues a $model token only for an accessible $provider voice: $accessible',
    async ({ accessible, provider, model }) => {
      const id = '11111111-1111-4111-8111-111111111111';
      mocks.reference.mockResolvedValue({
        data:
          accessible || model !== `${provider}-tts`
            ? { id, name: 'My voice', voice_id: 'provider-voice', provider }
            : null,
        error: null,
      });
      vi.mocked(queries.hasUserPaid).mockResolvedValue(true);
      const response = await callToken(
        jsonRequest('call-token', {
          ...callBody,
          sessionConfig: {
            ...callBody.sessionConfig,
            model,
            audioReferenceId: id,
            voice: 'My voice',
          },
        }),
      );
      expect(response.status).toBe(accessible ? 200 : 404);
      expect(mocks.referenceEq.mock.calls).toEqual([
        ['id', id],
        ['user_id', subject],
        ['provider', model === 'inworld-tts' ? 'inworld' : 'mistral'],
      ]);
      if (accessible) {
        const metadata = JSON.parse(mocks.token.mock.calls[0][2].metadata);
        expect(metadata).toMatchObject({
          model,
          voice: id,
          user_id: subject,
          instructions: callBody.instructions,
        });
        expect(JSON.stringify(metadata)).not.toContain('provider-voice');
      } else expect(mocks.token).not.toHaveBeenCalled();
    },
  );

  it('rejects an empty unsaved personality before issuing a token', async () => {
    vi.mocked(queries.hasUserPaid).mockResolvedValue(true);
    const response = await callToken(
      jsonRequest('call-token', { ...callBody, instructions: '  ' }),
    );
    expect(response.status).toBe(400);
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it('keeps the insufficient call credits status', async () => {
    vi.mocked(queries.getCredits).mockResolvedValueOnce(0);
    const response = await callToken(jsonRequest('call-token', callBody));
    expect(response.status).toBe(402);
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it('keeps the free call limit status', async () => {
    vi.mocked(queries.isFreeUserOverCallLimit).mockResolvedValueOnce(true);
    const response = await callToken(jsonRequest('call-token', callBody));
    expect(response.status).toBe(403);
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it.each([
    { owner: 'another-user', paid: true, status: 404 },
    { owner: subject, paid: false, status: 403 },
    { owner: subject, paid: true, status: 200 },
  ])(
    'checks custom character ownership and payment: $status',
    async ({ owner, paid, status }) => {
      vi.mocked(queries.resolveCharacterPrompt).mockResolvedValueOnce({
        ...character,
        user_id: owner,
      });

      vi.mocked(queries.hasUserPaid).mockResolvedValueOnce(paid);

      const response = await callToken(
        jsonRequest('call-token', {
          ...callBody,
          selectedPresetId: presetId,
        }),
      );

      expect(response.status).toBe(status);
      if (status === 200) {
        expect(queries.hasUserPaid).toHaveBeenCalledWith(subject);
        expect(
          JSON.parse(mocks.token.mock.calls[0][2].metadata).instructions,
        ).toBe('Server-only prompt');
      } else {
        expect(mocks.token).not.toHaveBeenCalled();
      }
    },
  );
});
