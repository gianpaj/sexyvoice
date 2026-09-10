import { describe, expect, test } from 'vitest';

import {
  countPaymentsByUser,
  formatCallSegment,
  formatTopCustomers,
} from '../app/api/daily-stats/utils';

describe('formatCallSegment', () => {
  test('shows duration and average when the segment has calls', () => {
    expect(formatCallSegment(13, 1856, 143)).toBe('13 (30m 56s, avg 2m 23s)');
  });

  test('places the label between the count and the durations', () => {
    expect(formatCallSegment(183, 33_840, 185, 'free')).toBe(
      '183 free (564m 0s, avg 3m 5s)',
    );
  });

  test('hides the zeroed durations when the segment has no calls', () => {
    expect(formatCallSegment(0, 0, 0)).toBe('0');
    expect(formatCallSegment(0, 0, 0, 'paid')).toBe('0 paid');
  });
});

describe('countPaymentsByUser', () => {
  test('counts every payment per user', () => {
    const counts = countPaymentsByUser([
      { user_id: 'a' },
      { user_id: 'b' },
      { user_id: 'a' },
      { user_id: 'a' },
    ]);

    expect(counts.get('a')).toBe(3);
    expect(counts.get('b')).toBe(1);
    expect(counts.get('c')).toBeUndefined();
  });
});

describe('formatTopCustomers', () => {
  test('shows the amount, purchase type and all-time payment count', () => {
    expect(
      formatTopCustomers([
        {
          paymentCount: 12,
          purchases: [{ amount: 75, type: 'existing topup' }],
          username: 'ikreallylongname98@gmail.com',
        },
      ]),
    ).toBe('ikr...e98@gmail.com ($75 - existing topup, 12 payments)');
  });

  test('uses the singular form for a first payment', () => {
    expect(
      formatTopCustomers([
        {
          paymentCount: 1,
          purchases: [{ amount: 10, type: 'new sub' }],
          username: 'matteo070@gmail.com',
        },
      ]),
    ).toBe('mat...070@gmail.com ($10 - new sub, 1 payment)');
  });

  test('collapses same-type purchases and joins mixed ones', () => {
    expect(
      formatTopCustomers([
        {
          paymentCount: 4,
          purchases: [
            { amount: 5, type: 'existing topup' },
            { amount: 5, type: 'existing topup' },
          ],
          username: 'samepaying@proton.me',
        },
        {
          paymentCount: 2,
          purchases: [
            { amount: 5, type: 'existing topup' },
            { amount: 10, type: 'existing sub' },
          ],
          username: 'mixedpaying@proton.me',
        },
      ]),
    ).toBe(
      'sam...ing@proton.me ($5+$5 existing topup, 4 payments), mix...ing@proton.me ($5 existing topup + $10 existing sub, 2 payments)',
    );
  });

  test('falls back to N/A without customers', () => {
    expect(formatTopCustomers([])).toBe('N/A');
  });
});
