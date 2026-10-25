import { describe, expect, test } from 'vitest';

import {
  formatPurchaseSummary,
  type PurchaseSummaryTransaction,
} from '../app/api/daily-stats/utils';

function transaction(
  amount: number,
  type: PurchaseSummaryTransaction['type'],
  isNew = false,
): PurchaseSummaryTransaction {
  return { amount, isNew, type };
}

describe('formatPurchaseSummary', () => {
  test('keeps one purchase compact', () => {
    expect(formatPurchaseSummary([transaction(75, 'subscription')])).toBe(
      '$75 - existing sub',
    );
  });

  test('shows the total and groups matching topups', () => {
    expect(
      formatPurchaseSummary([
        transaction(10, 'topup', true),
        transaction(10, 'topup'),
        transaction(20, 'topup'),
      ]),
    ).toBe('$40 = 2× $10 + $20; 1 new + 2 existing topups');
  });

  test('shows one matching topup group', () => {
    expect(
      formatPurchaseSummary([
        transaction(10, 'topup', true),
        transaction(10, 'topup'),
        transaction(10, 'topup'),
        transaction(10, 'topup'),
      ]),
    ).toBe('$40 = 4× $10; 1 new + 3 existing topups');
  });

  test('keeps a subscription separate from matching topups', () => {
    expect(
      formatPurchaseSummary([
        transaction(10, 'subscription', true),
        transaction(10, 'topup', true),
        transaction(10, 'topup'),
        transaction(10, 'topup'),
        transaction(10, 'topup'),
      ]),
    ).toBe(
      '$50 = $10 subscription + 4× $10 topups; new subscription + 1 new + 3 existing topups',
    );
  });

  test('keeps different topup amounts separate in a mixed purchase', () => {
    expect(
      formatPurchaseSummary([
        transaction(30, 'subscription'),
        transaction(10, 'topup'),
        transaction(20, 'topup'),
      ]),
    ).toBe(
      '$60 = $30 subscription + $10 topup + $20 topup; existing subscription + 2 existing topups',
    );
  });
});
