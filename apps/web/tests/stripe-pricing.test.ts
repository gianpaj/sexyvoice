import { afterEach, describe, expect, it } from 'vitest';

import { getSubscriptionPackages } from '@/lib/stripe/pricing';

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
