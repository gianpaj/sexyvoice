import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, test } from 'vitest';

import { getContributionData } from '../app/api/daily-stats/contribution-queries';
import {
  getCallSessionsInRange,
  getCreditTransactionsInRange,
} from '../app/api/daily-stats/queries';

interface QueryResult {
  data: unknown[] | null;
  error: unknown;
}

// A thenable PostgREST builder with scripted responses, without network access.
function database(
  respond: (
    table: string,
    operations: [string, unknown[]][],
  ) => QueryResult | Promise<QueryResult>,
) {
  const requests: Array<{
    table: string;
    operations: [string, unknown[]][];
  }> = [];
  const client = {
    from(table: string) {
      const operations: [string, unknown[]][] = [];
      const builder: Record<string, unknown> = {};
      for (const method of [
        'select',
        'gte',
        'lt',
        'notIn',
        'or',
        'order',
        'range',
        'in',
        'eq',
      ]) {
        builder[method] = (...args: unknown[]) => {
          operations.push([method, args]);
          return builder;
        };
      }
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) => {
        requests.push({ operations, table });
        return Promise.resolve(respond(table, operations)).then(
          resolve,
          reject,
        );
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, requests };
}
const start = new Date('2026-08-07T00:00:00Z');
const end = new Date('2026-09-06T00:00:00Z');
describe('contribution reads', () => {
  test('paginates events and excludes internal users', async () => {
    const { client, requests } = database((table, ops) => {
      const offset = ops.find(([method]) => method === 'range')?.[1][0];
      const count = table === 'usage_events' && offset === 0 ? 1000 : 0;
      return {
        data: Array.from({ length: count }, (_, id) => ({
          dollar_amount: 1,
          id: `${id}`,
          source_id: null,
          source_type: 'tts',
        })),
        error: null,
      };
    });
    const result = await getContributionData(client, start, end, ['internal']);
    expect(result.events).toHaveLength(1000);
    expect(requests[0].operations).toContainEqual([
      'select',
      [
        'id, user_id, source_id, source_type, occurred_at, dollar_amount, model, metadata, input_chars, duration_seconds',
      ],
    ]);
    expect(
      requests.filter((request) => request.table === 'usage_events'),
    ).toHaveLength(2);
    expect(
      requests.every((request) =>
        request.operations.some(([method]) => method === 'notIn'),
      ),
    ).toBe(true);
  });
  test('cross-window link checks omit date filters and batch audio metadata', async () => {
    const { client, requests } = database((table, ops) => {
      if (table === 'audio_files')
        return {
          data: [{ id: 'audio', usage: { promptTokenCount: 10 } }],
          error: null,
        };
      if (table === 'call_sessions')
        return { data: [{ id: 'call', user_id: 'user' }], error: null };
      if (ops.some(([method]) => method === 'eq'))
        return { data: [{ source_id: 'call' }], error: null };
      return {
        data: [
          {
            dollar_amount: null,
            id: 'tts',
            source_id: 'audio',
            source_type: 'tts',
          },
        ],
        error: null,
      };
    });
    const result = await getContributionData(client, start, end, []);
    expect(result.linkedCallIds).toEqual(['call']);
    expect(result.audioUsage.audio).toEqual({ promptTokenCount: 10 });
    const linkRequest = requests.find((request) =>
      request.operations.some(([method]) => method === 'eq'),
    );
    expect(
      linkRequest?.operations.some(([method]) =>
        ['gte', 'lt'].includes(method),
      ),
    ).toBe(false);
    expect(
      requests.find((request) => request.table === 'audio_files')?.operations,
    ).toContainEqual(['select', ['id, usage']]);
  });
  test('call activity reads paginate past 1000 calls', async () => {
    const { client, requests } = database((_table, ops) => {
      const offset = ops.find(([method]) => method === 'range')?.[1][0];
      return {
        data: Array.from({ length: offset === 0 ? 1000 : 1 }, (_, id) => ({
          id: `${offset}-${id}`,
        })),
        error: null,
      };
    });
    const calls = await getCallSessionsInRange(client, start, end, [
      'internal',
    ]);
    expect(calls).toHaveLength(1001);
    expect(requests).toHaveLength(2);
    expect(requests[0].operations).toContainEqual([
      'notIn',
      ['user_id', ['internal']],
    ]);
    expect(requests[0].operations).toContainEqual([
      'select',
      ['id, started_at, duration_seconds, credits_used, status, free_call'],
    ]);
    expect(requests[1].operations).toContainEqual(['range', [1000, 1999]]);
  });
  test('runs ID lookups concurrently with at most four batches and skips known links', async () => {
    let active = 0;
    let peak = 0;
    const events = Array.from({ length: 450 }, (_, id) => ({
      dollar_amount: 1,
      id: `event-${id}`,
      source_id: `call-${id}`,
      source_type: 'live_call',
    }));
    const { client, requests } = database(async (table, ops) => {
      if (table === 'usage_events') return { data: events, error: null };
      const ids = ops.find(([method]) => method === 'in')?.[1][1] as
        | string[]
        | undefined;
      if (!ids) return { data: [], error: null };
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active--;
      return { data: ids.map((id) => ({ id, user_id: 'user' })), error: null };
    });
    const result = await getContributionData(client, start, end, []);
    expect(result.calls).toHaveLength(450);
    expect(peak).toBe(4);
    expect(
      requests.filter((request) =>
        request.operations.some(([method]) => method === 'in'),
      ),
    ).toHaveLength(5);
    expect(
      requests.filter((request) => request.table === 'usage_events'),
    ).toHaveLength(1);
  });
  test('cash reads retain null descriptions while excluding manual grants', async () => {
    const { client, requests } = database(() => ({ data: [], error: null }));
    await getCreditTransactionsInRange(client, start, end);
    expect(requests[0].operations).toContainEqual([
      'or',
      ['description.is.null,description.not.ilike.%manual%'],
    ]);
  });
  test('database errors reject rather than reporting zero costs', async () => {
    const { client } = database(() => ({
      data: null,
      error: new Error('read failed'),
    }));
    await expect(getContributionData(client, start, end, [])).rejects.toThrow(
      'read failed',
    );
  });
});
