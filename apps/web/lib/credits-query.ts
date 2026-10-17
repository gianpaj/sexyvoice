import type { QueryClient } from '@tanstack/react-query';

export function invalidateCredits(queryClient: QueryClient, userId?: string) {
  return queryClient.invalidateQueries({
    queryKey: userId === undefined ? ['credits'] : ['credits', userId],
  });
}
