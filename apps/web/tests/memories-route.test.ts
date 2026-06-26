import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock state – declared before vi.mock() so the factory can reference it
// ---------------------------------------------------------------------------
const mockUser = {
  id: 'a1b2c3d4-5678-4abc-9def-012345678901',
  email: 'test@example.com',
};
let mockIsAuthenticated = true;
let mockDeleteError: { message: string } | null = null;
let mockDeletedRows: Array<{ id: number }> = [];

// Capture the table name and user_id filter the route applies, so we can
// assert the erasure is correctly scoped to the authenticated user.
const calls = {
  table: null as string | null,
  filter: null as { column: string; value: unknown } | null,
};

// ---------------------------------------------------------------------------
// Supabase client mock – a tiny chainable builder matching the route's
// `from('agent_memories').delete().eq('user_id', id).select('id')` call.
// ---------------------------------------------------------------------------
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: vi.fn(() =>
          Promise.resolve(
            mockIsAuthenticated
              ? { data: { user: mockUser }, error: null }
              : { data: { user: null }, error: null },
          ),
        ),
      },
      from: (table: string) => {
        calls.table = table;
        const builder = {
          delete: () => builder,
          eq: (column: string, value: unknown) => {
            calls.filter = { column, value };
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('DELETE /api/memories', () => {
  beforeEach(() => {
    mockIsAuthenticated = true;
    mockDeleteError = null;
    mockDeletedRows = [];
    calls.table = null;
    calls.filter = null;
  });

  it('returns 401 for an unauthenticated user', async () => {
    mockIsAuthenticated = false;

    const res = await DELETE();

    expect(res.status).toBe(401);
    // No DB access should happen when unauthenticated.
    expect(calls.table).toBeNull();
  });

  it('erases the authenticated user own memories and reports the count', async () => {
    mockDeletedRows = [{ id: 1 }, { id: 2 }, { id: 3 }];

    const res = await DELETE();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, deleted: 3 });
    // Erasure must target agent_memories scoped to the current user only.
    expect(calls.table).toBe('agent_memories');
    expect(calls.filter).toEqual({ column: 'user_id', value: mockUser.id });
  });

  it('reports zero deleted when the user has no memories', async () => {
    mockDeletedRows = [];

    const res = await DELETE();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, deleted: 0 });
  });

  it('returns 500 when the delete query fails', async () => {
    mockDeleteError = { message: 'boom' };

    const res = await DELETE();

    expect(res.status).toBe(500);
  });
});
