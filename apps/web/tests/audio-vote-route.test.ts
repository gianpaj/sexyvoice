import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from '@/app/api/audio-vote/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const mocks = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  ratelimitLimit: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: vi.fn(() => ({})),
  },
}));

vi.mock('@upstash/ratelimit', () => {
  class Ratelimit {
    static slidingWindow = vi.fn(() => ({}));
    limit = mocks.ratelimitLimit;
  }
  return { Ratelimit };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

const AUDIO_URL = 'https://files.sexyvoice.ai/generated-audio/test-abc123.wav';

function postRequest(body: unknown) {
  return new Request('http://localhost/api/audio-vote', {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

function getRequest(audioUrl?: string) {
  const query = audioUrl ? `?audioUrl=${encodeURIComponent(audioUrl)}` : '';
  return new Request(`http://localhost/api/audio-vote${query}`, {
    method: 'GET',
  });
}

function mockSession(user: { id: string } | null = { id: 'test-user-id' }) {
  const sessionSupabase = {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: user && { email: 'user@example.com', sub: user.id } },
        error: null,
      }),
      getUser: vi.fn(),
    },
  };
  vi.mocked(createClient).mockResolvedValue(sessionSupabase as never);
  return sessionSupabase;
}

function mockAdmin() {
  const adminSupabase = { rpc: mocks.adminRpc };
  vi.mocked(createAdminClient).mockReturnValue(adminSupabase as never);
  return adminSupabase;
}

describe('POST /api/audio-vote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminRpc.mockReset().mockResolvedValue({ data: 1, error: null });
    mocks.ratelimitLimit.mockReset().mockResolvedValue({ success: true });
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects unauthenticated requests before data access', async () => {
    mockSession(null);

    const response = await POST(
      postRequest({ audioUrl: AUDIO_URL, vote: 'up' }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'Unauthorized' });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid JSON', '{nope'],
    ['missing audioUrl', { vote: 'up' }],
    ['empty audioUrl', { audioUrl: '', vote: 'up' }],
    ['missing vote', { audioUrl: AUDIO_URL }],
    ['invalid vote', { audioUrl: AUDIO_URL, vote: 'yes' }],
    ['non-string audioUrl', { audioUrl: 42, vote: 'up' }],
  ])('rejects %s with 400', async (_name, body) => {
    mockSession();

    const response = await POST(postRequest(body));

    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects requests once the rate limit is spent', async () => {
    mockSession();
    mocks.ratelimitLimit.mockResolvedValue({ success: false });

    const response = await POST(
      postRequest({ audioUrl: AUDIO_URL, vote: 'up' }),
    );

    expect(response.status).toBe(429);
    expect(mocks.ratelimitLimit).toHaveBeenCalledWith('test-user-id');
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('records an upvote through the atomic vote RPC', async () => {
    mockSession();
    mockAdmin();
    mocks.adminRpc.mockResolvedValue({ data: 6, error: null });

    const response = await POST(
      postRequest({ audioUrl: AUDIO_URL, vote: 'up' }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, totalVotes: 6 });
    expect(mocks.adminRpc).toHaveBeenCalledTimes(1);
    expect(mocks.adminRpc).toHaveBeenCalledWith('record_audio_vote', {
      p_audio_url: AUDIO_URL,
      p_user_id: 'test-user-id',
      p_vote: 'up',
    });
  });

  it('clears a vote by omitting p_vote so the RPC default applies', async () => {
    mockSession();
    mockAdmin();
    mocks.adminRpc.mockResolvedValue({ data: 4, error: null });

    const response = await POST(
      postRequest({ audioUrl: AUDIO_URL, vote: null }),
    );

    expect(response.status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenCalledWith('record_audio_vote', {
      p_audio_url: AUDIO_URL,
      p_user_id: 'test-user-id',
      p_vote: undefined,
    });
  });

  it('retries while the background insert lags, then returns 404', async () => {
    vi.useFakeTimers();
    mockSession();
    mockAdmin();
    mocks.adminRpc.mockResolvedValue({ data: null, error: null });

    const pending = POST(postRequest({ audioUrl: AUDIO_URL, vote: 'up' }));
    // Generation writes its row in after(); the route retries past the delays.
    await vi.advanceTimersByTimeAsync(15_000);
    const response = await pending;

    expect(response.status).toBe(404);
    expect(mocks.adminRpc.mock.calls.length).toBeGreaterThan(1);
  });

  it('applies the vote once the delayed insert lands', async () => {
    vi.useFakeTimers();
    mockSession();
    mockAdmin();
    mocks.adminRpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValue({ data: 3, error: null });

    const pending = POST(postRequest({ audioUrl: AUDIO_URL, vote: 'up' }));
    await vi.advanceTimersByTimeAsync(1000);
    const response = await pending;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, totalVotes: 3 });
    expect(mocks.adminRpc).toHaveBeenCalledTimes(2);
  });

  it('returns 500 when the vote RPC fails', async () => {
    mockSession();
    mockAdmin();
    mocks.adminRpc.mockResolvedValue({
      data: null,
      error: { message: 'rpc failed' },
    });

    const response = await POST(
      postRequest({ audioUrl: AUDIO_URL, vote: 'up' }),
    );

    expect(response.status).toBe(500);
  });
});

describe('GET /api/audio-vote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminRpc.mockReset().mockResolvedValue({ data: null, error: null });
    mocks.ratelimitLimit.mockReset().mockResolvedValue({ success: true });
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
  });

  it('rejects unauthenticated requests', async () => {
    mockSession(null);

    const response = await GET(getRequest(AUDIO_URL));

    expect(response.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a missing audioUrl with 400', async () => {
    mockSession();

    const response = await GET(getRequest());

    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("returns the caller's stored vote", async () => {
    mockSession();
    mockAdmin();
    mocks.adminRpc.mockResolvedValue({ data: 'down', error: null });

    const response = await GET(getRequest(AUDIO_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ vote: 'down' });
    expect(mocks.adminRpc).toHaveBeenCalledWith('get_audio_vote', {
      p_audio_url: AUDIO_URL,
      p_user_id: 'test-user-id',
    });
  });

  it('returns a null vote for unrated or unknown audio', async () => {
    mockSession();
    mockAdmin();

    const response = await GET(getRequest(AUDIO_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ vote: null });
  });

  it('rejects requests once the rate limit is spent', async () => {
    mockSession();
    mocks.ratelimitLimit.mockResolvedValue({ success: false });

    const response = await GET(getRequest(AUDIO_URL));

    expect(response.status).toBe(429);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('returns 500 when the lookup RPC fails', async () => {
    mockSession();
    mockAdmin();
    mocks.adminRpc.mockResolvedValue({
      data: null,
      error: { message: 'rpc failed' },
    });

    const response = await GET(getRequest(AUDIO_URL));

    expect(response.status).toBe(500);
  });
});
