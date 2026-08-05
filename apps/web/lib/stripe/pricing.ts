import type { Locale } from '../i18n/i18n-config';

/**
 * Discount rate of the pro top-up plan vs the standard top-up plan,
 * expressed as a fraction (e.g. 0.375 = 37.5% cheaper per 1k credits).
 * Computed from actual package prices so it stays in sync automatically:
 *   standard: $10 / 25_000 credits = $0.40/1k
 *   pro:      $75 / 300_000 credits = $0.25/1k
 *   discount: (0.40 - 0.25) / 0.40 = 0.375
 */
const STANDARD_TOPUP_DOLLAR_AMOUNT = 10;
const STANDARD_TOPUP_BASE_CREDITS = 25_000;
const PRO_TOPUP_DOLLAR_AMOUNT = 75;
const PRO_TOPUP_BASE_CREDITS = 300_000;

const _standardPricePer1k =
  (STANDARD_TOPUP_DOLLAR_AMOUNT / STANDARD_TOPUP_BASE_CREDITS) * 1000;
const _proPricePer1k =
  (PRO_TOPUP_DOLLAR_AMOUNT / PRO_TOPUP_BASE_CREDITS) * 1000;

export const PRO_TOPUP_DISCOUNT_VS_STANDARD =
  (_standardPricePer1k - _proPricePer1k) / _standardPricePer1k;

/**
 * Subscription bonus multiplier.
 * Subscribers receive 15% more credits than one-time top-up buyers
 * at the same price point, incentivizing recurring revenue.
 */
export const SUBSCRIPTION_BONUS_MULTIPLIER = 1.15;

interface SubscriptionPackageOptions {
  applyFirstMonthDiscount?: boolean;
}

function getFirstMonthSubscriptionDiscountMultiplier({
  applyFirstMonthDiscount,
}: SubscriptionPackageOptions = {}) {
  const hasFirstMonthCoupon =
    !!process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID;
  const shouldApplyFirstMonthDiscount =
    applyFirstMonthDiscount ?? hasFirstMonthCoupon;
  const discountPercent = Number.parseFloat(
    process.env.STRIPE_SUBSCRIPTION_FIRST_MONTH_DISCOUNT_PERCENT || '0',
  );

  if (
    !(shouldApplyFirstMonthDiscount && hasFirstMonthCoupon) ||
    Number.isNaN(discountPercent) ||
    discountPercent <= 0
  ) {
    return 1;
  }

  return Math.max(0, 1 - discountPercent / 100);
}

export const getTopupPackages = (lang: Locale) => {
  const isPromoEnabled = process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true';

  // Get promo bonuses
  const promoBonuses = {
    pro: isPromoEnabled
      ? Number.parseInt(process.env.NEXT_PUBLIC_PROMO_BONUS_PRO || '0', 10)
      : 0,
    standard: isPromoEnabled
      ? Number.parseInt(process.env.NEXT_PUBLIC_PROMO_BONUS_STANDARD || '0', 10)
      : 0,
    starter: isPromoEnabled
      ? Number.parseInt(process.env.NEXT_PUBLIC_PROMO_BONUS_STARTER || '0', 10)
      : 0,
  };

  return {
    free: {
      baseCredits: 10_000,
      get baseCreditsLocale() {
        return Number(this.baseCredits).toLocaleString(lang);
      },
      get credits() {
        return this.baseCredits;
      },
      dollarAmount: 0,
      priceId: '',
    },
    // not shown on landing page, only in /credits page
    starter: {
      baseCredits: 10_000,
      get baseCreditsLocale() {
        return Number(this.baseCredits).toLocaleString(lang);
      },
      // credits to add
      get credits() {
        return isPromoEnabled
          ? this.baseCredits + promoBonuses.starter // 12_000
          : this.baseCredits;
      },
      // pricePer1kCredits: isPromoEnabled ? 0.4166 : 0.5,
      dollarAmount: 5, // $5.00
      priceId: process.env.STRIPE_TOPUP_STARTER_PRICE_ID,
      promoBonus: promoBonuses.starter.toLocaleString(lang),
    },
    standard: {
      baseCredits: STANDARD_TOPUP_BASE_CREDITS,
      get baseCreditsLocale() {
        return Number(this.baseCredits).toLocaleString(lang);
      },
      // credits to add
      get credits() {
        return isPromoEnabled
          ? this.baseCredits + promoBonuses.standard // 32_500
          : this.baseCredits;
      },
      dollarAmount: STANDARD_TOPUP_DOLLAR_AMOUNT, // $10.00
      priceId: process.env.STRIPE_TOPUP_STANDARD_PRICE_ID,
      // pricePer1kCredits: isPromoEnabled ? 0.3076 : 0.4, //
      get pricePer1kCredits() {
        return trimTrailingZeros((this.dollarAmount / this.credits) * 1000); // isPromoEnabled ? $0.308 : $0.4
      },
      promoBonus: promoBonuses.standard.toLocaleString(lang),
    },
    pro: {
      baseCredits: PRO_TOPUP_BASE_CREDITS,
      get baseCreditsLocale() {
        return Number(this.baseCredits).toLocaleString(lang);
      },
      // credits to add
      get credits() {
        return isPromoEnabled
          ? this.baseCredits + promoBonuses.pro // 405_000
          : this.baseCredits;
      },
      dollarAmount: PRO_TOPUP_DOLLAR_AMOUNT, // $75.00
      priceId: process.env.STRIPE_TOPUP_PRO_PRICE_ID,
      // pricePer1kCredits: isPromoEnabled ? 0.2444 : 0.33, // -20.54% : -17.5% from previous plan
      get pricePer1kCredits() {
        return trimTrailingZeros((this.dollarAmount / this.credits) * 1000); // isPromoEnabled ? $0.244 : 0.33
      },
      promoBonus: promoBonuses.pro.toLocaleString(lang),
    },
  } as const;
};

/**
 * Returns subscription packages with 15% bonus credits applied.
 * The bonus stacks with promo bonuses — it is applied to the final
 * credit amount (base + promo) via `Math.round()`.
 *
 * Subscription tiers mirror top-up tiers at the same price points
 * but use separate Stripe recurring price IDs.
 */
export const getSubscriptionPackages = (
  lang: Locale,
  options: SubscriptionPackageOptions = {},
) => {
  const topup = getTopupPackages(lang);
  const firstMonthDiscountMultiplier =
    getFirstMonthSubscriptionDiscountMultiplier(options);

  return {
    starter: {
      baseCredits: topup.starter.baseCredits,
      get baseCreditsLocale() {
        return Number(this.baseCredits).toLocaleString(lang);
      },
      get credits() {
        return Math.round(
          topup.starter.credits * SUBSCRIPTION_BONUS_MULTIPLIER,
        );
      },
      get creditsLocale() {
        return this.credits.toLocaleString(lang);
      },
      dollarAmount: roundCurrency(
        topup.starter.dollarAmount * firstMonthDiscountMultiplier,
      ),
      priceId: process.env.STRIPE_SUBSCRIPTION_STARTER_PRICE_ID,
      promoBonus: topup.starter.promoBonus,
      recurringDollarAmount: topup.starter.dollarAmount,
      get subscriptionBonus() {
        return this.credits - topup.starter.credits;
      },
      get subscriptionBonusLocale() {
        return this.subscriptionBonus.toLocaleString(lang);
      },
    },
    standard: {
      baseCredits: topup.standard.baseCredits,
      get baseCreditsLocale() {
        return Number(this.baseCredits).toLocaleString(lang);
      },
      get credits() {
        return Math.round(
          topup.standard.credits * SUBSCRIPTION_BONUS_MULTIPLIER,
        );
      },
      get creditsLocale() {
        return this.credits.toLocaleString(lang);
      },
      dollarAmount: roundCurrency(
        topup.standard.dollarAmount * firstMonthDiscountMultiplier,
      ),
      priceId: process.env.STRIPE_SUBSCRIPTION_STANDARD_PRICE_ID,
      get pricePer1kCredits() {
        return trimTrailingZeros2((this.dollarAmount / this.credits) * 1000);
      },
      promoBonus: topup.standard.promoBonus,
      recurringDollarAmount: topup.standard.dollarAmount,
      get subscriptionBonus() {
        return this.credits - topup.standard.credits;
      },
      get subscriptionBonusLocale() {
        return this.subscriptionBonus.toLocaleString(lang);
      },
    },
    pro: {
      baseCredits: topup.pro.baseCredits,
      get baseCreditsLocale() {
        return Number(this.baseCredits).toLocaleString(lang);
      },
      get credits() {
        return Math.round(topup.pro.credits * SUBSCRIPTION_BONUS_MULTIPLIER);
      },
      get creditsLocale() {
        return this.credits.toLocaleString(lang);
      },
      dollarAmount: roundCurrency(
        topup.pro.dollarAmount * firstMonthDiscountMultiplier,
      ),
      priceId: process.env.STRIPE_SUBSCRIPTION_PRO_PRICE_ID,
      get pricePer1kCredits() {
        return trimTrailingZeros2((this.dollarAmount / this.credits) * 1000);
      },
      promoBonus: topup.pro.promoBonus,
      recurringDollarAmount: topup.pro.dollarAmount,
      get subscriptionBonus() {
        return this.credits - topup.pro.credits;
      },
      get subscriptionBonusLocale() {
        return this.subscriptionBonus.toLocaleString(lang);
      },
    },
  } as const;
};

/**
 * Maps each subscription Stripe price ID to its full monthly recurring dollar
 * amount (ignoring any first-month discount). Used to compute MRR from the set
 * of active subscriptions. Price IDs that are unset (no env var) are omitted.
 */
export function getSubscriptionMrrByPriceId(): Map<string, number> {
  const packages = getSubscriptionPackages('en');
  const map = new Map<string, number>();
  for (const pkg of Object.values(packages)) {
    if (pkg.priceId) {
      map.set(pkg.priceId, pkg.recurringDollarAmount);
    }
  }
  return map;
}

const TOPUP_PACKAGES = getTopupPackages('en');

export type PackageType = keyof typeof TOPUP_PACKAGES;

function trimTrailingZeros(num: number): string {
  return num.toFixed(3).replace(/\.?0+$/, '');
}

/** 2-decimal variant for subscription pricing (e.g. $0.35 instead of $0.348) */
function trimTrailingZeros2(num: number): string {
  return num.toFixed(2).replace(/\.?0+$/, '');
}

function roundCurrency(num: number): number {
  return Math.round(num * 100) / 100;
}
