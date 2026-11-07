import { beforeEach, describe, expect, it } from 'vitest';

import {
  claimPendingCallAnalyses,
  getAnalyzedSessionIds,
  getParkedSessionIds,
  MAX_CALL_ANALYSIS_ATTEMPTS,
  markCallAnalysesCompleted,
  recordCallAnalysisFailure,
  setCallAnalysisBatchId,
} from '@/lib/ai/call-analysis-queue';
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
    is: (column: string, value: unknown) => {
      call.filters.push(['is', column, value]);
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

describe('call analysis queue id chunking', () => {
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

  it('looks up parked sessions among the candidates, in chunks', async () => {
    inRows = [{ session_id: 's7' }];

    const parked = await getParkedSessionIds(client, ids(120));

    expect(calls).toHaveLength(3);
    expect(calls[0].filters).toContainEqual(['eq', 'status', 'failed']);
    expect(parked).toEqual(new Set(['s7']));
  });

  it('issues no request for an empty id list', async () => {
    await markCallAnalysesCompleted(client, []);
    expect(await getAnalyzedSessionIds(client, [])).toEqual(new Set());
    expect(calls).toHaveLength(0);
  });

  it('claims chunked, guarded by status = pending, without charging an attempt', async () => {
    inRows = [{ session_id: 'a0' }];

    const claimed = await claimPendingCallAnalyses(client, ids(60, 'a'));

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.filters).toContainEqual(['eq', 'status', 'pending']);
      const payload = call.payload as Record<string, unknown>;
      expect(payload.status).toBe('submitted');
      expect(payload.xai_batch_id).toBeNull();
      // An upload outage must not spend the analysis retry budget.
      expect(payload).not.toHaveProperty('attempts');
    }
    // Only ids the compare-and-set actually returned count as claimed.
    expect(claimed).toEqual(['a0', 'a0']);
  });

  it('stamps the batch id on claimed rows without counting an attempt', async () => {
    await setCallAnalysisBatchId(client, ids(60, 'a'), 'batch_1');

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect((call.payload as { xai_batch_id: string }).xai_batch_id).toBe(
        'batch_1',
      );
      expect(call.payload).not.toHaveProperty('attempts');
      // Idempotent on retry: rows already stamped are left alone.
      expect(call.filters).toContainEqual(['eq', 'status', 'submitted']);
      expect(call.filters).toContainEqual(['is', 'xai_batch_id', null]);
    }
  });
});

describe('call analysis failures', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it.each([
    { attempts: 0, final: false, status: 'pending' },
    {
      attempts: MAX_CALL_ANALYSIS_ATTEMPTS - 2,
      final: false,
      status: 'pending',
    },
    {
      attempts: MAX_CALL_ANALYSIS_ATTEMPTS - 1,
      final: false,
      status: 'failed',
    },
    { attempts: 0, final: true, status: 'failed' },
  ])(
    'counts failure $attempts+1 (final: $final) and leaves the row $status',
    async ({ attempts, final, status }) => {
      const result = await recordCallAnalysisFailure(
        client,
        { attempts, session_id: 's1' },
        'parse failed',
        { final },
      );

      expect(result).toBe(status);
      expect(calls).toHaveLength(1);
      expect(calls[0].payload).toMatchObject({
        attempts: attempts + 1,
        last_error: 'parse failed',
        status,
      });
      expect(calls[0].filters).toEqual([['eq', 'session_id', 's1']]);
    },
  );
});
