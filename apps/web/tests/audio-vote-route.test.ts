import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from '@/app/api/audio-vote/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const mocks = vi.hoisted(() => ({
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

function mockAdmin({
  lookupResults = [
    { data: [{ id: 'audio-file-id', total_votes: 0 }], error: null },
  ],
  updateError = null,
}: {
  lookupResults?: Array<{ data: unknown; error: unknown }>;
  updateError?: unknown;
} = {}) {
  const remainingLookups = [...lookupResults];
  const select = vi.fn(() => {
    const query = {
      eq: vi.fn(),
      limit: vi.fn(),
      match: vi.fn(),
      order: vi.fn(),
    };
    query.eq.mockReturnValue(query);
    query.match.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockImplementation(async () =>
      remainingLookups.length > 0
        ? remainingLookups.shift()
        : { data: [], error: null },
    );
    return query;
  });
  const update = vi.fn(() => {
    const query = {
      eq: vi.fn(),
      then: (
        onFulfilled?: (value: { error: unknown }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) =>
        Promise.resolve({ error: updateError }).then(onFulfilled, onRejected),
    };
    query.eq.mockReturnValue(query);
    return query;
  });
  const adminSupabase = { from: vi.fn(() => ({ select, update })) };
  vi.mocked(createAdminClient).mockReturnValue(adminSupabase as never);
  return { adminSupabase, select, update };
}

describe('POST /api/audio-vote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it.each([
    ['up', 1],
    ['down', -1],
    [null, 0],
  ])('sets total_votes to %s for a %j vote', async (vote, expectedVotes) => {
    mockSession();
    const { select, update } = mockAdmin();

    const response = await POST(postRequest({ audioUrl: AUDIO_URL, vote }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      totalVotes: expectedVotes,
    });
    const lookup = select.mock.results[0].value;
    expect(lookup.eq).toHaveBeenCalledWith('url', AUDIO_URL);
    expect(lookup.match).toHaveBeenCalledWith({
      status: 'active',
      user_id: 'test-user-id',
    });
    expect(update).toHaveBeenCalledWith({ total_votes: expectedVotes });
    const updateQuery = update.mock.results[0].value;
    expect(updateQuery.eq).toHaveBeenCalledWith('id', 'audio-file-id');
    expect(updateQuery.eq).toHaveBeenCalledWith('user_id', 'test-user-id');
  });

  it('retries while the background insert lags, then returns 404', async () => {
    vi.useFakeTimers();
    mockSession();
    const { select } = mockAdmin({ lookupResults: [] });

    const pending = POST(postRequest({ audioUrl: AUDIO_URL, vote: 'up' }));
    await vi.advanceTimersByTimeAsync(15_000);
    const response = await pending;

    expect(response.status).toBe(404);
    expect(select).toHaveBeenCalledTimes(6);
  });

  it('applies the vote once the delayed insert lands', async () => {
    vi.useFakeTimers();
    mockSession();
    mockAdmin({
      lookupResults: [
        { data: [], error: null },
        { data: [{ id: 'audio-file-id', total_votes: 0 }], error: null },
      ],
    });

    const pending = POST(postRequest({ audioUrl: AUDIO_URL, vote: 'up' }));
    await vi.advanceTimersByTimeAsync(1000);
    const response = await pending;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, totalVotes: 1 });
  });

  it('returns 500 when the audio lookup fails', async () => {
    mockSession();
    mockAdmin({
      lookupResults: [{ data: null, error: { message: 'lookup failed' } }],
    });

    const response = await POST(
      postRequest({ audioUrl: AUDIO_URL, vote: 'up' }),
    );

    expect(response.status).toBe(500);
  });

  it('returns 500 when the vote update fails', async () => {
    mockSession();
    mockAdmin({ updateError: { message: 'update failed' } });

    const response = await POST(
      postRequest({ audioUrl: AUDIO_URL, vote: 'up' }),
    );

    expect(response.status).toBe(500);
  });
});

describe('GET /api/audio-vote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it.each([
    [1, 'up'],
    [-1, 'down'],
    [0, null],
    [7, null],
  ])('maps total_votes %s to %s', async (totalVotes, expectedVote) => {
    mockSession();
    mockAdmin({
      lookupResults: [
        {
          data: [{ id: 'audio-file-id', total_votes: totalVotes }],
          error: null,
        },
      ],
    });

    const response = await GET(getRequest(AUDIO_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ vote: expectedVote });
  });

  it('returns a null vote for unknown audio', async () => {
    mockSession();
    mockAdmin({ lookupResults: [{ data: [], error: null }] });

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

  it('returns 500 when the lookup fails', async () => {
    mockSession();
    mockAdmin({
      lookupResults: [{ data: null, error: { message: 'lookup failed' } }],
    });

    const response = await GET(getRequest(AUDIO_URL));

    expect(response.status).toBe(500);
  });
});
