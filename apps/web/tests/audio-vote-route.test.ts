import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/audio-vote/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const mocks = vi.hoisted(() => ({
  redisDel: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: vi.fn(() => ({
      del: mocks.redisDel,
      get: mocks.redisGet,
      set: mocks.redisSet,
    })),
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

const AUDIO_URL = 'https://files.sexyvoice.ai/generated-audio/test-abc123.wav';
const VOTE_KEY = `audio-vote:test-user-id:${AUDIO_URL}`;

function request(body: unknown) {
  return new Request('http://localhost/api/audio-vote', {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
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

/**
 * One builder covers both the lookup chain
 * (`.select().eq().eq().maybeSingle()` → `lookup`) and the update chain
 * (`.update().eq()` awaited directly → `update` via `then`).
 */
function mockAdmin({
  lookup,
  update = { data: null, error: null },
}: {
  lookup: { data: unknown; error: unknown };
  update?: { data: unknown; error: unknown };
}) {
  const query = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(lookup),
    select: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown) => resolve(update),
    update: vi.fn().mockReturnThis(),
  };
  const adminSupabase = { from: vi.fn().mockReturnValue(query) };
  vi.mocked(createAdminClient).mockReturnValue(adminSupabase as never);
  return { adminSupabase, query };
}

describe('POST /api/audio-vote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // mockReset also drops implementations a previous test installed.
    mocks.redisGet.mockReset().mockResolvedValue(null);
    mocks.redisSet.mockReset().mockResolvedValue('OK');
    mocks.redisDel.mockReset().mockResolvedValue(1);
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects unauthenticated requests before data access', async () => {
    mockSession(null);

    const response = await POST(request({ audioUrl: AUDIO_URL, vote: 'up' }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'Unauthorized' });
    expect(mocks.redisGet).not.toHaveBeenCalled();
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

    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('adds an upvote to total_votes and stores it in Redis', async () => {
    mockSession();
    const { adminSupabase, query } = mockAdmin({
      lookup: { data: { id: 'audio-1', total_votes: 5 }, error: null },
    });

    const response = await POST(request({ audioUrl: AUDIO_URL, vote: 'up' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, totalVotes: 6 });
    expect(adminSupabase.from).toHaveBeenCalledWith('audio_files');
    expect(query.select).toHaveBeenCalledWith('id, total_votes');
    expect(query.eq).toHaveBeenCalledWith('url', AUDIO_URL);
    expect(query.eq).toHaveBeenCalledWith('status', 'active');
    expect(query.update).toHaveBeenCalledWith({ total_votes: 6 });
    expect(query.eq).toHaveBeenCalledWith('id', 'audio-1');
    expect(mocks.redisSet).toHaveBeenCalledWith(VOTE_KEY, 'up');
  });

  it('applies a downvote as -1', async () => {
    mockSession();
    const { query } = mockAdmin({
      lookup: { data: { id: 'audio-1', total_votes: 5 }, error: null },
    });

    const response = await POST(
      request({ audioUrl: AUDIO_URL, vote: 'down' }),
    );

    expect(response.status).toBe(200);
    expect(query.update).toHaveBeenCalledWith({ total_votes: 4 });
    expect(mocks.redisSet).toHaveBeenCalledWith(VOTE_KEY, 'down');
  });

  it('removes the previous delta when a vote is toggled off', async () => {
    mockSession();
    mocks.redisGet.mockResolvedValue('up');
    const { query } = mockAdmin({
      lookup: { data: { id: 'audio-1', total_votes: 5 }, error: null },
    });

    const response = await POST(
      request({ audioUrl: AUDIO_URL, vote: null }),
    );

    expect(response.status).toBe(200);
    expect(query.update).toHaveBeenCalledWith({ total_votes: 4 });
    expect(mocks.redisDel).toHaveBeenCalledWith(VOTE_KEY);
  });

  it('applies a two-point swing when switching from down to up', async () => {
    mockSession();
    mocks.redisGet.mockResolvedValue('down');
    const { query } = mockAdmin({
      lookup: { data: { id: 'audio-1', total_votes: 5 }, error: null },
    });

    const response = await POST(request({ audioUrl: AUDIO_URL, vote: 'up' }));

    expect(response.status).toBe(200);
    expect(query.update).toHaveBeenCalledWith({ total_votes: 7 });
    expect(mocks.redisSet).toHaveBeenCalledWith(VOTE_KEY, 'up');
  });

  it('is a no-op when the stored vote already matches', async () => {
    mockSession();
    mocks.redisGet.mockResolvedValue('up');

    const response = await POST(request({ audioUrl: AUDIO_URL, vote: 'up' }));

    expect(response.status).toBe(200);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });

  it('returns 404 when no active audio file owns the URL', async () => {
    vi.useFakeTimers();
    mockSession();
    mockAdmin({ lookup: { data: null, error: null } });

    const pending = POST(request({ audioUrl: AUDIO_URL, vote: 'up' }));
    // Generation writes its row in after(); the route retries past the delays.
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await pending;

    expect(response.status).toBe(404);
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });

  it('returns 500 when the vote update fails', async () => {
    mockSession();
    mockAdmin({
      lookup: { data: { id: 'audio-1', total_votes: 5 }, error: null },
      update: { data: null, error: { message: 'update failed' } },
    });

    const response = await POST(request({ audioUrl: AUDIO_URL, vote: 'up' }));

    expect(response.status).toBe(500);
  });
});
