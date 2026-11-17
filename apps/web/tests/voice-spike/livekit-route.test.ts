import { TokenVerifier } from 'livekit-server-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/lib/supabase/auth', () => ({
  getVerifiedClaims: vi.fn().mockResolvedValue({ sub: 'test-user' }),
}));

import { POST } from '@/app/api/voice-spike/call-token/route';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const request = (origin = 'https://example.com') =>
  new Request('https://example.com/api/voice-spike/call-token', {
    method: 'POST',
    headers: { origin },
  });
function enable() {
  vi.stubEnv('VOICE_SPIKE_USER_IDS', 'test-user');
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('LIVEKIT_URL', 'wss://example.livekit.cloud');
  vi.stubEnv('LIVEKIT_API_KEY', 'api-key');
  vi.stubEnv('LIVEKIT_API_SECRET', 'a-long-test-secret-at-least-32-characters');
  vi.stubEnv('LIVEKIT_AGENT_NAME', 'sexycall');
}
describe('JS spike call dispatch', () => {
  it('is disabled before auth when the allowlist is empty', async () => {
    vi.stubEnv('VOICE_SPIKE_USER_IDS', '');
    expect((await POST(request())).status).toBe(404);
    expect(createClient).not.toHaveBeenCalled();
  });
  it('rejects cross-origin calls, unauthenticated users and production', async () => {
    enable();
    expect((await POST(request('https://attacker.invalid'))).status).toBe(403);
    vi.mocked(getVerifiedClaims).mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    vi.stubEnv('VERCEL_ENV', 'production');
    expect((await POST(request())).status).toBe(404);
  });
  it('accepts the configured HTTPS development origin behind a local proxy', async () => {
    enable();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://demo.example:8447');
    expect((await POST(request('https://demo.example:8447'))).status).toBe(200);
    expect((await POST(request('https://demo.example:8448'))).status).toBe(403);
    expect((await POST(request('http://demo.example:8447'))).status).toBe(403);
    expect(
      (await POST(request('https://demo.example.attacker.invalid:8447')))
        .status,
    ).toBe(403);
    vi.stubEnv('NODE_ENV', 'production');
    expect((await POST(request('https://demo.example:8447'))).status).toBe(403);
  });
  it('always dispatches the JS worker and cannot grant metadata mutation', async () => {
    enable();
    const response = await POST(request());
    expect(response.status).toBe(200);
    const { accessToken, runtime, url } = await response.json();
    expect(runtime).toBe('agents-js-spike');
    expect(url).toBe('wss://example.livekit.cloud');
    const token = await new TokenVerifier(
      'api-key',
      process.env.LIVEKIT_API_SECRET!,
    ).verify(accessToken);
    expect(token.sub).toBe('spike-user-test-user');
    expect(token.video?.canUpdateOwnMetadata).toBe(false);
    const config = token.roomConfig as {
      agents: { agentName: string; metadata: string }[];
    };
    expect(config.agents).toHaveLength(1);
    expect(config.agents[0].agentName).toBe('sexyvoice-js-spike');
    expect(JSON.parse(config.agents[0].metadata)).toMatchObject({
      userId: 'test-user',
      runtime: 'agents-js-spike',
    });
  });
});
