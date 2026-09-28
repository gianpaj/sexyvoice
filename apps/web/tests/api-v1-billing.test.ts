import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/v1/billing/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { mockRatelimitLimit } from './setup';

const TEST_API_KEY_SUFFIX = 'A'.repeat(32);
const TEST_API_KEY = `sk_live_${TEST_API_KEY_SUFFIX}`;
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
        expires_at: null,
        id: 'test-api-key-id',
        is_active: true,
        key_hash: 'test-key-hash',
        user_id: 'test-user-id',
      },
      error: null,
    });
    const creditTransactionsEq = vi.fn().mockReturnThis();
    const creditTransactionsIn = vi.fn().mockReturnThis();
    const creditTransactionsOrder = vi.fn().mockReturnThis();
    const creditTransactionsLimit = vi.fn().mockResolvedValue({
      data: [
        {
          amount: 500,
          created_at: '2026-03-01T09:00:00.000Z',
          description: 'Top-up package',
          id: 'txn_1',
          metadata: { package: 'starter' },
          reference_id: 'pi_123',
          subscription_id: null,
          type: 'topup',
        },
      ],
      error: null,
    });
    const apiKeysOr = vi
      .fn()
      .mockReturnValue({ maybeSingle: apiKeysMaybeSingle });
    apiKeysEq.mockReturnValue({ eq: apiKeysEq, or: apiKeysOr });
    const from = vi.fn((table: string) => {
      if (table === 'api_keys') {
        return {
          select: vi.fn().mockReturnValue({ eq: apiKeysEq }),
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
            limit: creditTransactionsLimit,
            order: creditTransactionsOrder,
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
      headers: {
        authorization: TEST_AUTH_HEADER,
      },
      method: 'GET',
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
      limit: 60,
      remaining: 0,
      reset: Date.now() + 60_000,
      success: false,
    });

    const request = new Request('http://localhost/api/v1/billing', {
      headers: {
        authorization: TEST_AUTH_HEADER,
      },
      method: 'GET',
    });

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.error.code).toBe('rate_limit_exceeded');
  });
});
