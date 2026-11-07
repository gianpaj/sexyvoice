import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  adjustCredits,
  type CreditTransaction,
  findRefund,
  hasCashPurchase,
  hasEverPaid,
  paidBefore,
  readCreditTransactions,
  readPaidUserIds,
  summarizeLedger,
} from './lib/ledger.mts';
import type { ScriptSupabaseClient } from './lib/supabase.mts';

type Row = Record<string, unknown>;

const SERVER_ROW_CAP = 1000;

/**
 * In-memory stand-in for the queries the ledger module sends. Responses are
 * capped at 1000 rows like PostgREST, and the credit RPCs move `credits`.
 */
function fakeSupabase(
  tables: Record<string, Row[]>,
  rpcOverride?: () => { error: { message: string } | null; status: number },
) {
  const requests: { filters: [string, string, unknown][]; table: string }[] =
    [];
  const value = (row: Row, column: string) => {
    const [field, key] = column.split('->>');
    const cell = row[field];
    return key ? (cell as Row | null)?.[key] : cell;
  };

  function builder(table: string) {
    const filters: [string, string, unknown][] = [];
    let limit = Number.POSITIVE_INFINITY;
    let mode: 'delete' | 'insert' | 'select' = 'select';
    let inserted: Row | undefined;
    const matches = (row: Row) =>
      filters.every(([operator, column, expected]) => {
        const actual = value(row, column);
        if (operator === 'eq') return actual === expected;
        if (operator === 'in') return (expected as unknown[]).includes(actual);
        if (operator === 'gt') return String(actual) > String(expected);
        return String(actual) <= String(expected);
      });
    const execute = () => {
      tables[table] ??= [];
      if (mode === 'insert') {
        return { data: { id: inserted?.id }, error: null };
      }
      if (mode === 'delete') {
        tables[table] = tables[table].filter((row) => !matches(row));
        return { error: null };
      }
      requests.push({ filters, table });
      const rows = tables[table]
        .filter(matches)
        .sort((left, right) => String(left.id).localeCompare(String(right.id)))
        .slice(0, Math.min(limit, SERVER_ROW_CAP));
      return { data: rows, error: null };
    };
    const query = {
      delete: () => {
        mode = 'delete';
        return query;
      },
      eq: (column: string, expected: unknown) => {
        filters.push(['eq', column, expected]);
        return query;
      },
      gt: (column: string, expected: unknown) => {
        filters.push(['gt', column, expected]);
        return query;
      },
      in: (column: string, expected: unknown[]) => {
        filters.push(['in', column, expected]);
        return query;
      },
      insert: (row: Row) => {
        mode = 'insert';
        inserted = {
          created_at: new Date().toISOString(),
          id: randomUUID(),
          ...row,
        };
        tables[table] ??= [];
        tables[table].push(inserted);
        return query;
      },
      limit: (count: number) => {
        limit = count;
        return query;
      },
      lte: (column: string, expected: unknown) => {
        filters.push(['lte', column, expected]);
        return query;
      },
      order: () => query,
      select: () => query,
      single: () => query,
      // biome-ignore lint/suspicious/noThenProperty: the fake mirrors PostgREST's thenable builders.
      then: (resolve: (result: unknown) => unknown) =>
        Promise.resolve(execute()).then(resolve),
    };
    return query;
  }

  const client = {
    from: builder,
    rpc: (name: string, args: Row) => {
      if (rpcOverride) return Promise.resolve(rpcOverride());
      tables.credits ??= [];
      const credits = tables.credits;
      const row = credits.find((entry) => entry.user_id === args.user_id_var);
      const change = args.credit_amount_var as number;
      if (name === 'decrement_user_credits') {
        if (!row || (row.amount as number) < change) {
          return Promise.resolve({
            error: { message: 'Insufficient credits' },
            status: 400,
          });
        }
        row.amount = (row.amount as number) - change;
      } else if (row) {
        row.amount = (row.amount as number) + change;
      } else {
        credits.push({
          amount: change,
          id: randomUUID(),
          user_id: args.user_id_var,
        });
      }
      return Promise.resolve({ error: null, status: 204 });
    },
  };
  return {
    client: client as unknown as ScriptSupabaseClient,
    requests,
    tables,
  };
}

function transaction(
  overrides: Partial<CreditTransaction> &
    Pick<CreditTransaction, 'amount' | 'type'>,
): CreditTransaction {
  return {
    created_at: '2026-01-01T00:00:00.000Z',
    description: '',
    id: randomUUID(),
    metadata: null,
    reference_id: null,
    subscription_id: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    user_id: USER,
    ...overrides,
  };
}

const USER = '11111111-1111-4111-8111-111111111111';

test('reads a whole history past the 1000-row response cap', async () => {
  const history = Array.from({ length: 2500 }, (_, index) =>
    transaction({
      amount: 1,
      created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      type: 'freemium',
    }),
  );
  const other = transaction({
    amount: 5,
    type: 'freemium',
    user_id: randomUUID(),
  });
  const { client } = fakeSupabase({ credit_transactions: [...history, other] });

  const rows = await readCreditTransactions(client, [USER]);

  assert.equal(rows.length, 2500);
  assert.ok(rows.every((row) => row.user_id === USER));
  assert.deepEqual(
    rows.map((row) => row.created_at),
    history.map((row) => row.created_at),
  );
});

test('splits large user lists into short .in() filters', async () => {
  const users = Array.from({ length: 250 }, () => randomUUID());
  const { client, requests } = fakeSupabase({
    credit_transactions: [
      transaction({ amount: 100, type: 'purchase', user_id: users[0] }),
      transaction({ amount: 100, type: 'freemium', user_id: users[1] }),
      transaction({ amount: 100, type: 'topup', user_id: users[249] }),
    ],
  });

  const paid = await readPaidUserIds(client, users);

  assert.deepEqual(paid, new Set([users[0], users[249]]));
  const sizes = requests.map((request) => {
    const userFilter = request.filters.find(
      ([, column]) => column === 'user_id',
    );
    return (userFilter?.[2] as unknown[] | undefined)?.length ?? 0;
  });
  assert.ok(sizes.length >= 3);
  assert.ok(sizes.every((size) => size > 0 && size <= 100));
});

test('summarizes the ledger equation and the cash view', () => {
  const transactions = [
    transaction({ amount: 10_000, type: 'freemium' }),
    transaction({ amount: 5000, metadata: { dollarAmount: 5 }, type: 'topup' }),
    transaction({ amount: 2000, type: 'refund' }),
    transaction({
      amount: -1000,
      metadata: { dollarAmount: -1 },
      type: 'refund',
    }),
  ];

  assert.deepEqual(summarizeLedger(transactions, 3000, 12_500), {
    balance: 12_500,
    cashRefunded: 1,
    charged: 5,
    creditsUsed: 3000,
    delta: -500,
    expected: 13_000,
    freemium: 10_000,
    purchased: 5000,
    refundsAdded: 2000,
    refundsRemoved: 1000,
  });
});

test('names the three paid rules', () => {
  const freemium = transaction({ amount: 10_000, type: 'freemium' });
  const grant = transaction({
    amount: 500,
    created_at: '2026-03-01T00:00:00.000Z',
    type: 'purchase',
  });
  const cash = transaction({
    amount: 500,
    metadata: { dollarAmount: 5 },
    type: 'topup',
  });

  assert.equal(hasEverPaid([freemium]), false);
  assert.equal(hasEverPaid([freemium, grant]), true);
  assert.equal(paidBefore([grant], '2026-03-01T00:00:00.000Z'), false);
  assert.equal(paidBefore([grant], '2026-03-01T00:00:01.000Z'), true);
  assert.equal(hasCashPurchase([grant]), false);
  assert.equal(hasCashPurchase([grant, cash]), true);
});

test('records the ledger row, then moves the balance', async () => {
  const { client, tables } = fakeSupabase({
    credits: [{ amount: 300, id: randomUUID(), user_id: USER }],
  });

  await adjustCredits(client, {
    amount: 200,
    description: 'Refund - Platform bug',
    metadata: { chargeId: 'ch_1' },
    reason: 'Platform bug',
    userId: USER,
  });
  await adjustCredits(client, {
    amount: -500,
    description: 'Credits reset to 0',
    reason: 'disposable_email',
    referenceId: 'pi_1',
    userId: USER,
  });

  assert.equal(tables.credits[0].amount, 0);
  assert.deepEqual(
    tables.credit_transactions.map(
      ({ amount, metadata, reference_id, type }) => ({
        amount,
        metadata,
        reference_id,
        type,
      }),
    ),
    [
      {
        amount: 200,
        metadata: { chargeId: 'ch_1', reason: 'Platform bug' },
        reference_id: null,
        type: 'refund',
      },
      {
        amount: -500,
        metadata: { reason: 'disposable_email' },
        reference_id: 'pi_1',
        type: 'refund',
      },
    ],
  );
});

test('finds an earlier refund by its metadata', async () => {
  const reason = 'Double billing - voice call';
  const { client } = fakeSupabase({
    credit_transactions: [
      {
        id: 'tx-1',
        metadata: { reason, sourceId: 'call-1' },
        type: 'refund',
        user_id: USER,
      },
    ],
  });

  assert.equal(
    await findRefund(client, USER, { reason, sourceId: 'call-1' }),
    'tx-1',
  );
  assert.equal(
    await findRefund(client, USER, { reason, sourceId: 'call-2' }),
    null,
  );
});

test('removes the ledger row when the database rejects the balance change', async () => {
  const { client, tables } = fakeSupabase({
    credits: [{ amount: 40, id: randomUUID(), user_id: USER }],
  });

  await assert.rejects(
    adjustCredits(client, {
      amount: -50,
      description: 'Credits reset to 0',
      reason: 'freeloader_bug',
      userId: USER,
    }),
    /Balance not changed \(Insufficient credits\); the ledger row was removed/,
  );
  assert.deepEqual(tables.credit_transactions, []);
  assert.equal(tables.credits[0].amount, 40);
});

test('keeps the ledger row when the balance update got no response', async () => {
  const { client, tables } = fakeSupabase({}, () => ({
    error: { message: 'TypeError: fetch failed' },
    status: 0,
  }));

  await assert.rejects(
    adjustCredits(client, {
      amount: 10,
      description: 'Refund',
      reason: 'Platform bug',
      userId: USER,
    }),
    /outcome unknown/,
  );
  assert.equal(tables.credit_transactions.length, 1);
});

test('rejects invalid adjustments before any request', async () => {
  const { client, tables } = fakeSupabase({});
  const base = { description: 'x', reason: 'x', userId: USER };

  await assert.rejects(
    adjustCredits(client, { ...base, amount: 0 }),
    /non-zero/,
  );
  await assert.rejects(
    adjustCredits(client, { ...base, amount: 1.5 }),
    /non-zero/,
  );
  await assert.rejects(
    adjustCredits(client, { ...base, amount: 1, userId: 'not-a-uuid' }),
    /Invalid user ID/,
  );
  assert.equal(tables.credit_transactions, undefined);
});
