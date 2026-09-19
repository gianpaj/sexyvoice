import { afterEach, describe, expect, it } from 'vitest';

import {
  CUSTOM_TOPUP_MAX_CREDITS,
  CUSTOM_TOPUP_MIN_CREDITS,
  calculateCustomTopupCents,
  calculateCustomTopupDollarAmount,
  getSubscriptionPackages,
  validateCustomCreditAmount,
} from '@/lib/stripe/pricing';

describe('subscription pricing', () => {
  const originalCouponId =
    process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID;
  const originalDiscountPercent =
    process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_DISCOUNT_PERCENT;

  afterEach(() => {
    if (originalCouponId === undefined) {
      delete process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID;
    } else {
      process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID = originalCouponId;
    }

    if (originalDiscountPercent === undefined) {
      delete process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_DISCOUNT_PERCENT;
    } else {
      process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_DISCOUNT_PERCENT =
        originalDiscountPercent;
    }
  });

  it('ignores first-month discount percent when no coupon is configured', () => {
    delete process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID;
    process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_DISCOUNT_PERCENT = '25';

    const packages = getSubscriptionPackages('en');

    expect(packages.starter.dollarAmount).toBe(5);
    expect(packages.standard.dollarAmount).toBe(10);
    expect(packages.pro.dollarAmount).toBe(75);
  });

  it('applies first-month discount only when coupon and positive percent are configured', () => {
    process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID = 'coupon_25_off';
    process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_DISCOUNT_PERCENT = '25';

    const packages = getSubscriptionPackages('en');

    expect(packages.starter.dollarAmount).toBe(3.75);
    expect(packages.standard.dollarAmount).toBe(7.5);
    expect(packages.pro.dollarAmount).toBe(56.25);
    expect(packages.starter.recurringDollarAmount).toBe(5);
    expect(packages.standard.recurringDollarAmount).toBe(10);
    expect(packages.pro.recurringDollarAmount).toBe(75);
  });

  it('can explicitly disable first-month discount pricing', () => {
    process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID = 'coupon_25_off';
    process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_DISCOUNT_PERCENT = '25';

    const packages = getSubscriptionPackages('en', {
      applyFirstMonthDiscount: false,
    });

    expect(packages.starter.dollarAmount).toBe(5);
    expect(packages.standard.dollarAmount).toBe(10);
    expect(packages.pro.dollarAmount).toBe(75);
  });

  it('does not apply invalid first-month discount percentages', () => {
    process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID = 'coupon_invalid';
    process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_DISCOUNT_PERCENT = 'invalid';

    const packages = getSubscriptionPackages('en');

    expect(packages.starter.dollarAmount).toBe(5);
    expect(packages.standard.dollarAmount).toBe(10);
    expect(packages.pro.dollarAmount).toBe(75);
  });
});

describe('custom top-up pricing', () => {
  it('snaps amounts to the credit step', () => {
    expect(validateCustomCreditAmount(12_000)).toBe(12_000);
    expect(validateCustomCreditAmount(12_100)).toBe(12_000);
    expect(validateCustomCreditAmount(12_400)).toBe(12_500);
  });

  it('clamps amounts outside the allowed range', () => {
    expect(validateCustomCreditAmount(0)).toBe(CUSTOM_TOPUP_MIN_CREDITS);
    expect(validateCustomCreditAmount(-5000)).toBe(CUSTOM_TOPUP_MIN_CREDITS);
    expect(validateCustomCreditAmount(4999)).toBe(CUSTOM_TOPUP_MIN_CREDITS);
    expect(validateCustomCreditAmount(CUSTOM_TOPUP_MAX_CREDITS + 1000)).toBe(
      CUSTOM_TOPUP_MAX_CREDITS,
    );
  });

  it('falls back to the minimum for non-numeric amounts', () => {
    expect(validateCustomCreditAmount(Number.NaN)).toBe(
      CUSTOM_TOPUP_MIN_CREDITS,
    );
    expect(validateCustomCreditAmount(Number.POSITIVE_INFINITY)).toBe(
      CUSTOM_TOPUP_MIN_CREDITS,
    );
  });

  it('prices custom top-ups at the starter rate in whole cents', () => {
    // $0.50 per 1k credits — the starter package rate.
    expect(calculateCustomTopupCents(CUSTOM_TOPUP_MIN_CREDITS)).toBe(250);
    expect(calculateCustomTopupCents(10_000)).toBe(500);
    expect(calculateCustomTopupCents(12_500)).toBe(625);
    expect(Number.isInteger(calculateCustomTopupCents(97_500))).toBe(true);
  });

  it('prices the validated amount, not the requested one', () => {
    expect(calculateCustomTopupCents(1)).toBe(
      calculateCustomTopupCents(CUSTOM_TOPUP_MIN_CREDITS),
    );
    expect(calculateCustomTopupDollarAmount(12_500)).toBe(6.25);
  });
});
