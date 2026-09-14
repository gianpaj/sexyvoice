import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock state – declared before vi.mock() so the factory can reference it.
// Vitest hoists vi.mock() above these declarations, so every variable the
// factory closes over is `mock`-prefixed per Vitest's convention.
// ---------------------------------------------------------------------------
const mockUser = {
  email: 'test@example.com',
  id: 'a1b2c3d4-5678-4abc-9def-012345678901',
};
const mockGetUser = vi.fn();
let mockIsAuthenticated = true;
let mockAuthError: { message: string } | null = null;
let mockDeleteError: { message: string } | null = null;
let mockDeletedRows: Array<{ id: number }> = [];

// Capture the table name and user_id filter the route applies, so we can
// assert the erasure is correctly scoped to the authenticated user.
const mockCalls = {
  filter: null as { column: string; value: unknown } | null,
  table: null as string | null,
};

// ---------------------------------------------------------------------------
// Supabase client mock – a tiny chainable builder matching the route's
// `from('agent_memories').delete().eq('user_id', id).select('id')` call.
// ---------------------------------------------------------------------------
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getClaims: vi.fn(() => {
          if (mockAuthError) {
            return Promise.resolve({
              data: { claims: null },
              error: mockAuthError,
            });
          }
          return Promise.resolve({
            data: { claims: mockIsAuthenticated ? { sub: mockUser.id } : null },
            error: null,
          });
        }),
        getUser: mockGetUser,
      },
      from: (table: string) => {
        mockCalls.table = table;
        const builder = {
          delete: () => builder,
          eq: (column: string, value: unknown) => {
            mockCalls.filter = { column, value };
            return builder;
          },
          select: () =>
            Promise.resolve({
              data: mockDeleteError ? null : mockDeletedRows,
              error: mockDeleteError,
            }),
        };
        return builder;
      },
    }),
  ),
}));

// ---------------------------------------------------------------------------
// Import the route handler AFTER the mock is set up
// ---------------------------------------------------------------------------
import { DELETE } from '@/app/api/memories/route';
import { createClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('DELETE /api/memories', () => {
  beforeEach(() => {
    mockIsAuthenticated = true;
    mockAuthError = null;
    mockDeleteError = null;
    mockDeletedRows = [];
    mockCalls.table = null;
    mockCalls.filter = null;
  });

  it('returns 401 for an unauthenticated user', async () => {
    mockIsAuthenticated = false;

    const res = await DELETE();

    expect(res.status).toBe(401);
    // No DB access should happen when unauthenticated.
    expect(mockCalls.table).toBeNull();
  });

  it('returns 401 when getClaims reports an auth error', async () => {
    mockAuthError = { message: 'session expired' };

    const res = await DELETE();

    expect(res.status).toBe(401);
    // No DB access should happen when authentication fails.
    expect(mockCalls.table).toBeNull();
  });

  it('erases the authenticated user own memories and reports the count', async () => {
    mockDeletedRows = [{ id: 1 }, { id: 2 }, { id: 3 }];

    const res = await DELETE();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ deleted: 3, success: true });
    // Erasure must target agent_memories scoped to the current user only.
    expect(mockCalls.table).toBe('agent_memories');
    expect(mockCalls.filter).toEqual({
      column: 'user_id',
      value: mockUser.id,
    });
  });

  it('reports zero deleted when the user has no memories', async () => {
    mockDeletedRows = [];

    const res = await DELETE();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ deleted: 0, success: true });
  });

  it('returns 500 when the delete query fails', async () => {
    mockDeleteError = { message: 'boom' };

    const res = await DELETE();

    expect(res.status).toBe(500);
  });
});

afterEach(() => {
  expect(mockGetUser).not.toHaveBeenCalled();
});

describe.each([['DELETE', () => DELETE()]] as const)(
  '%s claims authentication',
  (_method, invoke) => {
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
      const getUser = vi.fn();
      const from = vi.fn();
      vi.mocked(createClient).mockResolvedValueOnce({
        auth: { getClaims: vi.fn().mockResolvedValue(result), getUser },
        from,
      } as never);

      const response = await invoke();

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: 'Unauthorized' });
      expect(getUser).not.toHaveBeenCalled();
      expect(from).not.toHaveBeenCalled();
    });
  },
);
