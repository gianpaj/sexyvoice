'use client';

import { useQuery } from '@tanstack/react-query';

import useSupabaseBrowser from '@/lib/supabase/client';
import { getCredits } from '@/lib/supabase/queries.client';

// Every credits widget copy and `DashboardAnalytics` share this query by key,
// so they make one request between them.
export function useCreditsQuery(userId: string) {
  const supabase = useSupabaseBrowser();

  return useQuery({
    enabled: !!userId,
    queryFn: () => getCredits(supabase, userId),
    queryKey: ['credits', userId],
    retry: false,
  });
}
