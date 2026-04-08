import { describe, expect, it, vi } from 'vitest';

import { POST as redeemSession } from '@/app/api/cli-login-sessions/redeem/route';
import { POST as createSession } from '@/app/api/cli-login-sessions/route';
import { decryptCliApiKey, encryptCliApiKey } from '@/lib/api/cli-login';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

vi.mock('@/lib/api/rate-limit', () => ({
  consumeRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    limit: 60,
    remaining: 59,
    resetAt: new Date().toISOString(),
  }),
  createRateLimitHeaders: vi.fn().mockReturnValue(new Headers()),
}));

describe('/api/cli-login-sessions routes', () => {
  it('creates a localhost-bound CLI login session from an existing API key', async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null,
        }),
      },
    } as never);

    const adminFrom = vi
      .fn()
      .mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: 'existing-key-id',
            name: 'Production',
            expires_at: null,
            is_active: true,
            permissions: { scopes: ['voice:generate'] },
            metadata: { env: 'prod' },
          },
          error: null,
        }),
      }))
      .mockImplementationOnce(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'new-key-id' },
          error: null,
        }),
      }))
      .mockImplementationOnce(() => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      }));

    vi.mocked(createAdminClient).mockReturnValueOnce({
      from: adminFrom,
    } as never);

    const request = new Request('http://localhost/api/cli-login-sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key_id: '550e8400-e29b-41d4-a716-446655440000',
        callback_url: 'http://127.0.0.1:48123/callback',
        state: 'test-state',
      }),
    });

    const response = await createSession(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.redirect_url).toContain('http://127.0.0.1:48123/callback');
    expect(json.redirect_url).toContain('exchange_token=');
    expect(json.redirect_url).toContain('state=test-state');
    expect(adminFrom).toHaveBeenCalledWith('cli_login_sessions');
  });

  it('creates a new CLI key when no existing key is selected', async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null,
        }),
      },
    } as never);
    vi.mocked(hasUserPaid).mockResolvedValueOnce(true);

    const adminFrom = vi
      .fn()
      .mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn((resolve) => resolve({ count: 5, error: null })),
      }))
      .mockImplementationOnce(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'new-key-id' },
          error: null,
        }),
      }))
      .mockImplementationOnce(() => ({
        insert: vi.fn().mockResolvedValue({ error: null }),
      }));

    vi.mocked(createAdminClient).mockReturnValueOnce({
      from: adminFrom,
    } as never);

    const request = new Request('http://localhost/api/cli-login-sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        callback_url: 'http://localhost:48123/callback',
        name: 'CLI',
        state: 'test-state',
      }),
    });

    const response = await createSession(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.redirect_url).toContain('exchange_token=');
  });

  it('rejects non-localhost callback URLs', async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null,
        }),
      },
    } as never);

    const request = new Request('http://localhost/api/cli-login-sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        callback_url: 'https://evil.example/callback',
        name: 'CLI',
        state: 'test-state',
      }),
    });

    const response = await createSession(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('localhost');
  });

  it('redeems a CLI login session once and clears the stored secret', async () => {
    const encrypted = encryptCliApiKey(
      'sk_test_Abc123Def456Ghi789Jkl012Mno345Pq',
    );

    const adminFrom = vi
      .fn()
      .mockImplementationOnce(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: 'session-id',
            encrypted_api_key: encrypted,
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            redeemed_at: null,
            new_api_key_id: 'new-key-id',
            old_api_key_id: 'old-key-id',
            user_id: 'test-user-id',
          },
          error: null,
        }),
      }))
      .mockImplementationOnce(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'session-id' },
          error: null,
        }),
      }))
      .mockImplementationOnce(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn((resolve) => resolve({ error: null })),
      }));

    vi.mocked(createAdminClient).mockReturnValueOnce({
      from: adminFrom,
    } as never);

    const request = new Request(
      'http://localhost/api/cli-login-sessions/redeem',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ exchange_token: 'token-for-tests' }),
      },
    );

    const response = await redeemSession(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.api_key_id).toBe('new-key-id');
    expect(json.key).toMatch(/^sk_test_/);
    expect(decryptCliApiKey(encrypted)).toBe(json.key);
  });
});
