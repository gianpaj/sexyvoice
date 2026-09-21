import { beforeEach, describe, expect, it } from 'vitest';

import {
  claimPendingCallAnalyses,
  getAnalyzedSessionIds,
  markCallAnalysesCompleted,
} from '@/lib/supabase/call-analysis-queries';
import type { TypedSupabaseClient } from '@/lib/supabase/client';

// Records every terminal call (the filters applied and the payload) so the
// tests can assert how many PostgREST requests a helper issues and with which
// id lists.
interface RecordedCall {
  filters: [string, string, unknown][];
  payload?: unknown;
  table: string;
}

const calls: RecordedCall[] = [];
let inRows: Record<string, unknown>[] = [];

function builder(table: string, payload?: unknown) {
  const call: RecordedCall = { filters: [], payload, table };
  calls.push(call);
  const chain = {
    eq: (column: string, value: unknown) => {
      call.filters.push(['eq', column, value]);
      return chain;
    },
    in: (column: string, value: unknown) => {
      call.filters.push(['in', column, value]);
      return chain;
    },
    select: () => Promise.resolve({ data: inRows, error: null }),
    then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
      resolve({ data: inRows, error: null }),
  };
  return chain;
}

const client = {
  from: (table: string) => ({
    select: () => builder(table),
    update: (payload: unknown) => builder(table, payload),
  }),
} as unknown as TypedSupabaseClient;

const ids = (n: number, prefix = 's') =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe('call-analysis-queries id chunking', () => {
  beforeEach(() => {
    calls.length = 0;
    inRows = [];
  });

  it('splits large in() filters into chunks of at most 50 ids', async () => {
    inRows = [{ session_id: 's3' }];

    const analyzed = await getAnalyzedSessionIds(client, ids(120));

    expect(calls).toHaveLength(3);
    expect(calls.map((c) => (c.filters[0][2] as string[]).length)).toEqual([
      50, 50, 20,
    ]);
    // Results from every chunk are merged.
    expect(analyzed).toEqual(new Set(['s3']));
  });

  it('issues no request for an empty id list', async () => {
    await markCallAnalysesCompleted(client, []);
    expect(await getAnalyzedSessionIds(client, [])).toEqual(new Set());
    expect(calls).toHaveLength(0);
  });

  it('claims per attempt group, chunked, guarded by status = pending', async () => {
    const rows = [
      ...ids(60, 'a').map((session_id) => ({ attempts: 0, session_id })),
      ...ids(2, 'b').map((session_id) => ({ attempts: 2, session_id })),
    ];
    inRows = [{ session_id: 'a0' }];

    const claimed = await claimPendingCallAnalyses(client, rows);

    // 60 rows at attempts=0 → two chunks; 2 rows at attempts=2 → one chunk.
    expect(calls).toHaveLength(3);
    expect(
      calls.map((c) => (c.payload as { attempts: number }).attempts),
    ).toEqual([1, 1, 3]);
    for (const call of calls) {
      expect(call.filters).toContainEqual(['eq', 'status', 'pending']);
      expect((call.payload as { status: string }).status).toBe('submitted');
    }
    // Only ids the compare-and-set actually returned count as claimed.
    expect(claimed).toEqual(['a0', 'a0', 'a0']);
  });
});
