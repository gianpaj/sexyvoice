import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { invalidateCredits } from '@/lib/credits-query';

describe('invalidateCredits', () => {
  it.each([undefined, 'user-1'])(
    'refetches active credits once with user scope %s',
    async (userId) => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
      });
      const firstQuery = vi.fn().mockResolvedValue({ amount: 725 });
      const secondQuery = vi.fn().mockResolvedValue({ amount: 300 });
      const firstObserver = new QueryObserver(client, {
        initialData: { amount: 1000 },
        queryFn: firstQuery,
        queryKey: ['credits', 'user-1'],
      });
      const secondObserver = new QueryObserver(client, {
        initialData: { amount: 500 },
        queryFn: secondQuery,
        queryKey: ['credits', 'user-2'],
      });
      const unsubscribeFirst = firstObserver.subscribe(() => {});
      const unsubscribeSecond = secondObserver.subscribe(() => {});
      client.setQueryData(['credits', 'inactive-user'], { amount: 100 });
      client.setQueryData(['voices'], []);

      try {
        expect(firstQuery).not.toHaveBeenCalled();
        expect(secondQuery).not.toHaveBeenCalled();

        await invalidateCredits(client, userId);

        expect(firstQuery).toHaveBeenCalledOnce();
        expect(secondQuery).toHaveBeenCalledTimes(userId ? 0 : 1);
        expect(client.getQueryData(['credits', 'user-1'])).toEqual({
          amount: 725,
        });
        expect(client.getQueryData(['credits', 'user-2'])).toEqual({
          amount: userId ? 500 : 300,
        });
        expect(
          client.getQueryState(['credits', 'inactive-user'])?.isInvalidated,
        ).toBe(userId === undefined);
        expect(
          client.getQueryState(['credits', 'inactive-user'])?.fetchStatus,
        ).toBe('idle');
        expect(client.getQueryState(['voices'])?.isInvalidated).toBe(false);
      } finally {
        unsubscribeFirst();
        unsubscribeSecond();
        client.clear();
      }
    },
  );
});
