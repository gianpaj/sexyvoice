import { describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/billing/usage/route';
import { createClient } from '@/lib/supabase/server';

const mockGetUser = vi.fn();

describe('/api/billing/usage', () => {
  it('returns 401 for unauthenticated users', async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: null },
          error: { message: 'Not authenticated' },
        }),
        getUser: mockGetUser,
      },
    } as never);

    const request = new Request('http://localhost/api/billing/usage');
    const response = await GET(request as never);

    expect(response.status).toBe(401);
  });

  it('returns bucketed billing usage data', async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'test-user-id' } },
          error: null,
        }),
        getUser: mockGetUser,
      },
      from: vi.fn(() => ({
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [
            {
              api_key_id: 'key-1',
              model: 'gpro',
              requests: 2,
              source_type: 'api_tts',
              total_credits_used: 40,
              total_dollar_amount: 0.05,
              total_duration_seconds: 0,
              total_input_chars: 200,
              total_output_chars: 0,
              usage_date: '2026-02-25T00:00:00.000Z',
              user_id: 'test-user-id',
            },
          ],
          error: null,
        }),
        select: vi.fn().mockReturnThis(),
      })),
    } as never);

    const request = new Request(
      'http://localhost/api/billing/usage?starting_on=2026-02-23&ending_before=2026-03-03&group_by=api_key_id&bucket_width=1d',
    );
    const response = await GET({
      ...request,
      nextUrl: new URL(request.url),
    } as never);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(json.object).toBe('list');
    expect(json.data).toHaveLength(1);
    expect(json.data[0].results[0].api_key_id).toBe('key-1');
    expect(json.data[0].results[0].requests).toBe(2);
    expect(json.data[0].results[0]).not.toHaveProperty('total_dollar_amount');
  });

  it('accepts api_voice_cloning as source_type filter', async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: 'test-user-id' } },
          error: null,
        }),
        getUser: mockGetUser,
      },
      from: vi.fn(() => ({
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
        select: vi.fn().mockReturnThis(),
      })),
    } as never);

    const request = new Request(
      'http://localhost/api/billing/usage?source_type=api_voice_cloning',
    );
    const response = await GET({
      ...request,
      nextUrl: new URL(request.url),
    } as never);

    expect(response.status).toBe(200);
  });
});

describe.each([
  [
    'GET',
    () => GET(new Request('http://localhost/api/billing/usage') as never),
  ],
] as const)('%s claims authentication', (_method, invoke) => {
  it.each([
    ['missing data', { data: null, error: null }],
    ['missing claims', { data: { claims: null }, error: null }],
    ['missing subject', { data: { claims: {} }, error: null }],
    ['empty subject', { data: { claims: { sub: '' } }, error: null }],
    ['invalid token', { data: null, error: { message: 'Invalid JWT' } }],
    [
      'SDK error with claims',
      {
        data: { claims: { sub: 'test-user-id' } },
        error: { message: 'Verification failed' },
      },
    ],
  ])('rejects %s before data access', async (_name, result) => {
    vi.clearAllMocks();

    const from = vi.fn();
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { getClaims: vi.fn().mockResolvedValue(result), getUser: vi.fn() },
      from,
    } as never);

    const response = await invoke();

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'Unauthorized' });

    expect(from).not.toHaveBeenCalled();
  });
});
