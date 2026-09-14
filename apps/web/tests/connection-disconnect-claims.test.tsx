// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionProvider, useConnection } from '@/hooks/use-connection';

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
  invalidateQueries: vi.fn(),
  refetchQueries: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => mocks }));
vi.mock('@/lib/supabase/client', () => ({ default: () => ({ auth: mocks }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/hooks/use-playground-state', () => ({
  usePlaygroundState: () => ({ dispatch: vi.fn(), helpers: {}, pgState: {} }),
}));
vi.mock('@/lib/characters', () => ({}));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe('connection disconnect claims', () => {
  it('refreshes only the verified subject credit cache without getUser', async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: 'claims-user' } },
      error: null,
    });
    const { result } = renderHook(useConnection, {
      wrapper: ConnectionProvider,
    });
    await act(() => result.current.disconnect());
    expect(result.current.shouldConnect).toBe(false);
    expect(mocks.refetchQueries).toHaveBeenCalledWith({
      queryKey: ['credits', 'claims-user'],
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['credits', 'claims-user'],
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: null },
    { data: { claims: {} }, error: null },
    { data: { claims: { sub: '' } }, error: null },
    {
      data: { claims: { sub: 'claims-user' } },
      error: new Error('Invalid JWT'),
    },
  ])(
    'does not refresh user credit data for invalid claims %j',
    async (response) => {
      mocks.getClaims.mockResolvedValue(response);
      const { result } = renderHook(useConnection, {
        wrapper: ConnectionProvider,
      });
      await act(() => result.current.disconnect());
      expect(result.current.shouldConnect).toBe(false);
      expect(mocks.refetchQueries).not.toHaveBeenCalled();
      expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    },
  );
});
