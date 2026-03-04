import { describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/billing/usage/route';
import { createClient } from '@/lib/supabase/server';

describe('/api/billing/usage', () => {
  it('returns 401 for unauthenticated users', async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    } as never);

    const request = new Request('http://localhost/api/billing/usage');
    const response = await GET(request as never);

    expect(response.status).toBe(401);
  });

  it('returns bucketed billing usage data', async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [
            {
              user_id: 'test-user-id',
              usage_date: '2026-02-25T00:00:00.000Z',
              source_type: 'api_tts',
              api_key_id: 'key-1',
              model: 'gpro',
              requests: 2,
              total_input_chars: 200,
              total_output_chars: 0,
              total_duration_seconds: 0,
              total_dollar_amount: 0.05,
              total_credits_used: 40,
            },
          ],
          error: null,
        }),
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
    expect(json.object).toBe('list');
    expect(json.data).toHaveLength(1);
    expect(json.data[0].results[0].api_key_id).toBe('key-1');
    expect(json.data[0].results[0].requests).toBe(2);
  });

  it('accepts api_voice_cloning as source_type filter', async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
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
