import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/usage-events/route';
import { createClient } from '@/lib/supabase/server';
import {
  getAllTimeUsageSummary,
  getMonthlyUsageSummary,
  getUsageEventsPaginated,
} from '@/lib/supabase/usage-queries';

vi.mock('@/lib/supabase/usage-queries', () => ({
  getAllTimeUsageSummary: vi.fn(),
  getMonthlyUsageSummary: vi.fn(),
  getUsageEventsPaginated: vi.fn(),
}));

function request(query = '') {
  return {
    nextUrl: new URL(`http://localhost/api/usage-events${query}`),
  } as never;
}

function mockClient(result: unknown) {
  const client = {
    auth: { getClaims: vi.fn().mockResolvedValue(result), getUser: vi.fn() },
    from: vi.fn(),
  };
  vi.mocked(createClient).mockResolvedValueOnce(client as never);
  return client;
}

function expectNoDataAccess() {
  expect(getUsageEventsPaginated).not.toHaveBeenCalled();
  expect(getMonthlyUsageSummary).not.toHaveBeenCalled();
  expect(getAllTimeUsageSummary).not.toHaveBeenCalled();
}

describe('GET /api/usage-events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes events and both summaries to verified claims without getUser', async () => {
    const client = mockClient({
      data: { claims: { sub: 'claims-user' } },
      error: null,
    });
    vi.mocked(getUsageEventsPaginated).mockResolvedValueOnce({
      data: [],
      totalCount: 21,
    });
    const summary = {
      bySourceType: {
        api_tts: { count: 21, credits: 42 },
        api_voice_cloning: { count: 0, credits: 0 },
        audio_processing: { count: 0, credits: 0 },
        live_call: { count: 0, credits: 0 },
        tts: { count: 0, credits: 0 },
        voice_cloning: { count: 0, credits: 0 },
      },
      totalCredits: 42,
      totalOperations: 21,
    };
    vi.mocked(getMonthlyUsageSummary).mockResolvedValueOnce(summary);
    vi.mocked(getAllTimeUsageSummary).mockResolvedValueOnce(summary);

    const response = await GET(
      request('?page=2&pageSize=10&sourceType=api_tts&includeSummary=true'),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      allTimeSummary: summary,
      data: [],
      monthlySummary: summary,
      page: 2,
      pageSize: 10,
      totalCount: 21,
      totalPages: 3,
    });
    expect(getUsageEventsPaginated).toHaveBeenCalledWith(
      client,
      'claims-user',
      {
        page: 2,
        pageSize: 10,
        sourceType: 'api_tts',
      },
    );
    expect(getMonthlyUsageSummary).toHaveBeenCalledWith(client, 'claims-user');
    expect(getAllTimeUsageSummary).toHaveBeenCalledWith(client, 'claims-user');
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });

  it.each([
    ['missing data', { data: null, error: null }],
    ['missing claims', { data: { claims: null }, error: null }],
    ['missing subject', { data: { claims: {} }, error: null }],
    ['empty subject', { data: { claims: { sub: '' } }, error: null }],
    ['invalid token', { data: null, error: { message: 'Invalid JWT' } }],
    [
      'SDK error with claims',
      {
        data: { claims: { sub: 'claims-user' } },
        error: { message: 'Verification failed' },
      },
    ],
  ])('rejects %s before data access', async (_name, result) => {
    const client = mockClient(result);
    const response = await GET(request('?includeSummary=true'));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'Unauthorized' });
    expect(client.from).not.toHaveBeenCalled();
    expectNoDataAccess();
  });

  it.each(['?page=nope', '?pageSize=nope', '?sourceType=invalid'])(
    'preserves query validation for %s',
    async (query) => {
      mockClient({ data: { claims: { sub: 'claims-user' } }, error: null });
      expect((await GET(request(query))).status).toBe(400);
      expectNoDataAccess();
    },
  );

  it('returns 500 when the usage query fails', async () => {
    mockClient({ data: { claims: { sub: 'claims-user' } }, error: null });
    vi.mocked(getUsageEventsPaginated).mockRejectedValueOnce(
      new Error('DB unavailable'),
    );

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: 'Failed to fetch usage events',
    });
  });
});
