import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/v1/billing/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { mockRatelimitLimit } from './setup';

const TEST_API_KEY = 'sk_live_Abc123Def456Ghi789Jkl012Mno345Pq';
const TEST_AUTH_HEADER = `Bearer ${TEST_API_KEY}`;

describe('/api/v1/billing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when API key is missing', async () => {
    const request = new Request('http://localhost/api/v1/billing', {
      method: 'GET',
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe('invalid_api_key');
    expect(response.headers.get('request-id')).toBeTruthy();
  });

  it('returns billing balance and latest purchase/topup transaction', async () => {
    const creditsEq = vi.fn().mockReturnThis();
    const creditsMaybeSingle = vi.fn().mockResolvedValue({
      data: { amount: 1234, updated_at: '2026-03-03T10:00:00.000Z' },
      error: null,
    });
    const apiKeysEq = vi.fn().mockReturnThis();
    const apiKeysMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'test-api-key-id',
        user_id: 'test-user-id',
        key_hash: 'test-key-hash',
        is_active: true,
        expires_at: null,
      },
      error: null,
    });
    const creditTransactionsEq = vi.fn().mockReturnThis();
    const creditTransactionsIn = vi.fn().mockReturnThis();
    const creditTransactionsOrder = vi.fn().mockReturnThis();
    const creditTransactionsLimit = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'txn_1',
          type: 'topup',
          amount: 500,
          description: 'Top-up package',
          created_at: '2026-03-01T09:00:00.000Z',
          reference_id: 'pi_123',
          subscription_id: null,
          metadata: { package: 'starter' },
        },
      ],
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === 'api_keys') {
        return {
          select: vi.fn().mockReturnValue({
            eq: apiKeysEq,
            maybeSingle: apiKeysMaybeSingle,
          }),
        };
      }
      if (table === 'credits') {
        return {
          select: vi.fn().mockReturnValue({
            eq: creditsEq,
            maybeSingle: creditsMaybeSingle,
          }),
        };
      }
      if (table === 'credit_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: creditTransactionsEq,
            in: creditTransactionsIn,
            order: creditTransactionsOrder,
            limit: creditTransactionsLimit,
          }),
        };
      }
      return {
        select: vi.fn(),
      };
    });

    const adminClientMock = {
      from,
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as never;
    vi.mocked(createAdminClient)
      .mockReturnValueOnce(adminClientMock)
      .mockReturnValueOnce(adminClientMock);

    const request = new Request('http://localhost/api/v1/billing', {
      method: 'GET',
      headers: {
        authorization: TEST_AUTH_HEADER,
      },
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.creditsLeft).toBe(1234);
    expect(json.lastUpdated).toBe('2026-03-03T10:00:00.000Z');
    expect(json.userId).toBe('test-user-id');
    expect(json.lastBillingTransaction?.id).toBe('txn_1');
    expect(json.lastBillingTransaction?.type).toBe('topup');
    expect(response.headers.get('request-id')).toMatch(/^req_sv_[0-9a-f]{32}$/);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockRatelimitLimit.mockResolvedValueOnce({
      success: false,
      limit: 60,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const request = new Request('http://localhost/api/v1/billing', {
      method: 'GET',
      headers: {
        authorization: TEST_AUTH_HEADER,
      },
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.error.code).toBe('rate_limit_exceeded');
  });
});
