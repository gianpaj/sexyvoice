import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createReadOnlyFetch,
  escapeCsv,
  reconcileCreditAccount,
} from './audit-unexplained-credits.mts';

test('reports a balanced account as clean', () => {
  assert.deepEqual(
    reconcileCreditAccount({
      currentBalance: 7500,
      netLedgerCredits: 10_000,
      recordedUsage: 2500,
    }),
    {
      classification: 'clean',
      expectedBalance: 7500,
      minimumUnexplainedUsed: 0,
      unexplainedGrants: 0,
      unexplainedRemaining: 0,
    },
  );
});

test('reports unexplained credits that remain unspent', () => {
  assert.deepEqual(
    reconcileCreditAccount({
      currentBalance: 8000,
      netLedgerCredits: 10_000,
      recordedUsage: 2500,
    }),
    {
      classification: 'unspent',
      expectedBalance: 7500,
      minimumUnexplainedUsed: 0,
      unexplainedGrants: 500,
      unexplainedRemaining: 500,
    },
  );
});

test('reports unexplained credits that were fully used', () => {
  assert.deepEqual(
    reconcileCreditAccount({
      currentBalance: 0,
      netLedgerCredits: 10_000,
      recordedUsage: 12_000,
    }),
    {
      classification: 'used',
      expectedBalance: 0,
      minimumUnexplainedUsed: 2000,
      unexplainedGrants: 2000,
      unexplainedRemaining: 0,
    },
  );
});

test('reports unexplained credits that were partly used', () => {
  assert.deepEqual(
    reconcileCreditAccount({
      currentBalance: 500,
      netLedgerCredits: 10_000,
      recordedUsage: 12_000,
    }),
    {
      classification: 'used_and_remaining',
      expectedBalance: 0,
      minimumUnexplainedUsed: 2000,
      unexplainedGrants: 2500,
      unexplainedRemaining: 500,
    },
  );
});

test('includes negative refund adjustments in the net ledger', () => {
  assert.deepEqual(
    reconcileCreditAccount({
      currentBalance: 5000,
      netLedgerCredits: 8000,
      recordedUsage: 3000,
    }),
    {
      classification: 'clean',
      expectedBalance: 5000,
      minimumUnexplainedUsed: 0,
      unexplainedGrants: 0,
      unexplainedRemaining: 0,
    },
  );
});

test('surfaces negative balances as integrity errors', () => {
  assert.deepEqual(
    reconcileCreditAccount({
      currentBalance: -50,
      netLedgerCredits: 0,
      recordedUsage: 0,
    }),
    {
      classification: 'invalid_balance',
      expectedBalance: 0,
      minimumUnexplainedUsed: 0,
      unexplainedGrants: 0,
      unexplainedRemaining: 0,
    },
  );
});

test('blocks non-read HTTP methods before they reach the network', async () => {
  let calls = 0;
  const guardedFetch = createReadOnlyFetch(() => {
    calls += 1;
    return Promise.resolve(new Response(null, { status: 200 }));
  });

  await guardedFetch('https://example.com/credits', { method: 'GET' });
  await assert.rejects(
    guardedFetch('https://example.com/credits', { method: 'POST' }),
    /blocked HTTP POST/,
  );
  assert.equal(calls, 1);
});

test('neutralizes spreadsheet formulas in CSV text', () => {
  assert.equal(
    escapeCsv('=HYPERLINK("https://example.com")'),
    '"\'=HYPERLINK(""https://example.com"")"',
  );
  assert.equal(escapeCsv('user@example.com'), 'user@example.com');
  assert.equal(escapeCsv('last, first'), '"last, first"');
  assert.equal(escapeCsv('-1+1'), "'-1+1");
});

test('keeps negative numbers numeric in CSV', () => {
  assert.equal(escapeCsv(-50), '-50');
});
