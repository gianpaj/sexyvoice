import { Room } from '@livekit/protocol';
import { RoomServiceClient, TokenVerifier } from 'livekit-server-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/lib/supabase/auth', () => ({
  getVerifiedClaims: vi.fn(),
}));

import { POST } from '@/app/api/voice-spike/call-token/route';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});
const voiceId = '63765019-12dc-46b6-85e3-dd8b5238c9a0';
const request = (origin = 'https://example.com', body?: string) =>
  new Request('https://example.com/api/voice-spike/call-token', {
    method: 'POST',
    headers: { origin },
    body,
  });
function enable() {
  vi.mocked(getVerifiedClaims).mockResolvedValue({
    sub: 'test-user',
    iss: 'https://example.com/auth/v1',
    aud: 'authenticated',
    exp: 9_999_999_999,
    iat: 1,
    role: 'authenticated',
    aal: 'aal1',
    session_id: 'test-session',
  });
  vi.stubEnv('VOICE_SPIKE_USER_IDS', 'test-user');
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('LIVEKIT_URL', 'wss://example.livekit.cloud');
  vi.stubEnv('LIVEKIT_API_KEY', 'api-key');
  vi.stubEnv('LIVEKIT_API_SECRET', 'a-long-test-secret-at-least-32-characters');
  vi.stubEnv('LIVEKIT_AGENT_NAME', 'sexycall');
}
function mockVoiceLookup(data: { voice_id: string } | null, error?: Error) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  const from = vi.fn().mockReturnValue(query);
  vi.mocked(createClient).mockResolvedValue({ from } as unknown as Awaited<
    ReturnType<typeof createClient>
  >);
  return { from, query };
}
const requestVoice = (id: string) =>
  request(undefined, JSON.stringify({ audioReferenceId: id }));

describe('JS spike call dispatch', () => {
  it('accepts a bodyless POST represented by an empty request stream', async () => {
    enable();
    const emptyRequest = request(undefined, '');
    expect(emptyRequest.body).not.toBeNull();
    expect((await POST(emptyRequest)).status).toBe(200);
  });

  it('dispatches only the authenticated owner’s Inworld voice outside the browser token', async () => {
    enable();
    const { from, query } = mockVoiceLookup({ voice_id: 'workspace__clone' });
    const createRoom = vi
      .spyOn(RoomServiceClient.prototype, 'createRoom')
      .mockResolvedValue(new Room());
    const response = await POST(requestVoice(voiceId));

    expect(response.status).toBe(200);
    const payload = await response.json();
    const token = await new TokenVerifier(
      'api-key',
      process.env.LIVEKIT_API_SECRET!,
    ).verify(payload.accessToken);
    expect(from).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith('audio_references');
    expect(query.eq.mock.calls).toEqual([
      ['id', voiceId],
      ['user_id', 'test-user'],
      ['provider', 'inworld'],
    ]);
    expect(createRoom).toHaveBeenCalledOnce();
    const room = createRoom.mock.calls[0][0];
    expect(room).toMatchObject({
      name: token.video?.room,
      emptyTimeout: 30,
      maxParticipants: 2,
      agents: [{ agentName: 'sexyvoice-js-spike' }],
    });
    expect(JSON.parse(room.agents?.[0].metadata ?? '')).toMatchObject({
      runtime: 'agents-js-spike',
      userId: 'test-user',
      inworldVoiceId: 'workspace__clone',
    });
    expect(JSON.stringify(payload)).not.toContain('workspace__clone');
    expect(JSON.stringify(token)).not.toContain('workspace__clone');
  });

  it('fails when the saved voice is unavailable or the lookup fails', async () => {
    enable();
    const createRoom = vi.spyOn(RoomServiceClient.prototype, 'createRoom');
    const { query } = mockVoiceLookup(null);
    expect((await POST(requestVoice(voiceId))).status).toBe(404);
    query.maybeSingle.mockResolvedValueOnce({ data: { voice_id: '' } });
    expect((await POST(requestVoice(voiceId))).status).toBe(404);
    query.maybeSingle.mockResolvedValueOnce({
      error: new Error('database unavailable'),
    });
    expect((await POST(requestVoice(voiceId))).status).toBe(503);
    expect(createRoom).not.toHaveBeenCalled();
  });

  it('does not mint a usable token when room creation fails', async () => {
    enable();
    mockVoiceLookup({ voice_id: 'workspace__clone' });
    vi.spyOn(RoomServiceClient.prototype, 'createRoom').mockRejectedValue(
      new Error('LiveKit unavailable'),
    );
    const response = await POST(requestVoice(voiceId));
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('accessToken');
  });

  it('rejects invalid UUIDs, malformed JSON, and browser-supplied provider IDs', async () => {
    enable();
    const { from } = mockVoiceLookup(null);
    expect((await POST(requestVoice('workspace__clone'))).status).toBe(400);
    expect((await POST(request(undefined, '{'))).status).toBe(400);
    expect(
      (
        await POST(
          request(
            undefined,
            JSON.stringify({ inworldVoiceId: 'workspace__clone' }),
          ),
        )
      ).status,
    ).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });
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
