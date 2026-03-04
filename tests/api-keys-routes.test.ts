import { describe, expect, it, vi } from 'vitest';

import { DELETE } from '@/app/api/api-keys/[id]/route';
import { GET, POST } from '@/app/api/api-keys/route';
import { hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

describe('/api/api-keys routes', () => {
  it('lists current user API keys', async () => {
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
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'key-1',
              name: 'Production',
              key_prefix: 'sk_live_abc1',
              created_at: '2026-01-01T00:00:00.000Z',
              last_used_at: null,
              expires_at: null,
              is_active: true,
              permissions: { scopes: ['voice:generate'] },
              metadata: {},
            },
          ],
          error: null,
        }),
      })),
    } as never);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toHaveLength(1);
  });

  it('creates a new API key and returns secret once', async () => {
    vi.mocked(hasUserPaid).mockResolvedValueOnce(true);
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === 'api_keys') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'key-1',
                name: 'Prod',
                key_prefix: 'sk_live_abc1',
                created_at: '2026-01-01T00:00:00.000Z',
                last_used_at: null,
                expires_at: null,
                is_active: true,
                permissions: { scopes: ['voice:generate'] },
                metadata: {},
              },
              error: null,
            }),
          };
        }

        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
      }),
    } as never);

    const request = new Request('http://localhost/api/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Prod' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.key).toMatch(/^sk_live_[A-Za-z0-9]{32}$/);
    expect(json.data.key_prefix).toHaveLength(12);
  });

  it('deactivates API key', async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: [{ id: 'key-1' }],
          error: null,
        }),
      })),
    } as never);

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'key-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('returns 404 when key does not exist or belongs to another user', async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        // Zero rows matched — wrong id or different owner
        select: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      })),
    } as never);

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'non-existent-key-id' }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe('API key not found');
  });

  it('returns 500 when the database update fails', async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user-id' } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'DB connection lost', code: '08006' },
        }),
      })),
    } as never);

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'key-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe('Failed to deactivate API key');
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: 'Not authenticated' },
        }),
      },
      from: vi.fn(),
    } as never);

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'key-1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });
});
