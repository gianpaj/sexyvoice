import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));
vi.mock('@/lib/supabase/auth', () => ({
  getVerifiedClaims: vi.fn(async () => ({ sub: 'user-1' })),
}));
vi.mock('@/lib/supabase/call-voices', () => ({
  resolveCallVoice: vi.fn(async () => ({ id: 'voice-1' })),
}));
vi.mock('@/lib/supabase/queries', () => ({
  getCredits: vi.fn(async () => 1000),
  hasUserPaid: vi.fn(async () => true),
  isFreeUserOverCallLimit: vi.fn(async () => false),
  resolveCharacterPrompt: vi.fn(async () => ({
    is_public: true,
    prompts: { prompt: 'A quiet character', localized_prompts: null },
  })),
}));

import { POST } from '@/app/api/call-token/route';

describe('call-token memory metadata', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
    vi.stubEnv('LIVEKIT_API_KEY', 'test-key');
    vi.stubEnv('LIVEKIT_API_SECRET', 'test-secret-for-local-jwt-signing');
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', user_metadata: {} } },
      error: null,
    });
  });

  it.each([
    [true, true, true],
    [false, true, false],
    [true, false, false],
  ])(
    'sends both scopes with call=%s, account=%s',
    async (call, account, enabled) => {
      getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-1',
            user_metadata: { call_memory_enabled: account },
          },
        },
        error: null,
      });
      const response = await POST(
        new Request('http://localhost/api/call-token', {
          method: 'POST',
          body: JSON.stringify({
            instructions: '',
            selectedPresetId: '11111111-1111-4111-8111-111111111111',
            memory: call,
            sessionConfig: {
              maxOutputTokens: null,
              model: 'grok-voice-think-fast-1.0',
              temperature: 0.8,
              voice: 'Ara',
            },
          }),
        }),
      );
      expect(response.status, await response.clone().text()).toBe(200);
      const { accessToken } = await response.json();
      const payload = JSON.parse(
        Buffer.from(accessToken.split('.')[1], 'base64url').toString(),
      );
      expect(JSON.parse(payload.metadata)).toMatchObject({
        character_id: '11111111-1111-4111-8111-111111111111',
        memory: enabled,
        memory_scope: 'both',
        user_id: 'user-1',
      });
    },
  );
});
