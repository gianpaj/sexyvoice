import { describe, expect, test } from 'vitest';

import {
  CHARGEBACK_HOLD_REASON,
  CHARGEBACK_RELEASE_REASON,
  classifyRefund,
} from '../app/api/daily-stats/utils';

describe('classifyRefund', () => {
  test('cash refund (dollarAmount, no reason) is a genuine refund', () => {
    expect(
      classifyRefund({ metadata: { dollarAmount: -75, priceId: 'price_x' } }),
    ).toBe('refund');
  });

  test('platform-bug credit refund (reason set, no dollarAmount) is a genuine refund', () => {
    expect(classifyRefund({ metadata: { reason: 'Platform bug' } })).toBe(
      'refund',
    );
  });

  test('chargeback freeze row is classified as a hold, not a refund', () => {
    expect(
      classifyRefund({
        metadata: {
          disputedPaymentIntent: 'pi_123',
          previousBalance: 223_598,
          reason: CHARGEBACK_HOLD_REASON,
        },
      }),
    ).toBe('chargeback_hold');
  });

  test('chargeback release row (dispute won) is classified as a release', () => {
    expect(
      classifyRefund({
        metadata: {
          disputedPaymentIntent: 'pi_123',
          reason: CHARGEBACK_RELEASE_REASON,
        },
      }),
    ).toBe('chargeback_release');
  });

  test('missing or malformed metadata falls back to genuine refund', () => {
    expect(classifyRefund({ metadata: null })).toBe('refund');
    expect(classifyRefund({ metadata: 'nope' as unknown as null })).toBe(
      'refund',
    );
    expect(classifyRefund({ metadata: {} })).toBe('refund');
  });
});
