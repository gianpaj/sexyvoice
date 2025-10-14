import type { Locale } from '../i18n/i18n-config';

export const getTopupPackages = (lang: Locale) => {
  const isPromoEnabled = process.env.NEXT_PUBLIC_PROMO_ENABLED === 'true';

  // Get promo bonuses
  const promoBonuses = {
    standard: isPromoEnabled
      ? Number.parseInt(process.env.NEXT_PUBLIC_PROMO_BONUS_STANDARD || '0')
      : 0,
    pro: isPromoEnabled
      ? Number.parseInt(process.env.NEXT_PUBLIC_PROMO_BONUS_PRO || '0')
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
      amount: 0,
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
        return isPromoEnabled ? 12_000 : this.baseCredits; // +20%
      },
      // pricePer1kCredits: isPromoEnabled ? 0.4166 : 0.5,
      amount: 5, // $5.00
    },
    standard: {
      priceId: process.env.STRIPE_TOPUP_10_PRICE_ID,
      baseCredits: 25_000,
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
        return ((this.amount / this.credits) * 1000).toFixed(3); // isPromoEnabled ? $0.308 : $0.4
      },
      promoBonus: promoBonuses.standard.toLocaleString(lang),
      amount: 10, // $10.00
    },
    pro: {
      priceId: process.env.STRIPE_TOPUP_99_PRICE_ID,
      baseCredits: 300_000,
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
        return ((this.amount / this.credits) * 1000).toFixed(3); // isPromoEnabled ? $0.244 : 0.33
      },
      promoBonus: promoBonuses.pro.toLocaleString(lang),
      amount: 99, // $99.00
    },
  } as const;
};

const TOPUP_PACKAGES = getTopupPackages('en');

export type PackageType = keyof typeof TOPUP_PACKAGES;
