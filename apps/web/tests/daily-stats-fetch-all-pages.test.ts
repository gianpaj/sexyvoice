import { describe, expect, test, vi } from 'vitest';

import {
  applyPageCursor,
  fetchAllPages,
  isTransientQueryError,
  PAGE_MAX_ATTEMPTS,
  PAGE_SIZE,
  type PageCursor,
} from '../app/api/daily-stats/utils';

const GATEWAY_TIMEOUT = { message: 'Gateway Timeout' };

// Drives `fetchAllPages` past its backoff without waiting on real timers.
async function runWithFakeTimers<T>(run: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  try {
    const promise = run();
    const settled = promise.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await vi.runAllTimersAsync();
    const result = await settled;
    if ('error' in result) throw result.error;
    return result.value;
  } finally {
    vi.useRealTimers();
  }
}

describe('isTransientQueryError', () => {
  test.each([
    ['gateway timeout from the Supabase edge', { message: 'Gateway Timeout' }],
    ['statement timeout SQLSTATE', { code: '57014', message: 'canceled' }],
    ['connection failure SQLSTATE', { code: '08006', message: 'nope' }],
    ['dropped socket', { message: 'socket hang up' }],
  ])('treats %s as transient', (_label, error) => {
    expect(isTransientQueryError(error)).toBe(true);
  });

  test.each([
    ['a constraint violation', { code: '23505', message: 'duplicate key' }],
    ['a malformed filter', { message: 'failed to parse filter' }],
    ['a non-object', 'Gateway Timeout'],
    ['null', null],
  ])('does not treat %s as transient', (_label, error) => {
    expect(isTransientQueryError(error)).toBe(false);
  });
});

interface Row {
  created_at: string;
  id: string;
}

const sortRows = (rows: Row[]) =>
  [...rows].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );

/**
 * Stands in for PostgREST: applies the cursor exactly as `applyPageCursor`
 * builds it (`gte(column, value)` plus `not id in (...)`), ordered and capped
 * at PAGE_SIZE.
 */
function tableReader(rows: Row[]) {
  const sorted = sortRows(rows);
  return (cursor: PageCursor | null) => {
    let visible = sorted;
    if (cursor?.kind === 'exclude') {
      const excluded = new Set(cursor.excludeIds);
      visible = sorted.filter(
        (row) => row.created_at >= cursor.value && !excluded.has(row.id),
      );
    } else if (cursor?.kind === 'within') {
      visible = sorted.filter(
        (row) => row.created_at === cursor.value && row.id > cursor.afterId,
      );
    } else if (cursor?.kind === 'after') {
      visible = sorted.filter((row) => row.created_at > cursor.value);
    }
    return Promise.resolve({ data: visible.slice(0, PAGE_SIZE), error: null });
  };
}

const makeRows = (count: number, at: (i: number) => string): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    created_at: at(i),
    id: `row-${String(i).padStart(5, '0')}`,
  }));

// Distinct, ordered timestamps.
const distinctAt = (i: number) =>
  new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString();

describe('fetchAllPages keyset paging', () => {
  test('reads a multi-page table exactly once, in order', async () => {
    const rows = makeRows(PAGE_SIZE * 2 + 137, distinctAt);

    const read = await fetchAllPages<Row>('created_at', tableReader(rows));

    expect(read).toEqual(sortRows(rows));
  });

  test('does not skip or duplicate rows sharing a timestamp across a page boundary', async () => {
    const collision = distinctAt(999);
    // 40 rows straddling the first page boundary all share one timestamp.
    const rows = makeRows(PAGE_SIZE * 2, (i) =>
      i >= 980 && i < 1020 ? collision : distinctAt(i),
    );

    const read = await fetchAllPages<Row>('created_at', tableReader(rows));

    expect(read).toEqual(sortRows(rows));
    expect(new Set(read.map((r) => r.id)).size).toBe(rows.length);
  });

  test('excludes every id at the boundary, not just the last row', async () => {
    const collision = distinctAt(999);
    // The page boundary lands inside a run of equal timestamps, so the next
    // seek re-reads all of them and must exclude each one.
    const rows = makeRows(PAGE_SIZE + 50, (i) =>
      i >= 995 ? collision : distinctAt(i),
    );

    const cursors: (PageCursor | null)[] = [];
    const reader = tableReader(rows);

    const read = await fetchAllPages<Row>('created_at', (cursor) => {
      cursors.push(cursor);
      return reader(cursor);
    });

    expect(read).toEqual(sortRows(rows));
    // Rows 995..999 close the first page and all share `collision`.
    expect(cursors[1]).toEqual({
      column: 'created_at',
      excludeIds: [
        'row-00995',
        'row-00996',
        'row-00997',
        'row-00998',
        'row-00999',
      ],
      kind: 'exclude',
      value: collision,
    });
  });

  // A bulk insert shares one `now()`, so these runs are ordinary data.
  test('reads a run longer than the cursor can carry ids for', async () => {
    const frozen = distinctAt(0);
    // 400 rows at one value, ending the first page mid-run.
    const rows = makeRows(PAGE_SIZE + 500, (i) =>
      i >= 800 && i < 1200 ? frozen : distinctAt(i + 1),
    );

    const read = await fetchAllPages<Row>('created_at', tableReader(rows));

    expect(read).toEqual(sortRows(rows));
    expect(new Set(read.map((r) => r.id)).size).toBe(rows.length);
  });

  test('reads a run longer than a whole page', async () => {
    const frozen = distinctAt(0);
    const rows = makeRows(PAGE_SIZE * 3, (i) =>
      i < PAGE_SIZE * 2 ? frozen : distinctAt(i + 1),
    );

    const read = await fetchAllPages<Row>('created_at', tableReader(rows));

    expect(read).toEqual(sortRows(rows));
    expect(new Set(read.map((r) => r.id)).size).toBe(rows.length);
  });

  test('reads a table that is entirely one cursor value', async () => {
    const frozen = distinctAt(0);
    const rows = makeRows(PAGE_SIZE * 2, () => frozen);

    const read = await fetchAllPages<Row>('created_at', tableReader(rows));

    expect(read).toEqual(sortRows(rows));
  });

  test('walks a long run by id, then steps past it', async () => {
    const frozen = distinctAt(0);
    const rows = makeRows(PAGE_SIZE + 10, (i) =>
      i < PAGE_SIZE ? frozen : distinctAt(i + 1),
    );
    const kinds: (PageCursor | null)[] = [];
    const reader = tableReader(rows);

    await fetchAllPages<Row>('created_at', (cursor) => {
      kinds.push(cursor);
      return reader(cursor);
    });

    // Page 1 is all `frozen`, so the cursor walks by id rather than listing
    // 1000 ids, then advances past the value once the run is exhausted.
    expect(kinds[1]).toEqual({
      afterId: 'row-00999',
      column: 'created_at',
      kind: 'within',
      value: frozen,
    });
    expect(kinds[2]).toEqual({
      column: 'created_at',
      kind: 'after',
      value: frozen,
    });
  });

  test('refuses a cursor that moves backwards rather than looping forever', async () => {
    // A query not actually ordered by the cursor column: every page ends
    // earlier than the last, so the seek would never advance.
    const page = makeRows(PAGE_SIZE, distinctAt);
    let call = 0;

    await expect(
      fetchAllPages<Row>('created_at', () => {
        call++;
        return Promise.resolve({
          data:
            call === 1 ? page : sortRows(page).slice(0, PAGE_SIZE).reverse(),
          error: null,
        });
      }),
    ).rejects.toThrow(/went backwards/);
  });

  test('reports a missing cursor column rather than looping', async () => {
    const rows = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      id: `r-${i}`,
    }));

    await expect(
      fetchAllPages('created_at', () =>
        Promise.resolve({ data: rows, error: null }),
      ),
    ).rejects.toThrow(/no string `created_at`/);
  });
});

describe('applyPageCursor', () => {
  function fakeQuery() {
    const calls: [string, ...string[]][] = [];
    const builder = {
      calls,
      eq(column: string, value: string) {
        calls.push(['eq', column, value]);
        return builder;
      },
      gt(column: string, value: string) {
        calls.push(['gt', column, value]);
        return builder;
      },
      gte(column: string, value: string) {
        calls.push(['gte', column, value]);
        return builder;
      },
      not(column: string, operator: string, value: string) {
        calls.push(['not', column, operator, value]);
        return builder;
      },
    };
    return builder;
  }

  test('leaves the first page unfiltered', () => {
    const query = fakeQuery();
    expect(applyPageCursor(query, null)).toBe(query);
    expect(query.calls).toEqual([]);
  });

  test('seeks inclusively and excludes the ids already returned', () => {
    const query = fakeQuery();

    applyPageCursor(query, {
      column: 'occurred_at',
      excludeIds: ['a', 'b'],
      kind: 'exclude',
      value: '2026-09-01T00:00:00.000Z',
    });

    expect(query.calls).toEqual([
      ['gte', 'occurred_at', '2026-09-01T00:00:00.000Z'],
      ['not', 'id', 'in', '(a,b)'],
    ]);
  });

  test('walks a long run by id with plain AND filters, no `or`', () => {
    const query = fakeQuery();

    applyPageCursor(query, {
      afterId: 'row-42',
      column: 'occurred_at',
      kind: 'within',
      value: '2026-09-01T00:00:00.000Z',
    });

    expect(query.calls).toEqual([
      ['eq', 'occurred_at', '2026-09-01T00:00:00.000Z'],
      ['gt', 'id', 'row-42'],
    ]);
  });

  test('steps past an exhausted run', () => {
    const query = fakeQuery();

    applyPageCursor(query, {
      column: 'occurred_at',
      kind: 'after',
      value: '2026-09-01T00:00:00.000Z',
    });

    expect(query.calls).toEqual([
      ['gt', 'occurred_at', '2026-09-01T00:00:00.000Z'],
    ]);
  });

  test('skips the exclusion filter when nothing shares the boundary', () => {
    const query = fakeQuery();

    applyPageCursor(query, {
      column: 'created_at',
      excludeIds: [],
      kind: 'exclude',
      value: '2026-09-01T00:00:00.000Z',
    });

    expect(query.calls).toEqual([
      ['gte', 'created_at', '2026-09-01T00:00:00.000Z'],
    ]);
  });
});

describe('fetchAllPages', () => {
  test('retries a transient gateway failure and keeps paginating', async () => {
    // Distinct timestamps, so each page boundary excludes exactly one id.
    const firstPage = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      created_at: `2026-09-01T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(4, '0')}Z`,
      id: `row-${i}`,
    }));
    const lastOfFirstPage = firstPage[PAGE_SIZE - 1];
    const seen: (PageCursor | null)[] = [];
    let failures = 0;

    const rows = await runWithFakeTimers(() =>
      fetchAllPages<{ created_at: string; id: string }>(
        'created_at',
        (cursor) => {
          seen.push(cursor);
          if (cursor === null && failures === 0) {
            failures++;
            return Promise.resolve({ data: null, error: GATEWAY_TIMEOUT });
          }
          return Promise.resolve({
            data:
              cursor === null
                ? firstPage
                : [{ created_at: '2026-09-02T00:00:00.000Z', id: 'tail' }],
            error: null,
          });
        },
      ),
    );

    expect(rows).toHaveLength(PAGE_SIZE + 1);
    // First page is replayed from the same (null) cursor, then the cursor
    // advances to the last row of that page and excludes it.
    expect(seen[0]).toBeNull();
    expect(seen[1]).toBeNull();
    expect(seen[2]).toEqual({
      column: 'created_at',
      excludeIds: [lastOfFirstPage.id],
      kind: 'exclude',
      value: lastOfFirstPage.created_at,
    });
  });

  test('gives up after the attempt budget and preserves the cause', async () => {
    let attempts = 0;

    await expect(
      runWithFakeTimers(() =>
        fetchAllPages('created_at', () => {
          attempts++;
          return Promise.resolve({ data: null, error: GATEWAY_TIMEOUT });
        }),
      ),
    ).rejects.toThrow('Gateway Timeout');

    expect(attempts).toBe(PAGE_MAX_ATTEMPTS);
  });

  test('does not retry a non-transient error', async () => {
    let attempts = 0;

    await expect(
      runWithFakeTimers(() =>
        fetchAllPages('created_at', () => {
          attempts++;
          return Promise.resolve({
            data: null,
            error: { code: '42703', message: 'column does not exist' },
          });
        }),
      ),
    ).rejects.toThrow('column does not exist');

    expect(attempts).toBe(1);
  });

  test('retries a rejected query builder promise', async () => {
    let attempts = 0;

    const rows = await runWithFakeTimers(() =>
      fetchAllPages<{ id: number }>('created_at', () => {
        attempts++;
        if (attempts === 1) {
          return Promise.reject(new Error('fetch failed'));
        }
        return Promise.resolve({ data: [{ id: 1 }], error: null });
      }),
    );

    expect(rows).toEqual([{ id: 1 }]);
    expect(attempts).toBe(2);
  });
});
