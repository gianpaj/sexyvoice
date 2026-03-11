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

export const getTopupPackages = (lang: Locale) => {
  const isPromoEnabled = process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true';

  // Get promo bonuses
  const promoBonuses = {
    starter: isPromoEnabled
      ? Number.parseInt(process.env.NEXT_PUBLIC_PROMO_BONUS_STARTER || '0', 10)
      : 0,
    standard: isPromoEnabled
      ? Number.parseInt(process.env.NEXT_PUBLIC_PROMO_BONUS_STANDARD || '0', 10)
      : 0,
    pro: isPromoEnabled
      ? Number.parseInt(process.env.NEXT_PUBLIC_PROMO_BONUS_PRO || '0', 10)
      : 0,
  };

  return {
    free: {
      priceId: '',
      baseCredits: 10_000,
      get baseCreditsLocale() {
        return Number(this.baseCredits).toLocaleString(lang);
      },
      get credits() {
        return this.baseCredits;
      },
      dollarAmount: 0,
    },
    // not shown on landing page, only in /credits page
    starter: {
      priceId: process.env.STRIPE_TOPUP_5_PRICE_ID,
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
      promoBonus: promoBonuses.starter.toLocaleString(lang),
      // pricePer1kCredits: isPromoEnabled ? 0.4166 : 0.5,
      dollarAmount: 5, // $5.00
    },
    standard: {
      priceId: process.env.STRIPE_TOPUP_10_PRICE_ID,
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
      // pricePer1kCredits: isPromoEnabled ? 0.3076 : 0.4, //
      get pricePer1kCredits() {
        return trimTrailingZeros((this.dollarAmount / this.credits) * 1000); // isPromoEnabled ? $0.308 : $0.4
      },
      promoBonus: promoBonuses.standard.toLocaleString(lang),
      dollarAmount: STANDARD_TOPUP_DOLLAR_AMOUNT, // $10.00
    },
    pro: {
      priceId: process.env.STRIPE_TOPUP_99_PRICE_ID,
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
      // pricePer1kCredits: isPromoEnabled ? 0.2444 : 0.33, // -20.54% : -17.5% from previous plan
      get pricePer1kCredits() {
        return trimTrailingZeros((this.dollarAmount / this.credits) * 1000); // isPromoEnabled ? $0.244 : 0.33
      },
      promoBonus: promoBonuses.pro.toLocaleString(lang),
      dollarAmount: PRO_TOPUP_DOLLAR_AMOUNT, // $75.00
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
export const getSubscriptionPackages = (lang: Locale) => {
  const topup = getTopupPackages(lang);

  return {
    starter: {
      priceId: process.env.STRIPE_SUBSCRIPTION_5_PRICE_ID,
      baseCredits: topup.starter.baseCredits,
      get baseCreditsLocale() {
        return Number(this.baseCredits).toLocaleString(lang);
      },
      get credits() {
        return Math.round(
          topup.starter.credits * SUBSCRIPTION_BONUS_MULTIPLIER,
        );
      },
      get subscriptionBonus() {
        return this.credits - topup.starter.credits;
      },
      get subscriptionBonusLocale() {
        return this.subscriptionBonus.toLocaleString(lang);
      },
      get creditsLocale() {
        return this.credits.toLocaleString(lang);
      },
      promoBonus: topup.starter.promoBonus,
      dollarAmount: topup.starter.dollarAmount,
    },
    standard: {
      priceId: process.env.STRIPE_SUBSCRIPTION_10_PRICE_ID,
      baseCredits: topup.standard.baseCredits,
      get baseCreditsLocale() {
        return Number(this.baseCredits).toLocaleString(lang);
      },
      get credits() {
        return Math.round(
          topup.standard.credits * SUBSCRIPTION_BONUS_MULTIPLIER,
        );
      },
      get subscriptionBonus() {
        return this.credits - topup.standard.credits;
      },
      get subscriptionBonusLocale() {
        return this.subscriptionBonus.toLocaleString(lang);
      },
      get creditsLocale() {
        return this.credits.toLocaleString(lang);
      },
      get pricePer1kCredits() {
        return trimTrailingZeros2((this.dollarAmount / this.credits) * 1000);
      },
      promoBonus: topup.standard.promoBonus,
      dollarAmount: topup.standard.dollarAmount,
    },
    pro: {
      priceId: process.env.STRIPE_SUBSCRIPTION_99_PRICE_ID,
      baseCredits: topup.pro.baseCredits,
      get baseCreditsLocale() {
        return Number(this.baseCredits).toLocaleString(lang);
      },
      get credits() {
        return Math.round(topup.pro.credits * SUBSCRIPTION_BONUS_MULTIPLIER);
      },
      get subscriptionBonus() {
        return this.credits - topup.pro.credits;
      },
      get subscriptionBonusLocale() {
        return this.subscriptionBonus.toLocaleString(lang);
      },
      get creditsLocale() {
        return this.credits.toLocaleString(lang);
      },
      get pricePer1kCredits() {
        return trimTrailingZeros2((this.dollarAmount / this.credits) * 1000);
      },
      promoBonus: topup.pro.promoBonus,
      dollarAmount: topup.pro.dollarAmount,
    },
  } as const;
};

const TOPUP_PACKAGES = getTopupPackages('en');

export type PackageType = keyof typeof TOPUP_PACKAGES;

function trimTrailingZeros(num: number): string {
  return num.toFixed(3).replace(/\.?0+$/, '');
}

/** 2-decimal variant for subscription pricing (e.g. $0.35 instead of $0.348) */
function trimTrailingZeros2(num: number): string {
  return num.toFixed(2).replace(/\.?0+$/, '');
}
