import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, test } from 'vitest';

import { getContributionData } from '../app/api/daily-stats/contribution-queries';
import {
  type DailyStatsCreditTransaction,
  getAllCreditTransactions,
  getCallSessionsInRange,
} from '../app/api/daily-stats/queries';
import { PAGE_SIZE } from '../app/api/daily-stats/utils';

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
        'not',
        'or',
        'order',
        'limit',
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

// Rows carry the keyset cursor columns; paging reads them off the last row.
const at = (i: number) => new Date(start.getTime() + i * 1000).toISOString();
describe('all-time credit transaction reads', () => {
  test('keeps the last duplicate, restores chronological order, and retains refunds', async () => {
    const firstPage: DailyStatsCreditTransaction[] = Array.from(
      { length: PAGE_SIZE },
      (_, id) => ({
        amount: 10,
        created_at: at(id),
        description: 'Credit purchase',
        id: `${id}`,
        metadata: {},
        profiles: null,
        type: 'purchase',
        user_id: 'user',
      }),
    );
    const updatedTransaction = {
      ...firstPage[0],
      created_at: at(PAGE_SIZE),
    };
    const refund: DailyStatsCreditTransaction = {
      ...firstPage[0],
      amount: -10,
      created_at: at(PAGE_SIZE + 1),
      id: 'refund',
      type: 'refund',
    };
    let page = 0;
    const { client, requests } = database(() => ({
      data: page++ === 0 ? firstPage : [updatedTransaction, refund],
      error: null,
    }));

    const transactions = await getAllCreditTransactions(client, end, [
      'internal',
    ]);

    expect(transactions).toEqual([
      ...firstPage.slice(1),
      updatedTransaction,
      refund,
    ]);
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.table).toBe('credit_transactions');
      expect(request.operations).toContainEqual([
        'in',
        ['type', ['purchase', 'topup', 'refund']],
      ]);
      expect(request.operations).toContainEqual([
        'gte',
        ['created_at', new Date(0).toISOString()],
      ]);
      expect(request.operations).toContainEqual([
        'lt',
        ['created_at', end.toISOString()],
      ]);
      expect(request.operations).toContainEqual([
        'notIn',
        ['user_id', ['internal']],
      ]);
    }
  });
});

describe('contribution reads', () => {
  test('paginates events and excludes internal users', async () => {
    let eventPages = 0;
    const { client, requests } = database((table) => {
      if (table !== 'usage_events') return { data: [], error: null };
      const count = eventPages++ === 0 ? PAGE_SIZE : 0;
      return {
        data: Array.from({ length: count }, (_, id) => ({
          dollar_amount: 1,
          id: `${id}`,
          occurred_at: at(id),
          source_id: null,
          source_type: 'tts',
        })),
        error: null,
      };
    });
    const result = await getContributionData(client, start, end, ['internal']);
    expect(result.events).toHaveLength(PAGE_SIZE);

    const eventReads = requests.filter(
      (request) => request.table === 'usage_events',
    );
    expect(eventReads).toHaveLength(2);
    expect(
      requests.every((request) =>
        request.operations.some(([method]) => method === 'notIn'),
      ),
    ).toBe(true);

    // First page seeks from the window start only.
    expect(
      eventReads[0].operations.filter(([method]) => method === 'gte'),
    ).toEqual([['gte', ['occurred_at', start.toISOString()]]]);
    // Second page re-seeks from the last row read and drops that row's id.
    expect(eventReads[1].operations).toContainEqual([
      'gte',
      ['occurred_at', at(PAGE_SIZE - 1)],
    ]);
    expect(eventReads[1].operations).toContainEqual([
      'not',
      ['id', 'in', `(${PAGE_SIZE - 1})`],
    ]);
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
  });
  test('call activity reads paginate past 1000 calls', async () => {
    let page = 0;
    const { client, requests } = database(() => {
      const current = page++;
      return {
        data: Array.from(
          { length: current === 0 ? PAGE_SIZE : 1 },
          (_, id) => ({
            id: `${current}-${id}`,
            started_at: at(current * PAGE_SIZE + id),
          }),
        ),
        error: null,
      };
    });
    const calls = await getCallSessionsInRange(client, start, end, [
      'internal',
    ]);
    expect(calls).toHaveLength(PAGE_SIZE + 1);
    expect(requests).toHaveLength(2);
    expect(requests[0].operations).toContainEqual([
      'notIn',
      ['user_id', ['internal']],
    ]);
    expect(calls[PAGE_SIZE].id).toBe('1-0');
    expect(requests[1].operations).toContainEqual([
      'gte',
      ['started_at', at(PAGE_SIZE - 1)],
    ]);
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
